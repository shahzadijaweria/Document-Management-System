"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";

import { useAuth } from "@/contexts/auth-context";
import { UploadZone } from "@/components/UploadZone";
import { DocumentList } from "@/components/DocumentList";
import { CategoryManager } from "@/components/CategoryManager";
import { getSocket, isRecentOwnAction } from "@/lib/socket";

type NotificationPayload = {
  id: string;
  type: string;
  title: string;
  message: string;
};

export default function DashboardPage() {
  const { user } = useAuth();
  // Bumping refreshKey triggers DocumentList to refetch.
  // Triggers come from: local uploads, local edits/deletes, AND socket events from other tabs/devices.
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);

  // Wire realtime — document events refresh the list silently;
  // notifications show as toasts (except for echoes of our own actions —
  // see markOwnAction() called inside UploadZone / EditModal / DeleteConfirm).
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const bumpRefresh = () => setRefreshKey((k) => k + 1);

    const showNotification = (notif: NotificationPayload) => {
      if (isRecentOwnAction()) return; // own-action echo → success toast already shown
      toast(notif.title, { icon: "🔔", duration: 4000 });
    };

    socket.on("document:uploaded", bumpRefresh);
    socket.on("document:updated", bumpRefresh);
    socket.on("document:deleted", bumpRefresh);
    socket.on("notification:new", showNotification);

    return () => {
      socket.off("document:uploaded", bumpRefresh);
      socket.off("document:updated", bumpRefresh);
      socket.off("document:deleted", bumpRefresh);
      socket.off("notification:new", showNotification);
    };
  }, []);

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">
          Welcome, {user?.name ?? "there"}
        </h2>
        <p className="text-gray-600 mt-1">Manage your documents below.</p>
      </div>

      <UploadZone onUploaded={refresh} />

      {/* Renders only when the logged-in user has role: ADMIN */}
      <div className="mt-8">
        <CategoryManager />
      </div>

      <div className="mt-8">
        <DocumentList refreshKey={refreshKey} onChanged={refresh} />
      </div>
    </div>
  );
}
