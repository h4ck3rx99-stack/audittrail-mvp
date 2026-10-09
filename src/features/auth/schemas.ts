import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "Email is too long.")
  .pipe(z.email("Enter a valid email address."));

export const passwordSchema = z
  .string()
  .min(12, "Use at least 12 characters.")
  .max(128, "Use at most 128 characters.");

export const nameSchema = z
  .string()
  .trim()
  .min(1, "Enter your name.")
  .max(100, "Use at most 100 characters.");

export const signUpSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
});
export type SignUpInput = z.infer<typeof signUpSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  // Never apply the policy at login; just bound the length.
  password: z.string().min(1, "Enter your password.").max(128, "Invalid email or password."),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().min(1).max(200),
  password: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password.").max(128),
  newPassword: passwordSchema,
});

export const updateProfileSchema = z.object({ name: nameSchema });
