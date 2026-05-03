"use client";

// Top bar shown on every /dashboard/* page.
// Online indicator subscribes to socket connect/disconnect events so it

import { useEffect, useState } from "react";

import { useAuth } from "@/contexts/auth-context";
import { getSocket } from "@/lib/socket";
import { NotificationBell } from "./NotificationBell";

export function Header() {
  const { user, logout } = useAuth();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    setConnected(socket.connected);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, []);

  return (
    <header className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <h1 className="text-xl font-bold text-gray-900">DMS</h1>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  connected ? "bg-green-500" : "bg-gray-400"
                }`}
                aria-label={connected ? "Online" : "Offline"}
              />
              <span className="hidden sm:inline">
                {connected ? "Online" : "Offline"}
              </span>
            </div>

            <NotificationBell />

            {/* User name */}
            {user && (
              <span className="hidden sm:inline text-sm font-medium text-gray-700">
                {user.name}
              </span>
            )}

            <button
              onClick={logout}
              className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 transition"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
