// Validates req.body against a zod schema.
// On failure, throws a BadRequestError with field-level details.
// On success, replaces req.body with the parsed (typed) data.

import type { Request, Response, NextFunction } from "express";
import type { ZodType } from "zod";

import { BadRequestError } from "../utils/errors";

export function validate(schema: ZodType<unknown>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      next(new BadRequestError("Validation failed", result.error.issues));
      return;
    }

    req.body = result.data;
    next();
  };
}
