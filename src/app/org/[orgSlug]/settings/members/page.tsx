import type { Metadata } from "next";
import { requireOrgContext } from "@/server/authz/context";
import { can, denialReason, invitableRoles, ROLES } from "@/server/authz/permissions";
import { listInvitations, listMembers } from "@/features/members/server/service";
import {
  InvitationActions,
  InviteForm,
  LeaveButton,
  RemoveMemberButton,
  RoleSelect,
} from "@/features/members/components/member-components";
import {
  Panel,
  Person,
  SectionTitle,
  Table,
  TableWrap,
  Td,
  Th,
  THead,
  Tr,
  TimeAgo,
} from "@/components/app/primitives";
import { INVITATION_STATE, Status } from "@/components/app/status";
import { formatTimestamp } from "@/lib/dates";

export const metadata: Metadata = { title: "Members" };

export default async function MembersPage({
  params,
}: PageProps<"/org/[orgSlug]/settings/members">) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const members = await listMembers(ctx);
  const canInvite = can(ctx, "invitation.revoke");
  const invitations = canInvite ? await listInvitations(ctx) : [];
  const ownerCount = members.filter((m) => m.role === "OWNER").length;
  const roles = invitableRoles(ctx);

  return (
    <div className="flex flex-col gap-6">
      {canInvite ? (
        <Panel className="p-5">
          <SectionTitle>Invite a teammate</SectionTitle>
          <InviteForm orgSlug={ctx.org.slug} roles={roles} />
        </Panel>
      ) : null}

      <section>
        <SectionTitle>Members · {members.length}</SectionTitle>
        <TableWrap>
          <Table>
            <THead>
              <tr>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Role</Th>
                <Th>Title</Th>
                <Th>Joined</Th>
                <Th className="text-right">Controls owned</Th>
                <Th className="text-right">Open tasks</Th>
                <Th className="w-24" />
              </tr>
            </THead>
            <tbody>
              {members.map((m) => {
                const isLastOwner = m.role === "OWNER" && ownerCount <= 1;
                const options = ROLES.filter(
                  (r) =>
                    r === m.role ||
                    can(ctx, "member.changeRole", { targetRole: m.role, newRole: r, isLastOwner }),
                );
                const otherRole = ROLES.find((r) => r !== m.role)!;
                const roleReason =
                  options.length <= 1
                    ? denialReason(ctx, "member.changeRole", {
                        targetRole: m.role,
                        newRole: otherRole,
                        isLastOwner,
                      })
                    : null;
                const self = m.user.id === ctx.user.id;
                const removeReason = self
                  ? null
                  : denialReason(ctx, "member.remove", {
                      targetRole: m.role,
                      targetUserId: m.user.id,
                      isLastOwner,
                    });
                const showRemove = !self && can(ctx, "invitation.revoke");
                return (
                  <Tr key={m.id}>
                    <Td className="max-w-48">
                      <Person name={m.user.name} />
                      {self ? (
                        <span className="text-muted-foreground ml-1 text-xs">(you)</span>
                      ) : null}
                    </Td>
                    <Td className="text-muted-foreground max-w-56 truncate">{m.user.email}</Td>
                    <Td>
                      <RoleSelect
                        orgSlug={ctx.org.slug}
                        memberId={m.id}
                        role={m.role}
                        options={options}
                        reason={roleReason}
                      />
                    </Td>
                    <Td className="text-muted-foreground">{m.title ?? "—"}</Td>
                    <Td
                      className="text-muted-foreground whitespace-nowrap"
                      title={formatTimestamp(m.createdAt, ctx.org.timezone)}
                    >
                      <TimeAgo date={m.createdAt} timeZone={ctx.org.timezone} />
                    </Td>
                    <Td className="text-right tabular-nums">{m.controlsOwned}</Td>
                    <Td className="text-right tabular-nums">{m.openTasks}</Td>
                    <Td className="text-right">
                      {showRemove ? (
                        <RemoveMemberButton
                          orgSlug={ctx.org.slug}
                          memberId={m.id}
                          name={m.user.name}
                          reason={removeReason}
                        />
                      ) : null}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </TableWrap>
      </section>

      {canInvite ? (
        <section>
          <SectionTitle>Invitations</SectionTitle>
          {invitations.length === 0 ? (
            <p className="text-muted-foreground text-[13px]">No invitations sent yet.</p>
          ) : (
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <Th>Email</Th>
                    <Th>Role</Th>
                    <Th>State</Th>
                    <Th>Invited by</Th>
                    <Th>Sent</Th>
                    <Th>Expires</Th>
                    <Th className="w-56" />
                  </tr>
                </THead>
                <tbody>
                  {invitations.map((i) => (
                    <Tr key={i.id}>
                      <Td className="max-w-56 truncate">{i.email}</Td>
                      <Td>{i.role.charAt(0) + i.role.slice(1).toLowerCase()}</Td>
                      <Td>
                        <Status map={INVITATION_STATE} value={i.state} text />
                      </Td>
                      <Td className="text-muted-foreground">{i.invitedBy.name}</Td>
                      <Td className="text-muted-foreground">
                        <TimeAgo date={i.createdAt} timeZone={ctx.org.timezone} />
                      </Td>
                      <Td className="text-muted-foreground whitespace-nowrap">
                        {i.state === "PENDING" || i.state === "EXPIRED"
                          ? formatTimestamp(i.expiresAt, ctx.org.timezone)
                          : "—"}
                      </Td>
                      <Td className="text-right">
                        <InvitationActions
                          orgSlug={ctx.org.slug}
                          invitationId={i.id}
                          email={i.email}
                          state={i.state}
                          canRegenerate={can(ctx, "member.invite", { role: i.role })}
                        />
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </section>
      ) : null}

      <Panel className="p-5">
        <SectionTitle>Leave organization</SectionTitle>
        <p className="text-muted-foreground mb-3 text-[13px]">
          You can leave at any time unless you are the last Owner.
        </p>
        <LeaveButton
          orgSlug={ctx.org.slug}
          reason={denialReason(ctx, "member.leave", {
            isLastOwner: ctx.role === "OWNER" && ownerCount <= 1,
          })}
        />
      </Panel>
    </div>
  );
}
