// Zod schema for the notifications endpoints.

import { z } from "zod";

// GET /api/notifications query string
export const listNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  // ?unreadOnly=true filters to unread; anything else (missing, "false") means show all.
  // Transform from string to boolean since query params arrive as strings.
  unreadOnly: z
    .string()
    .optional()
    .transform((v) => v === "true"),
});

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
