// Zod schemas for the documents endpoints.
// Schemas double as the type sources via z.infer.

import { z } from "zod";

// POST /api/documents/upload
export const uploadDocumentSchema = z.object({
  name: z.string().trim().min(1, "Name cannot be empty").max(255).optional(),
  description: z.string().trim().max(2000).optional(),
  categoryId: z.string().min(1).optional(),
});

// PUT /api/documents/:id
// categoryId is .nullable() so the client can send `null` to explicitly
// clear the category (vs omitting the key entirely = "don't change").
export const updateDocumentSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(2000).optional(),
  categoryId: z.string().min(1).nullable().optional(),
});

// GET /api/documents query string: pagination + filter + search
// Our validate middleware only handles req.body; the controller will run
// `listDocumentsQuerySchema.parse(req.query)` itself.
export const listDocumentsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  categoryId: z.string().optional(),
  search: z.string().trim().min(1).optional(),
});

export type UploadDocumentInput = z.infer<typeof uploadDocumentSchema>;
export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;
export type ListDocumentsQuery = z.infer<typeof listDocumentsQuerySchema>;
