import type { Metadata } from "next";
import Link from "next/link";
import { requireOrgContext } from "@/server/authz/context";
import { can } from "@/server/authz/permissions";
import { isUuid } from "@/server/ids";
import { getTaskFormOptions, listTasks } from "@/features/tasks/server/queries";
import { taskListQuerySchema, TASK_STATUS_LABELS } from "@/features/tasks/schemas";
import { PRIORITY_LABELS } from "@/features/controls/schemas";
import { CreateTaskSheet } from "@/features/tasks/components/task-forms";
import {
  DueDate,
  EmptyState,
  FilterLink,
  PageHeader,
  Pagination,
  Person,
  RowLink,
  Table,
  TableWrap,
  Td,
  Th,
  THead,
  Tr,
  makeQueryHref,
} from "@/components/app/primitives";
import { PRIORITY, Status, TASK_STATUS } from "@/components/app/status";
import { ClearFilters, FilterBar, FilterSelect, SearchFilter } from "@/components/app/filters";
import { taskKey } from "@/lib/utils";

export const metadata: Metadata = { title: "Tasks" };

function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function TasksPage({
  params,
  searchParams,
}: PageProps<"/org/[orgSlug]/tasks">) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const raw = await searchParams;
  const q = taskListQuerySchema.parse(
    Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, first(v)])),
  );
  const [data, options] = await Promise.all([listTasks(ctx, q), getTaskFormOptions(ctx)]);
  const base = `/org/${ctx.org.slug}/tasks`;
  const query: Record<string, string | undefined> = Object.fromEntries(
    Object.entries(q).map(([k, v]) => [k, v === undefined ? undefined : String(v)]),
  );
  const href = makeQueryHref(base, query);
  const canCreate = can(ctx, "task.create");

  const prefillControl = first(raw.controlId);
  const prefillRisk = first(raw.riskId);
  const prefill = {
    title: first(raw.title)?.slice(0, 200),
    description: first(raw.description)?.slice(0, 2000),
    priority: first(raw.priority),
    gapKey: first(raw.gapKey)?.slice(0, 120),
    controlIds: prefillControl ? prefillControl.split(",").filter(isUuid).slice(0, 20) : [],
    riskId: prefillRisk && isUuid(prefillRisk) ? prefillRisk : undefined,
  };
  const filtered = Boolean(
    q.status || q.priority || q.assignee || q.due || q.control || q.source || q.q,
  );

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Tasks"
        description="Assigned, dated work that closes gaps and treats risks."
        actions={
          canCreate ? (
            <CreateTaskSheet
              orgSlug={ctx.org.slug}
              options={options}
              prefill={prefill}
              open={first(raw.create) === "1"}
            />
          ) : null
        }
      />
      <FilterBar>
        <FilterLink
          href={href({ view: null, page: null, assignee: null })}
          active={data.view === "mine"}
        >
          My open tasks
        </FilterLink>
        <FilterLink href={href({ view: "all", page: null })} active={data.view === "all"}>
          All tasks
        </FilterLink>
        <SearchFilter placeholder="Search title or TSK-n" />
        <FilterSelect
          param="status"
          label="Status"
          options={[
            { value: "open", label: "Open" },
            ...Object.entries(TASK_STATUS_LABELS).map(([value, label]) => ({ value, label })),
          ]}
        />
        <FilterSelect
          param="priority"
          label="Priority"
          options={Object.entries(PRIORITY_LABELS).map(([value, label]) => ({ value, label }))}
        />
        {data.view === "all" ? (
          <FilterSelect
            param="assignee"
            label="Assignee"
            options={[
              { value: "me", label: "Me" },
              { value: "unassigned", label: "Unassigned" },
              ...options.members.map((m) => ({ value: m.id, label: m.name })),
            ]}
          />
        ) : null}
        <FilterSelect
          param="due"
          label="Due"
          options={[
            { value: "overdue", label: "Overdue" },
            { value: "week", label: "This week" },
            { value: "none", label: "No date" },
          ]}
        />
        <FilterSelect
          param="control"
          label="Control"
          options={options.controls.map((c) => ({ value: c.id, label: c.code }))}
        />
        <FilterSelect
          param="source"
          label="Source"
          options={[
            { value: "MANUAL", label: "Manual" },
            { value: "GAP", label: "Detected gap" },
          ]}
        />
        <ClearFilters
          params={["status", "priority", "assignee", "due", "control", "source", "q"]}
        />
      </FilterBar>

      {data.total === 0 ? (
        <EmptyState
          title={
            filtered
              ? "No tasks match these filters"
              : data.view === "mine"
                ? "No open tasks assigned to you"
                : "No tasks yet"
          }
          description={
            filtered
              ? "Adjust or clear the filters."
              : "Tasks close gaps: missing evidence, unowned controls, overdue reviews. Create tasks directly from detected gaps to keep them tracked."
          }
          action={
            !filtered ? (
              <Link
                href={`/org/${ctx.org.slug}/risks?tab=gaps`}
                className="text-accent text-[13px] hover:underline"
              >
                View detected gaps
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <Th className="w-20">Key</Th>
                  <Th>Title</Th>
                  <Th>Status</Th>
                  <Th>Priority</Th>
                  <Th>Assignee</Th>
                  <Th>Due</Th>
                  <Th>Controls</Th>
                </tr>
              </THead>
              <tbody>
                {data.rows.map((t) => (
                  <Tr key={t.id}>
                    <Td className="mono text-muted-foreground">{taskKey(t.number)}</Td>
                    <Td className="max-w-96">
                      <RowLink href={`${base}/${t.id}`} className="block truncate">
                        {t.title}
                      </RowLink>
                      {t.source === "GAP" ? (
                        <span className="text-muted-foreground text-xs">From detected gap</span>
                      ) : null}
                    </Td>
                    <Td>
                      <Status map={TASK_STATUS} value={t.status} text />
                    </Td>
                    <Td>
                      <Status map={PRIORITY} value={t.priority} text />
                    </Td>
                    <Td className="max-w-40">
                      <Person name={t.assignee?.name} />
                    </Td>
                    <Td>
                      <DueDate
                        date={t.dueDate}
                        today={data.today}
                        done={t.status === "DONE" || t.status === "CANCELED"}
                      />
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {t.controls.map((c) => (
                          <Link
                            key={c.id}
                            href={`/org/${ctx.org.slug}/controls/${c.id}`}
                            className="mono border-border text-muted-foreground hover:text-foreground rounded-sm border px-1 text-[11px]"
                          >
                            {c.code}
                          </Link>
                        ))}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
          <Pagination
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            href={(p) => href({ page: p })}
          />
        </>
      )}
    </div>
  );
}
