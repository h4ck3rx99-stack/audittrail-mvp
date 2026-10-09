"use client";

import * as React from "react";
import { SubmitButton, useActionForm } from "@/components/app/actions";
import { Checkbox, Field, FormError, Input, Select, Textarea } from "@/components/ui/form-controls";
import { createControlAction } from "../actions";
import {
  PRIORITIES,
  PRIORITY_LABELS,
  REVIEW_FREQUENCIES,
  REVIEW_FREQUENCY_LABELS,
} from "../schemas";

type Req = { id: string; code: string; title: string; group: string };

export function CreateControlForm({
  orgSlug,
  suggestedCode,
  requirements,
  members,
}: {
  orgSlug: string;
  suggestedCode: string;
  requirements: Req[];
  members: { id: string; name: string }[];
}) {
  const { formAction, fieldErrors, formError } = useActionForm(
    createControlAction.bind(null, orgSlug),
  );
  const [filter, setFilter] = React.useState("");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const groups = React.useMemo(() => {
    const map = new Map<string, Req[]>();
    for (const r of requirements) {
      if (filter && !`${r.code} ${r.title}`.toLowerCase().includes(filter.toLowerCase())) continue;
      map.set(r.group, [...(map.get(r.group) ?? []), r]);
    }
    return [...map.entries()];
  }, [requirements, filter]);

  return (
    <form action={formAction} className="grid gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        <FormError message={formError} />
        <div className="grid grid-cols-3 gap-3">
          <Field label="Code" htmlFor="code" errors={fieldErrors?.code} hint="Suggested next code.">
            <Input
              name="code"
              defaultValue={suggestedCode}
              className="mono"
              maxLength={20}
              required
            />
          </Field>
          <Field
            label="Domain"
            htmlFor="domain"
            errors={fieldErrors?.domain}
            className="col-span-2"
            optional
          >
            <Input name="domain" maxLength={50} placeholder="e.g. AC" />
          </Field>
        </div>
        <Field label="Name" htmlFor="name" errors={fieldErrors?.name}>
          <Input name="name" maxLength={200} required />
        </Field>
        <Field
          label="Description"
          htmlFor="description"
          errors={fieldErrors?.description}
          hint="What the control does and how it reduces risk."
        >
          <Textarea name="description" maxLength={4000} className="min-h-28" required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Priority" htmlFor="priority" errors={fieldErrors?.priority}>
            <Select name="priority" defaultValue="MEDIUM">
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Review frequency"
            htmlFor="reviewFrequency"
            errors={fieldErrors?.reviewFrequency}
          >
            <Select name="reviewFrequency" defaultValue="ANNUALLY">
              {REVIEW_FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {REVIEW_FREQUENCY_LABELS[f]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Owner" htmlFor="ownerId" errors={fieldErrors?.ownerId} optional>
          <Select name="ownerId" defaultValue="">
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </Field>
        <SubmitButton className="self-start">Create control</SubmitButton>
      </div>
      <fieldset className="flex min-h-0 flex-col gap-2">
        <legend className="text-[13px] font-medium">
          Mapped requirements{" "}
          <span className="text-muted-foreground font-normal">({selected.size} selected)</span>
        </legend>
        <Input
          placeholder="Filter requirements…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Filter requirements"
        />
        {[...selected].map((id) => (
          <input key={id} type="hidden" name="requirementIds" value={id} />
        ))}
        <div className="border-border max-h-[480px] overflow-y-auto rounded-md border">
          {groups.length === 0 ? (
            <p className="text-muted-foreground px-3 py-4 text-[13px]">No requirements match.</p>
          ) : (
            groups.map(([group, reqs]) => (
              <div key={group}>
                <p className="bg-subtle text-muted-foreground sticky top-0 px-3 py-1.5 text-xs font-medium">
                  {group}
                </p>
                {reqs.map((r) => (
                  <label
                    key={r.id}
                    className="border-border hover:bg-hover flex cursor-pointer items-start gap-2 border-b px-3 py-1.5 text-[13px] last:border-0"
                  >
                    <Checkbox
                      className="mt-0.5"
                      checked={selected.has(r.id)}
                      onChange={() =>
                        setSelected((s) => {
                          const n = new Set(s);
                          if (n.has(r.id)) n.delete(r.id);
                          else n.add(r.id);
                          return n;
                        })
                      }
                    />
                    <span>
                      <span className="mono text-muted-foreground mr-1.5">{r.code}</span>
                      {r.title}
                    </span>
                  </label>
                ))}
              </div>
            ))
          )}
        </div>
        {fieldErrors?.requirementIds ? (
          <p className="text-danger text-xs">{fieldErrors.requirementIds.join(" ")}</p>
        ) : null}
      </fieldset>
    </form>
  );
}
