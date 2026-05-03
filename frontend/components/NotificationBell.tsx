"use client";

// Bell + dropdown in the header.
//   - Badge shows unread count (capped at "99+")
//   - Click bell -> dropdown with recent notifications
//   - Click outside -> dropdown closes
//   - Click an unread notification -> mark as read (optimistic update)
//   - "Mark all as read" link
//   - Subscribes to socket "notification:new" -> refetches list + count

import { useEffect, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import toast from "react-hot-toast";
import axios from "axios";

import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
};

type ListResponse = {
  items: NotificationItem[];
  total: number;
  unreadCount: number;
  page: number;
  limit: number;
};

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  async function fetchNotifications() {
    setLoading(true);
    try {
      const { data } = await api.get<ListResponse>(
        "/api/notifications?page=1&limit=10",
      );
      setItems(data.items);
      setUnreadCount(data.unreadCount);
    } catch {
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchNotifications();

    const socket = getSocket();
    if (!socket) return;

    
    const refetch = () => fetchNotifications();

    socket.on("notification:new", refetch);
    socket.on("notification:read", refetch);
    socket.on("notifications:read-all", refetch);

    return () => {
      socket.off("notification:new", refetch);
      socket.off("notification:read", refetch);
      socket.off("notifications:read-all", refetch);
    };
  }, []);

  // Auto-mark-on-view: while the dropdown is open, any unread notification
  // that becomes >50% visible gets marked as read. Discord/Twitter-style "I saw it".
  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    const triggered = new Set<string>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const id = entry.target.getAttribute("data-id");
          if (!id || triggered.has(id)) continue;

          const notif = items.find((n) => n.id === id);
          if (notif && !notif.read) {
            triggered.add(id);
            markAsRead(id);
          }
        }
      },
      { threshold: 0.5 },
    );

    containerRef.current.querySelectorAll("li[data-id]").forEach((li) => {
      observer.observe(li);
    });

    return () => observer.disconnect();
  }, [isOpen, items]);

  // Close dropdown on outside click.
  useEffect(() => {
    if (!isOpen) return;
    function handler(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  async function markAsRead(id: string) {
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
    try {
      await api.patch(`/api/notifications/${id}/read`);
    } catch (err) {
      // Roll back on failure + toast
      fetchNotifications();
      const msg = axios.isAxiosError(err)
        ? err.response?.data?.error?.message ?? "Failed to mark as read"
        : "Failed to mark as read";
      toast.error(msg);
    }
  }

  async function markAllAsRead() {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    try {
      await api.patch("/api/notifications/read-all");
    } catch (err) {
      fetchNotifications();
      const msg = axios.isAxiosError(err)
        ? err.response?.data?.error?.message ?? "Failed"
        : "Failed";
      toast.error(msg);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Bell button with badge */}
      <button
        onClick={() => setIsOpen((o) => !o)}
        className="relative rounded-full p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition"
        aria-label={`Notifications (${unreadCount} unread)`}
      >
        <span className="text-lg">🔔</span>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-xs font-bold rounded-full">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-lg border border-gray-200 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <h4 className="font-semibold text-gray-900">Notifications</h4>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-xs text-blue-600 hover:underline font-medium"
              >
                Mark all as read
              </button>
            )}
          </div>

          {loading && items.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-500">
              Loading...
            </div>
          ) : items.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-500">
              No notifications yet
            </div>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {items.map((notif) => (
                <li
                  key={notif.id}
                  data-id={notif.id}
                  onClick={() => !notif.read && markAsRead(notif.id)}
                  className={`px-4 py-3 border-b border-gray-100 last:border-b-0 transition ${
                    notif.read
                      ? "cursor-default"
                      : "cursor-pointer hover:bg-gray-50 bg-blue-50/40"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {!notif.read && (
                      <span className="mt-1.5 inline-block h-2 w-2 rounded-full bg-blue-500 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {notif.title}
                      </p>
                      <p className="text-xs text-gray-600 truncate">
                        {notif.message}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {formatDistanceToNow(new Date(notif.createdAt), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
