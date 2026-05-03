// Express router for /api/notifications/* endpoints.
// requireAuth is applied at mount time in app.ts.

import { Router } from "express";

import * as notificationsController from "./notifications.controller";

const router = Router();

// GET /api/notifications                — list (paginated, ?unreadOnly=true to filter)
router.get("/", notificationsController.list);

// PATCH /api/notifications/read-all 
//   Defined BEFORE the parametric :id route so "read-all" doesn't get matched as an id.
router.patch("/read-all", notificationsController.markAllAsRead);

// PATCH /api/notifications/:id/read 
router.patch("/:id/read", notificationsController.markAsRead);

export default router;
