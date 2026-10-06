"use client";

import * as React from "react";
import { Pencil } from "lucide-react";
import { SubmitButton, useActionForm } from "@/components/app/actions";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/form-controls";
import { Dialog, DialogTrigger, SheetContent } from "@/components/ui/overlays";
import { changeRiskStatusAction, createRiskAction, updateRiskAction } from "../actions";
import { RESOLVED_RISK_STATUSES, RISK_KINDS, RISK_KIND_LABELS, RISK_STATUSES, RISK_STATUS_LABELS } from "../schemas";
import { PRIORITIES, PRIORITY_LABELS } from "@/features/controls/schemas";

type Options = { members: { id: string; name: string }[]; controls: { id: string; code: string; name: string }[] };

type RiskValues = {
  title?: string;
  description?: string | null;
  kind?: string;
  severity?: string;
  ownerId?: string | null;
  dueDate?: string | null;
  treatmentPlan?: string | null;
  controlIds?: string[];
};

function RiskFields({ values, options, fieldErrors }: { values: RiskValues; options: Options; fieldErrors?: Record<string, string[]> }) {
  const [controls, setControls] = React.useState<string[]>(values.controlIds ?? []);
  const [pick, setPick] = React.useState("");
  const byId = new Map(options.controls.map((c) => [c.id, c]));
  return (
    <>
      <Field label="Title" htmlFor="rk-title" errors={fieldErrors?.title}>
        <Input name="title" defaultValue={values.title} maxLength={200} />
      </Field>
      <Field label="Description" htmlFor="rk-description" errors={fieldErrors?.description} optional>
        <Textarea name="description" defaultValue={values.description ?? ""} maxLength={10000} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Kind" htmlFor="rk-kind" errors={fieldErrors?.kind}>
          <Select name="kind" defaultValue={values.kind ?? "RISK"}>
            {RISK_KINDS.map((k) => (
              <option key={k} value={k}>
                {RISK_KIND_LABELS[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Severity" htmlFor="rk-severity" errors={fieldErrors?.severity}>
          <Select name="severity" defaultValue={values.severity ?? "MEDIUM"}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Owner" htmlFor="rk-owner" errors={fieldErrors?.ownerId} optional>
          <Select name="ownerId" defaultValue={values.ownerId ?? ""}>
            <option value="">Unassigned</option>
            {options.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Due date" htmlFor="rk-due" errors={fieldErrors?.dueDate} optional>
          <Input name="dueDate" type="date" defaultValue={values.dueDate ?? ""} />
        </Field>
      </div>
      <Field label="Treatment plan" htmlFor="rk-plan" errors={fieldErrors?.treatmentPlan} optional hint="How the risk will be reduced, transferred or accepted.">
        <Textarea name="treatmentPlan" defaultValue={values.treatmentPlan ?? ""} maxLength={10000} />
      </Field>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium">Linked controls</span>
        {controls.map((id) => (
          <input key={id} type="hidden" name="controlIds" value={id} />
        ))}
        <div className="flex flex-wrap gap-1">
          {controls.map((id) => (
            <button key={id} type="button" className="mono rounded-sm border border-border px-1.5 text-[11px] hover:border-danger" onClick={() => setControls(controls.filter((x) => x !== id))} aria-label={`Remove ${byId.get(id)?.code}`}>
              {byId.get(id)?.code} ×
            </button>
          ))}
          {controls.length === 0 ? <span className="text-xs text-faint-foreground">None</span> : null}
        </div>
        <div className="flex gap-2">
          <Select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Add a control" className="flex-1">
            <option value="">Add a control…</option>
            {options.controls
              .filter((c) => !controls.includes(c.id))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} · {c.name}
                </option>
              ))}
          </Select>
          <Button type="button" disabled={!pick} onClick={() => { setControls([...controls, pick]); setPick(""); }}>
            Add
          </Button>
        </div>
      </div>
    </>
  );
}

export function CreateRiskForm({ orgSlug, options, prefill }: { orgSlug: string; options: Options; prefill: RiskValues & { gapKey?: string } }) {
  const { formAction, fieldErrors, formError } = useActionForm(createRiskAction.bind(null, orgSlug));
  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-3">
      <FormError message={formError} />
      {prefill.gapKey ? <input type="hidden" name="gapKey" value={prefill.gapKey} /> : null}
      <RiskFields values={prefill} options={options} fieldErrors={fieldErrors} />
      <SubmitButton className="self-start">Create risk</SubmitButton>
    </form>
  );
}

export function EditRiskButton({ orgSlug, riskId, values, options }: { orgSlug: string; riskId: string; values: RiskValues; options: Options }) {
  const [open, setOpen] = React.useState(false);
  const { formAction, fieldErrors, formError } = useActionForm(updateRiskAction.bind(null, orgSlug, riskId), { success: "Risk updated", onSuccess: () => setOpen(false) });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Pencil />
          Edit
        </Button>
      </DialogTrigger>
      <SheetContent title="Edit risk">
        <form action={formAction} className="flex flex-col gap-3">
          <FormError message={formError} />
          <RiskFields values={values} options={options} fieldErrors={fieldErrors} />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton>Save</SubmitButton>
          </div>
        </form>
      </SheetContent>
    </Dialog>
  );
}

export function RiskStatusForm({ orgSlug, riskId, status, canAccept }: { orgSlug: string; riskId: string; status: string; canAccept: boolean }) {
  const [value, setValue] = React.useState(status);
  const { formAction, fieldErrors } = useActionForm(changeRiskStatusAction.bind(null, orgSlug, riskId), { success: "Risk status updated" });
  const resolving = (RESOLVED_RISK_STATUSES as readonly string[]).includes(value);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <Select name="status" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Risk status" className="h-7">
        {RISK_STATUSES.filter((s) => s !== "ACCEPTED" || canAccept || status === "ACCEPTED").map((s) => (
          <option key={s} value={s}>
            {RISK_STATUS_LABELS[s]}
          </option>
        ))}
      </Select>
      {!canAccept ? <p className="text-xs text-muted-foreground">Accepting a risk is a management decision reserved for Owners and Admins.</p> : null}
      {value !== status && resolving ? (
        <Field label="Resolution notes" htmlFor="rk-resolution" errors={fieldErrors?.resolutionNotes} hint="Required: explain how the risk was resolved or why it is accepted.">
          <Textarea name="resolutionNotes" maxLength={10000} />
        </Field>
      ) : null}
      {value !== status ? (
        <SubmitButton size="sm" className="self-start">
          Update status
        </SubmitButton>
      ) : null}
    </form>
  );
}
