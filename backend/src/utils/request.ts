// Small helpers used across controllers to pull values out of req with narrowing
// and validation.

import type { Request } from "express";

import { BadRequestError, UnauthorizedError } from "./errors";

// Pulls userId from req.user (set by requireAuth). Throws 401 if missing —
// shouldn't happen if requireAuth ran, but defensive narrowing for TypeScript.
export function getUserId(req: Request): string {
  if (!req.user) throw new UnauthorizedError();
  return req.user.id;
}

// Express 5 types req.params.id as string | string[] (wildcard support).
// Our routes only use single :id, so narrow to plain string and validate.
export function getIdParam(req: Request): string {
  const id = req.params.id;
  if (typeof id !== "string" || id.length === 0) {
    throw new BadRequestError("Invalid id");
  }
  return id;
}
