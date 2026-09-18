import { z } from "zod";

export const passwordSchema = z.string().min(12).max(128);

export const registerRequestSchema = z.object({
  email: z.string().trim().pipe(z.email().max(254)),
  password: passwordSchema,
  displayName: z.string().trim().min(2).max(80),
  workspaceName: z.string().trim().min(2).max(120)
});

export const loginRequestSchema = z.object({
  email: z.string().trim().pipe(z.email().max(254)),
  password: z.string().min(1).max(128)
});

export const authSessionSchema = z.object({
  user: z.object({
    id: z.string().min(1),
    email: z.email(),
    displayName: z.string().min(1)
  }),
  workspace: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    role: z.enum(["owner", "admin", "member"])
  })
});

export const authErrorSchema = z.object({
  error: z.enum(["invalid_credentials", "email_taken", "unauthorized", "validation_error", "database_unavailable"]),
  message: z.string()
});

export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type AuthSession = z.infer<typeof authSessionSchema>;
