// Zod schemas for the categories endpoints.

import { z } from "zod";

// POST /api/categories
export const createCategorySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  // Hex color like "#ff0000" — strict format so the frontend never gets garbage in the swatch
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a 6-digit hex like #ff0000"),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
