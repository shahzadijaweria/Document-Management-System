// HTTP handlers for /api/categories/*.
// All routes are protected by requireAuth.

import type { Request, Response } from "express";

import * as categoriesService from "./categories.service";
import type { CreateCategoryInput } from "./categories.validation";

export async function list(_req: Request, res: Response): Promise<void> {
  const result = await categoriesService.list();
  res.status(200).json(result);
}

export async function create(req: Request, res: Response): Promise<void> {
  const result = await categoriesService.create(req.body as CreateCategoryInput);
  res.status(201).json(result);
}
