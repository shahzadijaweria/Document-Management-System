// Notifications business logic.
// Notifications are user-scoped — every query filters by userId.
// `create` is exported as an internal helper for other services (documents,
// categories) to call when they want to notify a user.

import { prisma } from "../../db/prisma";
import { NotFoundError } from "../../utils/errors";
import { emitToUser } from "../../sockets";



import type { ListNotificationsQuery } from "./notifications.validation";
import type {
  ListNotificationsResponse,
  NotificationRecord,
} from "./notifications.types";

export async function list(
  userId: string,
  query: ListNotificationsQuery,
): Promise<ListNotificationsResponse> {
  const where = {
    userId,
    ...(query.unreadOnly ? { read: false } : {}),
  };

  // Three counts in parallel: items page + total matching + total unread (for badge)
  const [items, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: { createdAt: "desc" },
    }),
    prisma.notification.count({ where }), // shows total count
    prisma.notification.count({ where: { userId, read: false } }),  // shows unread count
  ]);

  return { items, total, unreadCount, page: query.page, limit: query.limit };
}

export async function markAsRead(
  userId: string,
  id: string,
): Promise<NotificationRecord> {
  // Ownership check via the userId in the where clause.
  const existing = await prisma.notification.findFirst({
    where: { id, userId },
  });
  if (!existing) throw new NotFoundError("Notification not found");

  const updated = await prisma.notification.update({
    where: { id },
    data: { read: true },
  });

  // Tell other tabs/devices of this user so their badge updates.
  emitToUser(userId, "notification:read", { id });

  return updated;
}

export async function markAllAsRead(
  userId: string,
): Promise<{ count: number }> {
  const result = await prisma.notification.updateMany({
    where: { userId, read: false },
    data: { read: true },
  });

  emitToUser(userId, "notifications:read-all", {});

  return { count: result.count };
}

// Internal helper called by other services as a side effect.
// Persists the notification AND emits "notification:new" to the user's tabs.
export async function create(input: {
  userId: string;
  type: string;
  title: string;
  message: string;
}): Promise<NotificationRecord> {
  const notification = await prisma.notification.create({ data: input });
  emitToUser(input.userId, "notification:new", notification);
  return notification;
}
