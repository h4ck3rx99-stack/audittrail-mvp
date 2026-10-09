import type { Metadata } from "next";
import Link from "next/link";
import { requireOrgContext } from "@/server/authz/context";
import { getTaskDetail, getTaskFormOptions } from "@/features/tasks/server/queries";
import { resolveResourceLinks } from "@/features/audit/server/links";
import { ActivityFeed } from "@/components/app/activity-feed";
import {
  DueDate,
  MetaList,
  PageHeader,
  Panel,
  Person,
  PlainText,
  SectionTitle,
  TimeAgo,
} from "@/components/app/primitives";
import { PRIORITY, Status, TASK_STATUS } from "@/components/app/status";
import {
  CompleteTaskButton,
  DeleteTaskButton,
  EditTaskButton,
  TaskAssigneeSelect,
  TaskStatusSelect,
} from "@/features/tasks/components/task-forms";
import { riskKey, taskKey } from "@/lib/utils";

export const metadata: Metadata = { title: "Task" };

export default async function TaskPage({ params }: PageProps<"/org/[orgSlug]/tasks/[taskId]">) {
  const { orgSlug, taskId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const [d, options] = await Promise.all([getTaskDetail(ctx, taskId), getTaskFormOptions(ctx)]);
  const t = d.task;
  const base = `/org/${ctx.org.slug}`;
  const links = await resolveResourceLinks(ctx, d.activity);
  const key = taskKey(t.number);
  const done = t.status === "DONE" || t.status === "CANCELED";

  return (
    <div className="mx-auto max-w-[1200px]">
      <div className="text-muted-foreground mb-2 text-xs">
        <Link href={`${base}/tasks`} className="hover:underline">
          Tasks
        </Link>{" "}
        / <span className="mono">{key}</span>
      </div>
      <PageHeader
        title={
          <span>
            <span className="mono text-muted-foreground mr-2 text-base">{key}</span>
            {t.title}
          </span>
        }
        meta={
          <>
            <Status map={TASK_STATUS} value={t.status} />
            <Status map={PRIORITY} value={t.priority} />
            {t.source === "GAP" && t.gapKey ? <span>Tracks a detected gap</span> : null}
          </>
        }
        actions={
          <>
            {d.permissions.edit ? (
              <CompleteTaskButton orgSlug={ctx.org.slug} taskId={t.id} status={t.status} />
            ) : null}
            {d.permissions.edit ? (
              <EditTaskButton
                orgSlug={ctx.org.slug}
                task={{
                  id: t.id,
                  title: t.title,
                  description: t.description,
                  priority: t.priority,
                  dueDate: t.dueDate,
                  controls: t.controls,
                }}
                options={options}
              />
            ) : null}
            {d.permissions.edit || d.permissions.delete ? (
              <DeleteTaskButton
                orgSlug={ctx.org.slug}
                taskId={t.id}
                label={key}
                disabledReason={d.permissions.deleteReason}
              />
            ) : null}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-6">
          <section>
            <SectionTitle>Description</SectionTitle>
            <PlainText
              text={t.description}
              className="text-[13px] leading-relaxed"
              empty="No description."
            />
          </section>
          <section>
            <SectionTitle>Related controls</SectionTitle>
            {t.controls.length === 0 ? (
              <p className="text-muted-foreground text-[13px]">None.</p>
            ) : (
              <ul className="border-border rounded-md border">
                {t.controls.map((c) => (
                  <li
                    key={c.id}
                    className="border-border border-b px-3 py-2 text-[13px] last:border-0"
                  >
                    <Link href={`${base}/controls/${c.id}`} className="hover:underline">
                      <span className="mono text-muted-foreground mr-1.5">{c.code}</span>
                      {c.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <SectionTitle>Activity</SectionTitle>
            <ActivityFeed events={d.activity} links={links} timeZone={ctx.org.timezone} />
          </section>
        </div>
        <aside className="lg:sticky lg:top-16 lg:self-start">
          <Panel className="p-4">
            <MetaList
              items={[
                {
                  label: "Status",
                  value: (
                    <TaskStatusSelect
                      orgSlug={ctx.org.slug}
                      taskId={t.id}
                      status={t.status}
                      disabledReason={d.permissions.editReason}
                    />
                  ),
                },
                {
                  label: "Assignee",
                  value: d.permissions.edit ? (
                    <TaskAssigneeSelect
                      orgSlug={ctx.org.slug}
                      taskId={t.id}
                      assigneeId={t.assigneeId}
                      members={options.members}
                      disabled={false}
                    />
                  ) : (
                    <Person name={t.assignee?.name} />
                  ),
                },
                {
                  label: "Due",
                  value: (
                    <DueDate date={t.dueDate} today={d.today} done={done} empty="No due date" />
                  ),
                },
                { label: "Priority", value: <Status map={PRIORITY} value={t.priority} text /> },
                {
                  label: "Risk",
                  value: t.risk ? (
                    <Link href={`${base}/risks/${t.risk.id}`} className="hover:underline">
                      <span className="mono mr-1">{riskKey(t.risk.number)}</span>
                      {t.risk.title}
                    </Link>
                  ) : (
                    <span className="text-faint-foreground">None</span>
                  ),
                },
                { label: "Created by", value: <Person name={t.createdBy.name} /> },
                {
                  label: "Created",
                  value: <TimeAgo date={t.createdAt} timeZone={ctx.org.timezone} />,
                },
                ...(t.completedAt
                  ? [
                      {
                        label: "Completed",
                        value: (
                          <span>
                            {t.completedBy?.name ?? "—"} ·{" "}
                            <TimeAgo date={t.completedAt} timeZone={ctx.org.timezone} />
                          </span>
                        ),
                      },
                    ]
                  : []),
              ]}
            />
          </Panel>
        </aside>
      </div>
    </div>
  );
}
