// HTTP handlers for /api/documents/*.
// All routes are protected by requireAuth
// Validation already happened in the validate middleware (for body) — we just
// trust req.body here. Query params (list endpoint) are parsed inline below.

import { z } from "zod";
import type { Request, Response } from "express";

import { BadRequestError } from "../../utils/errors";
import { getIdParam, getUserId } from "../../utils/request";
import * as documentsService from "./documents.service";
import {
  listDocumentsQuerySchema,
  type UpdateDocumentInput,
  type UploadDocumentInput,
} from "./documents.validation";

export async function upload(req: Request, res: Response): Promise<void> {
  // Multer middleware guarantees req.file when it runs successfully.
  if (!req.file) throw new BadRequestError("No file uploaded");

  const result = await documentsService.create(
    getUserId(req),
    req.body as UploadDocumentInput,
    req.file,
  );
  res.status(201).json(result);
}

export async function list(req: Request, res: Response): Promise<void> {
  // The validate middleware only handles req.body; parse query inline.
  const parsed = listDocumentsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new BadRequestError(
      "Invalid query parameters",
      z.flattenError(parsed.error).fieldErrors,
    );
  }

  const result = await documentsService.list(getUserId(req), parsed.data);
  res.status(200).json(result);
}

export async function getById(req: Request, res: Response): Promise<void> {
  const result = await documentsService.getById(getUserId(req), getIdParam(req));
  res.status(200).json(result);
}

export async function update(req: Request, res: Response): Promise<void> {
  const result = await documentsService.update(
    getUserId(req),
    getIdParam(req),
    req.body as UpdateDocumentInput,
  );
  res.status(200).json(result);
}

export async function remove(req: Request, res: Response): Promise<void> {
  await documentsService.remove(getUserId(req), getIdParam(req));
  res.status(204).send();
}
