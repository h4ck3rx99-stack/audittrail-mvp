"use server";

import { redirect } from "next/navigation";
import { runAction, type ActionResult } from "@/server/result";
import { resolveOrgContextForAction } from "@/server/authz/context";
import { formDataToObject } from "@/server/validation";
import { assignTask, changeTaskStatus, createTask, deleteTask, updateTask } from "./server/service";

type FormResult = ActionResult<null>;

export async function createTaskAction(
  orgSlug: string,
  _prev: ActionResult<{ id: string; number: number }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string; number: number }>> {
  return runAction("tasks.create", async () => {
    const task = await createTask(
      await resolveOrgContextForAction(orgSlug),
      formDataToObject(formData, ["controlIds"]),
    );
    return { id: task.id, number: task.number };
  });
}

export async function updateTaskAction(
  orgSlug: string,
  taskId: string,
  _prev: FormResult | null,
  formData: FormData,
): Promise<FormResult> {
  return runAction("tasks.update", async () => {
    await updateTask(
      await resolveOrgContextForAction(orgSlug),
      taskId,
      formDataToObject(formData, ["controlIds"]),
    );
    return null;
  });
}

export async function assignTaskAction(
  orgSlug: string,
  taskId: string,
  assigneeId: string | null,
): Promise<FormResult> {
  return runAction("tasks.assign", async () => {
    await assignTask(await resolveOrgContextForAction(orgSlug), taskId, { assigneeId });
    return null;
  });
}

export async function changeTaskStatusAction(
  orgSlug: string,
  taskId: string,
  status: string,
): Promise<FormResult> {
  return runAction("tasks.status", async () => {
    await changeTaskStatus(await resolveOrgContextForAction(orgSlug), taskId, { status });
    return null;
  });
}

export async function deleteTaskAction(orgSlug: string, taskId: string): Promise<FormResult> {
  const result = await runAction(
    "tasks.delete",
    async () => {
      await deleteTask(await resolveOrgContextForAction(orgSlug), taskId);
      return null;
    },
    { refresh: false },
  );
  if (result.ok) redirect(`/org/${orgSlug}/tasks?view=all`);
  return result;
}
