"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { ActionButton, SubmitButton, useActionForm } from "@/components/app/actions";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/form-controls";
import { Dialog, DialogTrigger, SheetContent } from "@/components/ui/overlays";
import { Tooltip } from "@/components/ui/overlays";
import {
  assignTaskAction,
  changeTaskStatusAction,
  createTaskAction,
  deleteTaskAction,
  updateTaskAction,
} from "../actions";
import { TASK_STATUSES, TASK_STATUS_LABELS } from "../schemas";
import { PRIORITIES, PRIORITY_LABELS } from "@/features/controls/schemas";

type Options = {
  members: { id: string; name: string }[];
  controls: { id: string; code: string; name: string }[];
  risks: { id: string; number: number; title: string }[];
};

export type TaskPrefill = {
  title?: string;
  description?: string;
  controlIds?: string[];
  riskId?: string;
  gapKey?: string;
  priority?: string;
};

function ControlPicker({
  controls,
  initial,
}: {
  controls: Options["controls"];
  initial: string[];
}) {
  const [selected, setSelected] = React.useState<string[]>(initial);
  const [pick, setPick] = React.useState("");
  const byId = new Map(controls.map((c) => [c.id, c]));
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium">Related controls</span>
      {selected.map((id) => (
        <input key={id} type="hidden" name="controlIds" value={id} />
      ))}
      <div className="flex flex-wrap gap-1">
        {selected.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setSelected(selected.filter((x) => x !== id))}
            className="mono border-border hover:border-danger rounded-sm border px-1.5 text-[11px]"
            aria-label={`Remove ${byId.get(id)?.code ?? "control"}`}
          >
            {byId.get(id)?.code ?? "?"} ×
          </button>
        ))}
        {selected.length === 0 ? <span className="text-faint-foreground text-xs">None</span> : null}
      </div>
      <div className="flex gap-2">
        <Select
          value={pick}
          onChange={(e) => setPick(e.target.value)}
          aria-label="Add a related control"
          className="flex-1"
        >
          <option value="">Add a control…</option>
          {controls
            .filter((c) => !selected.includes(c.id))
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} · {c.name}
              </option>
            ))}
        </Select>
        <Button
          type="button"
          size="md"
          disabled={!pick}
          onClick={() => {
            setSelected([...selected, pick]);
            setPick("");
          }}
        >
          Add
        </Button>
      </div>
    </div>
  );
}

/** Create-task side sheet. Opened by ?create=1 (with optional prefill params) or the button. */
export function CreateTaskSheet({
  orgSlug,
  options,
  prefill,
  open: openProp,
}: {
  orgSlug: string;
  options: Options;
  prefill: TaskPrefill;
  open: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = React.useState(openProp);
  // Follow ?create=1 navigations (adjusting state during render, not in an effect).
  const [prevOpenProp, setPrevOpenProp] = React.useState(openProp);
  if (prevOpenProp !== openProp) {
    setPrevOpenProp(openProp);
    setOpen(openProp);
  }
  const close = () => {
    setOpen(false);
    if (params.get("create")) {
      const next = new URLSearchParams(params.toString());
      for (const k of [
        "create",
        "controlId",
        "riskId",
        "gapKey",
        "title",
        "description",
        "priority",
      ])
        next.delete(k);
      router.replace(next.toString() ? `${pathname}?${next}` : pathname);
    }
  };
  const { formAction, fieldErrors, formError } = useActionForm(
    createTaskAction.bind(null, orgSlug),
    {
      success: (d) => `TSK-${d.number} created`,
      onSuccess: (d) => {
        setOpen(false);
        router.push(`/org/${orgSlug}/tasks/${d.id}`);
      },
    },
  );
  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <DialogTrigger asChild>
        <Button variant="primary">
          <Plus />
          New task
        </Button>
      </DialogTrigger>
      <SheetContent
        title="New task"
        description={
          prefill.gapKey
            ? "Pre-filled from a detected gap. The task tracks the gap until it is done."
            : undefined
        }
      >
        <form action={formAction} className="flex flex-col gap-3">
          <FormError message={formError} />
          {prefill.gapKey ? <input type="hidden" name="gapKey" value={prefill.gapKey} /> : null}
          <Field label="Title" htmlFor="tk-title" errors={fieldErrors?.title}>
            <Input name="title" defaultValue={prefill.title} maxLength={200} autoFocus />
          </Field>
          <Field
            label="Description"
            htmlFor="tk-description"
            errors={fieldErrors?.description}
            optional
          >
            <Textarea name="description" defaultValue={prefill.description} maxLength={10000} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Priority" htmlFor="tk-priority" errors={fieldErrors?.priority}>
              <Select name="priority" defaultValue={prefill.priority ?? "MEDIUM"}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Due date" htmlFor="tk-due" errors={fieldErrors?.dueDate} optional>
              <Input name="dueDate" type="date" />
            </Field>
          </div>
          <Field label="Assignee" htmlFor="tk-assignee" errors={fieldErrors?.assigneeId} optional>
            <Select name="assigneeId" defaultValue="">
              <option value="">Unassigned</option>
              {options.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Risk"
            htmlFor="tk-risk"
            errors={fieldErrors?.riskId}
            optional
            hint="Link a mitigation task to the risk it treats."
          >
            <Select name="riskId" defaultValue={prefill.riskId ?? ""}>
              <option value="">None</option>
              {options.risks.map((r) => (
                <option key={r.id} value={r.id}>
                  RSK-{r.number} · {r.title}
                </option>
              ))}
            </Select>
          </Field>
          <ControlPicker controls={options.controls} initial={prefill.controlIds ?? []} />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" onClick={close}>
              Cancel
            </Button>
            <SubmitButton>Create task</SubmitButton>
          </div>
        </form>
      </SheetContent>
    </Dialog>
  );
}

export function EditTaskButton({
  orgSlug,
  task,
  options,
}: {
  orgSlug: string;
  task: {
    id: string;
    title: string;
    description: string | null;
    priority: string;
    dueDate: string | null;
    controls: { id: string }[];
  };
  options: Options;
}) {
  const [open, setOpen] = React.useState(false);
  const { formAction, fieldErrors, formError } = useActionForm(
    updateTaskAction.bind(null, orgSlug, task.id),
    { success: "Task updated", onSuccess: () => setOpen(false) },
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Pencil />
          Edit
        </Button>
      </DialogTrigger>
      <SheetContent title="Edit task">
        <form action={formAction} className="flex flex-col gap-3">
          <FormError message={formError} />
          <Field label="Title" htmlFor="et-title" errors={fieldErrors?.title}>
            <Input name="title" defaultValue={task.title} maxLength={200} />
          </Field>
          <Field
            label="Description"
            htmlFor="et-description"
            errors={fieldErrors?.description}
            optional
          >
            <Textarea
              name="description"
              defaultValue={task.description ?? ""}
              maxLength={10000}
              className="min-h-28"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Priority" htmlFor="et-priority" errors={fieldErrors?.priority}>
              <Select name="priority" defaultValue={task.priority}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Due date" htmlFor="et-due" errors={fieldErrors?.dueDate} optional>
              <Input name="dueDate" type="date" defaultValue={task.dueDate ?? ""} />
            </Field>
          </div>
          <ControlPicker controls={options.controls} initial={task.controls.map((c) => c.id)} />
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

export function TaskStatusSelect({
  orgSlug,
  taskId,
  status,
  disabledReason,
}: {
  orgSlug: string;
  taskId: string;
  status: string;
  disabledReason: string | null;
}) {
  const [pending, start] = React.useTransition();
  const select = (
    <Select
      aria-label="Task status"
      className="h-7"
      value={status}
      disabled={pending || Boolean(disabledReason)}
      onChange={(e) =>
        start(async () => {
          const r = await changeTaskStatusAction(orgSlug, taskId, e.target.value);
          if (r.ok) toast.success("Status updated");
          else toast.error(r.error.message);
        })
      }
    >
      {TASK_STATUSES.map((s) => (
        <option key={s} value={s}>
          {TASK_STATUS_LABELS[s]}
        </option>
      ))}
    </Select>
  );
  return disabledReason ? (
    <Tooltip content={disabledReason}>
      <span tabIndex={0}>{select}</span>
    </Tooltip>
  ) : (
    select
  );
}

export function TaskAssigneeSelect({
  orgSlug,
  taskId,
  assigneeId,
  members,
  disabled,
}: {
  orgSlug: string;
  taskId: string;
  assigneeId: string | null;
  members: { id: string; name: string }[];
  disabled: boolean;
}) {
  const [pending, start] = React.useTransition();
  return (
    <Select
      aria-label="Assignee"
      className="h-7"
      value={assigneeId ?? ""}
      disabled={pending || disabled}
      onChange={(e) =>
        start(async () => {
          const r = await assignTaskAction(orgSlug, taskId, e.target.value || null);
          if (r.ok) toast.success("Assignee updated");
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

export function CompleteTaskButton({
  orgSlug,
  taskId,
  status,
}: {
  orgSlug: string;
  taskId: string;
  status: string;
}) {
  const done = status === "DONE" || status === "CANCELED";
  return (
    <ActionButton
      size="sm"
      variant={done ? "secondary" : "primary"}
      action={() => changeTaskStatusAction(orgSlug, taskId, done ? "TODO" : "DONE")}
      success={done ? "Task reopened" : "Task completed"}
    >
      {done ? "Reopen" : "Mark complete"}
    </ActionButton>
  );
}

export function DeleteTaskButton({
  orgSlug,
  taskId,
  label,
  disabledReason,
}: {
  orgSlug: string;
  taskId: string;
  label: string;
  disabledReason: string | null;
}) {
  return (
    <ActionButton
      size="sm"
      disabledReason={disabledReason}
      action={() => deleteTaskAction(orgSlug, taskId)}
      success="Task deleted"
      confirm={{
        title: `Delete ${label}`,
        destructive: true,
        confirmLabel: "Delete task",
        description:
          "The task is permanently removed. A full snapshot of it is kept in the audit log.",
      }}
    >
      Delete
    </ActionButton>
  );
}
