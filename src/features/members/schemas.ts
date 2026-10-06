import { z } from "zod";
import { emailSchema } from "@/features/auth/schemas";

export const ROLE_VALUES = ["OWNER", "ADMIN", "MEMBER", "VIEWER"] as const;

export const ROLE_DESCRIPTIONS: Record<(typeof ROLE_VALUES)[number], string> = {
  OWNER: "Full control, including managing Owners.",
  ADMIN: "Runs the program: settings, members, controls, evidence review.",
  MEMBER: "Owns controls, uploads evidence, works on tasks and risks.",
  VIEWER: "Read-only access, including evidence downloads and the audit log.",
};

export const inviteSchema = z.object({
  email: emailSchema,
  role: z.enum(ROLE_VALUES),
});

export const changeRoleSchema = z.object({ role: z.enum(ROLE_VALUES) });
