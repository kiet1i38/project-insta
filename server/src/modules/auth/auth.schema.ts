import { z } from "zod";

const reservedUsernames = new Set([
  "admin",
  "api",
  "login",
  "moderator",
  "support"
]);

const usernamePattern = /^[a-z0-9._]+$/;
const passwordComplexityPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(72, "Password must be 72 characters or fewer.")
  .regex(
    passwordComplexityPattern,
    "Password must include at least one lowercase letter, one uppercase letter, and one number."
  );

const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters.")
  .max(30, "Username must be 30 characters or fewer.")
  .transform((value) => value.toLowerCase())
  .refine((value) => usernamePattern.test(value), {
    message:
      "Username may contain only lowercase letters, numbers, dots, and underscores."
  })
  .refine((value) => !reservedUsernames.has(value), {
    message: "Username is reserved."
  });

export const registerSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(1, "Display name is required.")
      .max(50, "Display name must be 50 characters or fewer."),
    username: usernameSchema,
    email: z
      .string()
      .trim()
      .email("Email must be valid.")
      .transform((value) => value.toLowerCase()),
    password: passwordSchema,
    confirmPassword: z.string()
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"]
  })
  .transform((data) => ({
    displayName: data.displayName,
    username: data.username,
    email: data.email,
    password: data.password
  }));

export const loginSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(1, "Email or username is required.")
    .max(254, "Email or username is too long.")
    .transform((value) => value.toLowerCase()),
  password: z
    .string()
    .min(1, "Password is required.")
    .max(72, "Password must be 72 characters or fewer.")
});

const emailSchema = z
  .string()
  .trim()
  .email("Email must be valid.")
  .transform((value) => value.toLowerCase());

export const emailVerificationRequestSchema = z.object({
  email: emailSchema
});

export const emailVerificationConfirmSchema = z.object({
  token: z
    .string()
    .trim()
    .min(1, "Verification token is required.")
    .max(200, "Verification token is invalid.")
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type EmailVerificationRequestInput = z.infer<
  typeof emailVerificationRequestSchema
>;
export type EmailVerificationConfirmInput = z.infer<
  typeof emailVerificationConfirmSchema
>;
