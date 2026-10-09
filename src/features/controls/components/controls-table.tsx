"use client";

import * as React from "react";
import Link from "next/link";
import { CheckSquare } from "lucide-react";
import {
  Person,
  DueDate,
  SortHeader,
  Table,
  TableWrap,
  Td,
  Th,
  THead,
  Tr,
  makeQueryHref,
} from "@/components/app/primitives";
import { CONTROL_STATUS, HEALTH, PRIORITY, Status } from "@/components/app/status";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/form-controls";
import { Dialog, DialogContent } from "@/components/ui/overlays";
import { SubmitButton, useActionForm } from "@/components/app/actions";
import { cn } from "@/lib/utils";
import type { DateOnly } from "@/lib/dates";
import { bulkControlsAction } from "../actions";
import { CONTROL_STATUSES, CONTROL_STATUS_LABELS } from "../schemas";

export type ControlRow = {
  id: string;
  code: string;
  name: string;
  status: string;
  priority: string;
  ownerName: string | null;
  health: string;
  evidence: { satisfied: number; total: number };
  nextReviewDate: DateOnly | null;
  reviewOverdue: boolean;
  criteria: string[];
  archived: boolean;
  applicable: boolean;
};

export function ControlsTable({
  rows,
  today,
  orgSlug,
  selectable,
  members,
  query,
}: {
  rows: ControlRow[];
  today: DateOnly;
  orgSlug: string;
  selectable: boolean;
  members: { id: string; name: string }[];
  query: Record<string, string | undefined>;
}) {
  const hrefFor = makeQueryHref(`/org/${orgSlug}/controls`, query);
  const sort = query.sort ?? "code";
  const dir = query.dir === "desc" ? "desc" : "asc";
  const sortHeader = (label: string, field: string, className?: string) => (
    <SortHeader
      label={label}
      field={field}
      sort={sort}
      dir={dir}
      className={className}
      href={(f, d) => hrefFor({ sort: f, dir: d, page: null })}
    />
  );
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [bulk, setBulk] = React.useState<"owner" | "status" | null>(null);
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <>
      {selectable && selected.size > 0 ? (
        <div
          className="border-accent bg-accent-subtle mb-2 flex items-center gap-2 rounded-md border px-3 py-1.5 text-[13px]"
          role="region"
          aria-label="Bulk actions"
        >
          <CheckSquare className="text-accent size-4" aria-hidden />
          <span>{selected.size} selected</span>
          <Button size="sm" onClick={() => setBulk("owner")}>
            Assign owner
          </Button>
          <Button size="sm" onClick={() => setBulk("status")}>
            Change status
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      ) : null}
      <TableWrap>
        <Table>
          <THead>
            <tr>
              {selectable ? (
                <Th className="w-8">
                  <Checkbox
                    aria-label="Select all controls on this page"
                    checked={allSelected}
                    onChange={() =>
                      setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))
                    }
                  />
                </Th>
              ) : null}
              {sortHeader("Code", "code", "w-24")}
              {sortHeader("Name", "name")}
              <Th>Criteria</Th>
              {sortHeader("Owner", "owner")}
              {sortHeader("Status", "status")}
              {sortHeader("Health", "health")}
              {sortHeader("Evidence", "evidence")}
              {sortHeader("Next review", "nextReview")}
              {sortHeader("Priority", "priority")}
            </tr>
          </THead>
          <tbody>
            {rows.map((r) => (
              <Tr key={r.id} className={cn(r.archived && "opacity-60")}>
                {selectable ? (
                  <Td>
                    <Checkbox
                      aria-label={`Select ${r.code}`}
                      checked={selected.has(r.id)}
                      onChange={() => toggle(r.id)}
                      disabled={r.archived}
                    />
                  </Td>
                ) : null}
                <Td className="mono text-muted-foreground whitespace-nowrap">{r.code}</Td>
                <Td className="max-w-80">
                  <Link
                    href={`/org/${orgSlug}/controls/${r.id}`}
                    className="block truncate font-medium hover:underline"
                  >
                    {r.name}
                  </Link>
                  {r.archived ? (
                    <span className="text-muted-foreground text-xs">Archived</span>
                  ) : null}
                </Td>
                <Td className="max-w-48">
                  <div className="flex gap-1 whitespace-nowrap">
                    {r.criteria.slice(0, 3).map((c) => (
                      <span
                        key={c}
                        className="mono border-border text-muted-foreground rounded-sm border px-1 text-[11px]"
                      >
                        {c}
                      </span>
                    ))}
                    {r.criteria.length > 3 ? (
                      <span className="text-muted-foreground text-[11px]">
                        +{r.criteria.length - 3}
                      </span>
                    ) : null}
                  </div>
                </Td>
                <Td className="max-w-40">
                  <Person name={r.ownerName} />
                </Td>
                <Td>
                  <Status map={CONTROL_STATUS} value={r.status} text />
                </Td>
                <Td>
                  <Status map={HEALTH} value={r.health} text />
                </Td>
                <Td className="whitespace-nowrap tabular-nums">
                  {r.evidence.total === 0 ? (
                    <span className="text-faint-foreground">None required</span>
                  ) : (
                    <span
                      className={cn(r.evidence.satisfied < r.evidence.total && "text-foreground")}
                    >
                      {r.evidence.satisfied}/{r.evidence.total} required
                    </span>
                  )}
                </Td>
                <Td>
                  <DueDate date={r.nextReviewDate} today={today} done={!r.applicable} />
                </Td>
                <Td>
                  <Status map={PRIORITY} value={r.priority} text />
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>
      {bulk ? (
        <BulkDialog
          mode={bulk}
          orgSlug={orgSlug}
          ids={[...selected]}
          members={members}
          onClose={(done) => {
            setBulk(null);
            if (done) setSelected(new Set());
          }}
        />
      ) : null}
    </>
  );
}

function BulkDialog({
  mode,
  orgSlug,
  ids,
  members,
  onClose,
}: {
  mode: "owner" | "status";
  orgSlug: string;
  ids: string[];
  members: { id: string; name: string }[];
  onClose: (done: boolean) => void;
}) {
  const [status, setStatus] = React.useState("IN_PROGRESS");
  const { formAction, fieldErrors } = useActionForm(bulkControlsAction.bind(null, orgSlug), {
    success: (d) => `${d.updated} ${d.updated === 1 ? "control" : "controls"} updated`,
    onSuccess: () => onClose(true),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose(false)}>
      <DialogContent
        title={
          mode === "owner"
            ? `Assign owner to ${ids.length} controls`
            : `Change status of ${ids.length} controls`
        }
        description="Each control gets its own audit event, linked by a shared correlation ID."
      >
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="operation" value={mode} />
          {ids.map((id) => (
            <input key={id} type="hidden" name="controlIds" value={id} />
          ))}
          {mode === "owner" ? (
            <Field label="Owner" htmlFor="bulk-owner" errors={fieldErrors?.ownerId}>
              <Select name="ownerId" defaultValue="">
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <>
              <Field label="Status" htmlFor="bulk-status" errors={fieldErrors?.status}>
                <Select name="status" value={status} onChange={(e) => setStatus(e.target.value)}>
                  {CONTROL_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {CONTROL_STATUS_LABELS[s]}
                    </option>
                  ))}
                </Select>
              </Field>
              {status === "NOT_APPLICABLE" ? (
                <Field
                  label="Justification"
                  htmlFor="bulk-reason"
                  errors={fieldErrors?.notApplicableReason}
                  hint="Auditors will ask why these controls do not apply."
                >
                  <Input name="notApplicableReason" maxLength={2000} />
                </Field>
              ) : null}
            </>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={() => onClose(false)}>
              Cancel
            </Button>
            <SubmitButton>Apply to {ids.length}</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
