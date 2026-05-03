// Express router for /api/documents/* endpoints.
// All routes are gated by requireAuth 

import { Router } from "express";

import { uploadSingle } from "../../middlewares/upload.middleware";
import { validate } from "../../middlewares/validate.middleware";

import * as documentsController from "./documents.controller";
import {
  updateDocumentSchema,
  uploadDocumentSchema,
} from "./documents.validation";

const router = Router();

router.post(
  "/upload",
  uploadSingle,
  validate(uploadDocumentSchema),
  documentsController.upload,
);

// GET /api/documents          — list with pagination/filter/search
router.get("/", documentsController.list);

// GET /api/documents/:id      — single doc
router.get("/:id", documentsController.getById);

// PUT /api/documents/:id      — metadata update only (no file)
router.put("/:id", validate(updateDocumentSchema), documentsController.update);

router.delete("/:id", documentsController.remove);

export default router;
