"use client";

import * as React from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { ActionButton, SubmitButton, useActionForm } from "@/components/app/actions";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/form-controls";
import { Dialog, DialogTrigger, SheetContent } from "@/components/ui/overlays";
import {
  deleteEvidenceAction,
  linkEvidenceAction,
  reviewEvidenceAction,
  updateEvidenceAction,
} from "../actions";
import { EVIDENCE_CATEGORIES, EVIDENCE_CATEGORY_LABELS } from "../schemas";

export function ReviewPanel({
  orgSlug,
  evidenceId,
  suggestedValidUntil,
}: {
  orgSlug: string;
  evidenceId: string;
  suggestedValidUntil: string | null;
}) {
  const [decision, setDecision] = React.useState<"approve" | "reject">("approve");
  const { formAction, fieldErrors } = useActionForm(
    reviewEvidenceAction.bind(null, orgSlug, evidenceId),
    {
      success: decision === "approve" ? "Evidence approved" : "Evidence rejected",
    },
  );
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="decision" value={decision} />
      <div
        className="border-border flex gap-1 rounded-sm border p-0.5 text-[13px]"
        role="radiogroup"
        aria-label="Decision"
      >
        {(["approve", "reject"] as const).map((d) => (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={decision === d}
            onClick={() => setDecision(d)}
            className={`flex-1 rounded-sm px-3 py-1 ${decision === d ? "bg-accent-subtle font-medium" : "text-muted-foreground hover:bg-hover"}`}
          >
            {d === "approve" ? "Approve" : "Reject"}
          </button>
        ))}
      </div>
      {decision === "approve" ? (
        <Field
          label="Valid until"
          htmlFor="rv-valid"
          errors={fieldErrors?.validUntil}
          optional
          hint={
            suggestedValidUntil
              ? `Leave empty to use ${suggestedValidUntil} (collected date + requirement freshness).`
              : "Leave empty to use the requirement freshness or the organization default."
          }
        >
          <Input type="date" name="validUntil" />
        </Field>
      ) : null}
      <Field
        label={decision === "reject" ? "Reason for rejection" : "Comment"}
        htmlFor="rv-comment"
        errors={fieldErrors?.comment}
        optional={decision === "approve"}
      >
        <Textarea name="comment" maxLength={2000} />
      </Field>
      <SubmitButton variant={decision === "reject" ? "danger" : "primary"} className="self-start">
        {decision === "approve" ? "Approve evidence" : "Reject evidence"}
      </SubmitButton>
    </form>
  );
}

export function EditEvidenceButton({
  orgSlug,
  evidence,
}: {
  orgSlug: string;
  evidence: {
    id: string;
    title: string;
    description: string | null;
    category: string;
    collectedAt: string;
    validUntil: string | null;
    kind: string;
    url: string | null;
  };
}) {
  const [open, setOpen] = React.useState(false);
  const { formAction, fieldErrors, formError } = useActionForm(
    updateEvidenceAction.bind(null, orgSlug, evidence.id),
    {
      success: "Evidence updated",
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
        title="Edit evidence"
        description="Metadata changes are recorded in the audit log."
      >
        <form action={formAction} className="flex flex-col gap-3">
          <FormError message={formError} />
          <Field label="Title" htmlFor="ev-title" errors={fieldErrors?.title}>
            <Input name="title" defaultValue={evidence.title} maxLength={200} />
          </Field>
          {evidence.kind === "LINK" ? (
            <Field label="URL" htmlFor="ev-url" errors={fieldErrors?.url}>
              <Input name="url" type="url" defaultValue={evidence.url ?? ""} maxLength={2048} />
            </Field>
          ) : null}
          <Field label="Category" htmlFor="ev-category" errors={fieldErrors?.category}>
            <Select name="category" defaultValue={evidence.category}>
              {EVIDENCE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {EVIDENCE_CATEGORY_LABELS[c]}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Collected on" htmlFor="ev-collected" errors={fieldErrors?.collectedAt}>
              <Input name="collectedAt" type="date" defaultValue={evidence.collectedAt} />
            </Field>
            <Field label="Valid until" htmlFor="ev-valid" errors={fieldErrors?.validUntil} optional>
              <Input name="validUntil" type="date" defaultValue={evidence.validUntil ?? ""} />
            </Field>
          </div>
          <Field
            label="Description"
            htmlFor="ev-description"
            errors={fieldErrors?.description}
            optional
          >
            <Textarea
              name="description"
              defaultValue={evidence.description ?? ""}
              maxLength={4000}
            />
          </Field>
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

export function DeleteEvidenceButton({
  orgSlug,
  evidenceId,
  title,
  disabledReason,
}: {
  orgSlug: string;
  evidenceId: string;
  title: string;
  disabledReason: string | null;
}) {
  return (
    <ActionButton
      size="sm"
      variant="secondary"
      disabledReason={disabledReason}
      action={() => deleteEvidenceAction(orgSlug, evidenceId)}
      success="Evidence deleted"
      confirm={{
        title: "Delete evidence",
        destructive: true,
        confirmLabel: "Delete evidence",
        description: (
          <>
            “{title}” will be removed from the library and can no longer be downloaded. Requirements
            it supports become unsatisfied. The file is retained in storage and the deletion,
            including the file hash, is recorded in the audit log.
          </>
        ),
      }}
    >
      Delete
    </ActionButton>
  );
}

export function AddLinkForm({
  orgSlug,
  evidenceId,
  controls,
}: {
  orgSlug: string;
  evidenceId: string;
  controls: {
    id: string;
    code: string;
    name: string;
    evidenceRequirements: { id: string; title: string }[];
  }[];
}) {
  const [controlId, setControlId] = React.useState("");
  const [requirementId, setRequirementId] = React.useState("");
  const [pending, start] = React.useTransition();
  const control = controls.find((c) => c.id === controlId);
  return (
    <div className="flex flex-col gap-2">
      <Select
        value={controlId}
        onChange={(e) => {
          setControlId(e.target.value);
          setRequirementId("");
        }}
        aria-label="Control"
      >
        <option value="">Link to a control…</option>
        {controls.map((c) => (
          <option key={c.id} value={c.id}>
            {c.code} · {c.name}
          </option>
        ))}
      </Select>
      {control ? (
        <Select
          value={requirementId}
          onChange={(e) => setRequirementId(e.target.value)}
          aria-label="Evidence requirement"
        >
          <option value="">No specific requirement</option>
          {control.evidenceRequirements.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title}
            </option>
          ))}
        </Select>
      ) : null}
      <Button
        size="sm"
        className="self-start"
        disabled={!controlId || pending}
        onClick={() =>
          start(async () => {
            const r = await linkEvidenceAction(orgSlug, {
              evidenceId,
              controlId,
              evidenceRequirementId: requirementId || null,
            });
            if (r.ok) {
              toast.success("Evidence linked");
              setControlId("");
              setRequirementId("");
            } else toast.error(r.error.message);
          })
        }
      >
        Add link
      </Button>
    </div>
  );
}
