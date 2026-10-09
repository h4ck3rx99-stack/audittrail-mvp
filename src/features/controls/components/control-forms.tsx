"use client";

import * as React from "react";
import Link from "next/link";
import { Link2, Pencil, Plus, Upload } from "lucide-react";
import { toast } from "sonner";
import { ActionButton, SubmitButton, useActionForm } from "@/components/app/actions";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormError, Input, Select, Textarea } from "@/components/ui/form-controls";
import { Dialog, DialogContent, DialogTrigger, SheetContent } from "@/components/ui/overlays";
import { Tooltip } from "@/components/ui/overlays";
import { addMonths, type DateOnly } from "@/lib/dates";
import {
  archiveEvidenceRequirementAction,
  assignControlOwnerAction,
  createEvidenceRequirementAction,
  mapRequirementAction,
  recordReviewAction,
  setNextReviewDateAction,
  updateControlDefinitionAction,
  updateControlNotesAction,
  updateControlStatusAction,
  updateEvidenceRequirementAction,
} from "../actions";
import { linkEvidenceAction, unlinkEvidenceAction } from "@/features/evidence/actions";
import {
  CONTROL_STATUSES,
  CONTROL_STATUS_LABELS,
  PRIORITIES,
  PRIORITY_LABELS,
  REVIEW_FREQUENCIES,
  REVIEW_FREQUENCY_LABELS,
  REVIEW_OUTCOMES,
  REVIEW_OUTCOME_LABELS,
} from "../schemas";
import { REVIEW_FREQUENCY_MONTHS } from "@/features/readiness/engine";

type Ids = { orgSlug: string; controlId: string; version: number };

export function StatusEditor({
  orgSlug,
  controlId,
  version,
  status,
  reason,
  disabledReason,
}: Ids & { status: string; reason: string | null; disabledReason: string | null }) {
  const [value, setValue] = React.useState(status);
  const { formAction, fieldErrors } = useActionForm(
    updateControlStatusAction.bind(null, orgSlug, controlId),
    { success: "Status updated" },
  );
  if (disabledReason) {
    return (
      <Tooltip content={disabledReason}>
        <span tabIndex={0} className="text-[13px]">
          {CONTROL_STATUS_LABELS[status as keyof typeof CONTROL_STATUS_LABELS]}
        </span>
      </Tooltip>
    );
  }
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="version" value={version} />
      <Select
        name="status"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label="Status"
        className="h-7"
      >
        {CONTROL_STATUSES.map((s) => (
          <option key={s} value={s}>
            {CONTROL_STATUS_LABELS[s]}
          </option>
        ))}
      </Select>
      {value === "NOT_APPLICABLE" ? (
        <Field label="Justification" htmlFor="na-reason" errors={fieldErrors?.notApplicableReason}>
          <Textarea
            name="notApplicableReason"
            defaultValue={reason ?? ""}
            maxLength={2000}
            className="min-h-16"
          />
        </Field>
      ) : null}
      {value !== status || value === "NOT_APPLICABLE" ? (
        <SubmitButton size="sm" className="self-start">
          Save status
        </SubmitButton>
      ) : null}
    </form>
  );
}

export function OwnerSelect({
  orgSlug,
  controlId,
  version,
  ownerId,
  members,
}: Ids & { ownerId: string | null; members: { id: string; name: string }[] }) {
  const [pending, start] = React.useTransition();
  return (
    <Select
      aria-label="Owner"
      className="h-7"
      value={ownerId ?? ""}
      disabled={pending}
      onChange={(e) =>
        start(async () => {
          const r = await assignControlOwnerAction(
            orgSlug,
            controlId,
            e.target.value || null,
            version,
          );
          if (r.ok) toast.success("Owner updated");
          else toast.error(r.error.message);
        })
      }
    >
      <option value="">Unassigned</option>
      {members.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
        </option>
      ))}
    </Select>
  );
}

export function NextReviewEditor({
  orgSlug,
  controlId,
  version,
  nextReviewDate,
}: Ids & { nextReviewDate: DateOnly | null }) {
  const { formAction, fieldErrors } = useActionForm(
    setNextReviewDateAction.bind(null, orgSlug, controlId),
    { success: "Next review date updated" },
  );
  return (
    <form action={formAction} className="flex items-center gap-1.5">
      <input type="hidden" name="version" value={version} />
      <Input
        type="date"
        name="nextReviewDate"
        defaultValue={nextReviewDate ?? ""}
        className="h-7 w-36"
        aria-label="Next review date"
        aria-invalid={fieldErrors?.nextReviewDate ? true : undefined}
      />
      <SubmitButton size="sm" variant="secondary">
        Set
      </SubmitButton>
    </form>
  );
}

export function NotesForm({
  orgSlug,
  controlId,
  version,
  implementationNotes,
  notes,
}: Ids & { implementationNotes: string | null; notes: string | null }) {
  const { formAction, fieldErrors } = useActionForm(
    updateControlNotesAction.bind(null, orgSlug, controlId),
    { success: "Notes saved" },
  );
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="version" value={version} />
      <Field
        label="Implementation notes"
        htmlFor="implementationNotes"
        errors={fieldErrors?.implementationNotes}
        hint="How this control is operated in your environment."
      >
        <Textarea
          name="implementationNotes"
          defaultValue={implementationNotes ?? ""}
          maxLength={10000}
          className="min-h-28"
        />
      </Field>
      <Field label="Notes" htmlFor="notes" errors={fieldErrors?.notes} optional>
        <Textarea name="notes" defaultValue={notes ?? ""} maxLength={10000} />
      </Field>
      <SubmitButton className="self-start">Save notes</SubmitButton>
    </form>
  );
}

export function EditDefinitionButton({
  orgSlug,
  controlId,
  version,
  control,
}: Ids & {
  control: {
    code: string;
    name: string;
    description: string;
    domain: string | null;
    priority: string;
    reviewFrequency: string;
  };
}) {
  const [open, setOpen] = React.useState(false);
  const { formAction, fieldErrors, formError } = useActionForm(
    updateControlDefinitionAction.bind(null, orgSlug, controlId),
    {
      success: "Control updated",
      onSuccess: () => setOpen(false),
    },
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Pencil />
          Edit
        </Button>
      </DialogTrigger>
      <SheetContent
        title="Edit control"
        description="Changes are recorded in the audit log with a before and after diff."
      >
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="version" value={version} />
          <FormError message={formError} />
          <div className="grid grid-cols-3 gap-3">
            <Field label="Code" htmlFor="ed-code" errors={fieldErrors?.code}>
              <Input name="code" defaultValue={control.code} className="mono" maxLength={20} />
            </Field>
            <Field
              label="Domain"
              htmlFor="ed-domain"
              errors={fieldErrors?.domain}
              className="col-span-2"
              optional
            >
              <Input name="domain" defaultValue={control.domain ?? ""} maxLength={50} />
            </Field>
          </div>
          <Field label="Name" htmlFor="ed-name" errors={fieldErrors?.name}>
            <Input name="name" defaultValue={control.name} maxLength={200} />
          </Field>
          <Field label="Description" htmlFor="ed-description" errors={fieldErrors?.description}>
            <Textarea
              name="description"
              defaultValue={control.description}
              maxLength={4000}
              className="min-h-28"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Priority" htmlFor="ed-priority" errors={fieldErrors?.priority}>
              <Select name="priority" defaultValue={control.priority}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Review frequency"
              htmlFor="ed-frequency"
              errors={fieldErrors?.reviewFrequency}
            >
              <Select name="reviewFrequency" defaultValue={control.reviewFrequency}>
                {REVIEW_FREQUENCIES.map((f) => (
                  <option key={f} value={f}>
                    {REVIEW_FREQUENCY_LABELS[f]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton>Save changes</SubmitButton>
          </div>
        </form>
      </SheetContent>
    </Dialog>
  );
}

export function RecordReviewForm({
  orgSlug,
  controlId,
  today,
  frequency,
}: {
  orgSlug: string;
  controlId: string;
  today: DateOnly;
  frequency: keyof typeof REVIEW_FREQUENCY_MONTHS;
}) {
  const formRef = React.useRef<HTMLFormElement>(null);
  const { formAction, fieldErrors } = useActionForm(
    recordReviewAction.bind(null, orgSlug, controlId),
    {
      success: "Review recorded",
      onSuccess: () => formRef.current?.reset(),
    },
  );
  const suggested = addMonths(today, REVIEW_FREQUENCY_MONTHS[frequency]);
  return (
    <form
      ref={formRef}
      action={formAction}
      className="border-border flex flex-col gap-3 rounded-md border p-4"
    >
      <p className="text-sm font-semibold">Record a review</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Outcome" htmlFor="rv-outcome" errors={fieldErrors?.outcome}>
          <Select name="outcome" defaultValue="EFFECTIVE">
            {REVIEW_OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {REVIEW_OUTCOME_LABELS[o]}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Next review"
          htmlFor="rv-next"
          errors={fieldErrors?.nextReviewDate}
          hint={`Defaults to ${suggested} (${REVIEW_FREQUENCY_LABELS[frequency].toLowerCase()}).`}
        >
          <Input type="date" name="nextReviewDate" defaultValue={suggested} min={today} />
        </Field>
      </div>
      <Field
        label="Notes"
        htmlFor="rv-notes"
        errors={fieldErrors?.notes}
        hint="What you checked, what you found, and any follow-up."
      >
        <Textarea name="notes" maxLength={10000} required />
      </Field>
      <SubmitButton className="self-start">Record review</SubmitButton>
    </form>
  );
}

export function MapRequirementForm({
  orgSlug,
  controlId,
  options,
}: {
  orgSlug: string;
  controlId: string;
  options: { id: string; code: string; title: string; framework: string }[];
}) {
  const { formAction } = useActionForm(mapRequirementAction.bind(null, orgSlug, controlId), {
    success: "Requirement mapped",
  });
  if (options.length === 0) return null;
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <Select
        name="requirementId"
        aria-label="Requirement to map"
        className="h-8 w-auto max-w-md"
        required
        defaultValue=""
      >
        <option value="" disabled>
          Choose a requirement…
        </option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.code} · {o.title} ({o.framework})
          </option>
        ))}
      </Select>
      <SubmitButton size="md">
        <Plus />
        Map
      </SubmitButton>
    </form>
  );
}

export function EvidenceRequirementDialog({
  orgSlug,
  controlId,
  requirement,
}: {
  orgSlug: string;
  controlId: string;
  requirement?: {
    id: string;
    title: string;
    description: string | null;
    freshnessDays: number;
    isRequired: boolean;
  };
}) {
  const [open, setOpen] = React.useState(false);
  const action = requirement
    ? updateEvidenceRequirementAction.bind(null, orgSlug, requirement.id)
    : createEvidenceRequirementAction.bind(null, orgSlug, controlId);
  const { formAction, fieldErrors } = useActionForm(action, {
    success: requirement ? "Requirement updated" : "Requirement added",
    onSuccess: () => setOpen(false),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {requirement ? (
          <Button size="sm" variant="ghost">
            Edit
          </Button>
        ) : (
          <Button size="sm">
            <Plus />
            Add requirement
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        title={requirement ? "Edit evidence requirement" : "Add evidence requirement"}
        description="Describe the proof an auditor should see for this control."
      >
        <form action={formAction} className="flex flex-col gap-3">
          <Field label="Title" htmlFor="er-title" errors={fieldErrors?.title}>
            <Input name="title" defaultValue={requirement?.title} maxLength={200} />
          </Field>
          <Field
            label="Description"
            htmlFor="er-description"
            errors={fieldErrors?.description}
            optional
          >
            <Textarea
              name="description"
              defaultValue={requirement?.description ?? ""}
              maxLength={2000}
            />
          </Field>
          <Field
            label="Freshness (days)"
            htmlFor="er-fresh"
            errors={fieldErrors?.freshnessDays}
            hint="How long approved evidence stays valid when no explicit date is set."
          >
            <Input
              name="freshnessDays"
              type="number"
              min={1}
              max={1825}
              defaultValue={requirement?.freshnessDays ?? 365}
              className="w-32"
            />
          </Field>
          <label className="flex items-center gap-2 text-[13px]">
            <Checkbox name="isRequired" defaultChecked={requirement?.isRequired ?? true} />
            Required for the control to be Ready
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton>{requirement ? "Save" : "Add"}</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ArchiveRequirementButton({
  orgSlug,
  requirementId,
  title,
}: {
  orgSlug: string;
  requirementId: string;
  title: string;
}) {
  return (
    <ActionButton
      size="sm"
      variant="ghost"
      action={() => archiveEvidenceRequirementAction(orgSlug, requirementId)}
      success="Requirement archived"
      confirm={{
        title: "Archive evidence requirement",
        description: `“${title}” will no longer be required. Linked evidence stays in the library and the change is recorded in the audit log.`,
        confirmLabel: "Archive",
      }}
    >
      Archive
    </ActionButton>
  );
}

export function UnlinkButton({
  orgSlug,
  linkId,
  label,
}: {
  orgSlug: string;
  linkId: string;
  label: string;
}) {
  return (
    <ActionButton
      size="sm"
      variant="ghost"
      action={() => unlinkEvidenceAction(orgSlug, linkId)}
      success="Evidence unlinked"
      aria-label={`Unlink ${label}`}
      confirm={{
        title: "Unlink evidence",
        description: `“${label}” will no longer support this requirement. The evidence itself is kept in the library.`,
        confirmLabel: "Unlink",
      }}
    >
      Unlink
    </ActionButton>
  );
}

export function LinkExistingDialog({
  orgSlug,
  controlId,
  requirementId,
  library,
  alreadyLinked,
}: {
  orgSlug: string;
  controlId: string;
  requirementId: string | null;
  library: { id: string; title: string; status: string; category: string }[];
  alreadyLinked: string[];
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [pending, start] = React.useTransition();
  const candidates = library
    .filter((e) => !alreadyLinked.includes(e.id))
    .filter((e) => e.title.toLowerCase().includes(query.trim().toLowerCase()))
    .slice(0, 50);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Link2 />
          Link existing
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Link existing evidence"
        description="Reuse evidence from your library. One document can support many controls."
      >
        <Input
          placeholder="Search evidence…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search evidence"
          autoFocus
        />
        <ul className="border-border mt-3 max-h-80 overflow-y-auto rounded-sm border">
          {candidates.length === 0 ? (
            <li className="text-muted-foreground px-3 py-4 text-center text-[13px]">
              No matching evidence.
            </li>
          ) : (
            candidates.map((e) => (
              <li
                key={e.id}
                className="border-border flex items-center gap-2 border-b px-3 py-2 last:border-0"
              >
                <span className="min-w-0 flex-1 truncate text-[13px]">{e.title}</span>
                <span className="text-muted-foreground text-xs">
                  {e.status === "APPROVED"
                    ? "Approved"
                    : e.status === "REJECTED"
                      ? "Rejected"
                      : "Pending"}
                </span>
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await linkEvidenceAction(orgSlug, {
                        evidenceId: e.id,
                        controlId,
                        evidenceRequirementId: requirementId,
                      });
                      if (r.ok) {
                        toast.success("Evidence linked");
                        setOpen(false);
                      } else toast.error(r.error.message);
                    })
                  }
                >
                  Link
                </Button>
              </li>
            ))
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

export function UploadForRequirementLink({
  orgSlug,
  controlId,
  requirementId,
}: {
  orgSlug: string;
  controlId: string;
  requirementId: string | null;
}) {
  const params = new URLSearchParams({ controlId, ...(requirementId ? { requirementId } : {}) });
  return (
    <Button asChild size="sm" variant="secondary">
      <Link href={`/org/${orgSlug}/evidence/new?${params.toString()}`}>
        <Upload />
        Upload
      </Link>
    </Button>
  );
}
