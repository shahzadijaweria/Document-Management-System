// Zod schemas for the auth endpoints.

import { z } from "zod";

// ─── Register ───────────────────────────────────────────────────

export const registerSchema = z.object({
  email: z.email("Invalid email address").trim().toLowerCase(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password too long"), // upper bound prevents bcrypt 72-byte truncation surprises and DoS
  name: z.string().trim().min(1, "Name is required").max(100, "Name too long"),
});

// ─── Login ──────────────────────────────────────────────────────
// No length minimum here — old accounts may have shorter passwords than current rules.
// We just require non-empty; the actual check happens in bcrypt.compare.
export const loginSchema = z.object({
  email: z.email("Invalid email address").trim().toLowerCase(),
  password: z.string().min(1, "Password is required"),
});

// ─── Refresh ────────────────────────────────────────────────────
export const refreshSchema = z.object({
  refreshToken: z.string().min(1, "refreshToken is required"),
});

// ─── Logout ─────────────────────────────────────────────────────
// refreshToken is optional: if sent, we revoke it too so it can't mint new
// access tokens. Without it, only the current access token is revoked.
export const logoutSchema = z.object({
  refreshToken: z.string().min(1).optional(),
});

// Inferred types — derived from the schemas above. Single source of truth.
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type LogoutInput = z.infer<typeof logoutSchema>;
