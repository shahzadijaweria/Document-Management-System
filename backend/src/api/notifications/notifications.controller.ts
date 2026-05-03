// HTTP handlers for /api/notifications/*.
// All routes are protected by requireAuth 

import { z } from "zod";
import type { Request, Response } from "express";

import { BadRequestError } from "../../utils/errors";
import { getIdParam, getUserId } from "../../utils/request";
import * as notificationsService from "./notifications.service";
import { listNotificationsQuerySchema } from "./notifications.validation";

export async function list(req: Request, res: Response): Promise<void> {
  const parsed = listNotificationsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new BadRequestError(
      "Invalid query parameters",
      z.flattenError(parsed.error).fieldErrors,
    );
  }

  const result = await notificationsService.list(getUserId(req), parsed.data);
  res.status(200).json(result);
}

export async function markAsRead(req: Request, res: Response): Promise<void> {
  const result = await notificationsService.markAsRead(
    getUserId(req),
    getIdParam(req),
  );
  res.status(200).json(result);
}

export async function markAllAsRead(
  req: Request,
  res: Response,
): Promise<void> {
  const result = await notificationsService.markAllAsRead(getUserId(req));
  res.status(200).json(result);
}
