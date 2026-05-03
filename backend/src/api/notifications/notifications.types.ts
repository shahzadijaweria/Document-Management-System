// Module-local types for the notifications feature.

export type NotificationRecord = {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: Date;
};

export type ListNotificationsResponse = {
  items: NotificationRecord[];
  total: number;
  unreadCount: number; // for the badge
  page: number;
  limit: number;
};
