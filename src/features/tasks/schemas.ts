import { z } from "zod";
import { nullableId, optionalDateOnly, optionalText } from "@/lib/zod";
import { PRIORITIES } from "@/features/controls/schemas";

export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "BLOCKED", "DONE", "CANCELED"] as const;
export const TASK_STATUS_LABELS: Record<(typeof TASK_STATUSES)[number], string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  DONE: "Done",
  CANCELED: "Canceled",
};
export const OPEN_TASK_STATUSES = ["TODO", "IN_PROGRESS", "BLOCKED"] as const;

export const createTaskSchema = z.object({
  title: z.string().trim().min(3, "Enter a title.").max(200),
  description: optionalText(10000),
  priority: z.enum(PRIORITIES),
  assigneeId: nullableId,
  dueDate: optionalDateOnly,
  controlIds: z.array(z.uuid()).max(50).default([]),
  riskId: nullableId,
  gapKey: optionalText(120),
});

export const updateTaskSchema = z.object({
  title: z.string().trim().min(3, "Enter a title.").max(200),
  description: optionalText(10000),
  priority: z.enum(PRIORITIES),
  dueDate: optionalDateOnly,
  controlIds: z.array(z.uuid()).max(50).default([]),
});

export const assignTaskSchema = z.object({ assigneeId: nullableId });
export const taskStatusSchema = z.object({ status: z.enum(TASK_STATUSES) });

export const taskListQuerySchema = z.object({
  view: z.enum(["mine", "all"]).optional().catch(undefined),
  status: z
    .enum([...TASK_STATUSES, "open"])
    .optional()
    .catch(undefined),
  priority: z.enum(PRIORITIES).optional().catch(undefined),
  assignee: z
    .union([z.literal("me"), z.literal("unassigned"), z.uuid()])
    .optional()
    .catch(undefined),
  due: z.enum(["overdue", "week", "none"]).optional().catch(undefined),
  control: z.uuid().optional().catch(undefined),
  source: z.enum(["MANUAL", "GAP"]).optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10000).optional().catch(undefined),
});
export type TaskListQuery = z.infer<typeof taskListQuerySchema>;
