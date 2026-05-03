// Express router for /api/categories/* endpoints.
// requireAuth is applied at mount time in app.ts.

import { Router } from "express";

import { requireAdmin } from "../../middlewares/auth.middleware";
import { validate } from "../../middlewares/validate.middleware";
import * as categoriesController from "./categories.controller";
import { createCategorySchema } from "./categories.validation";

const router = Router();

router.get("/", categoriesController.list);

router.post("/", requireAdmin, validate(createCategorySchema), categoriesController.create);

export default router;
