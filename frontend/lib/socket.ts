// Singleton Socket.io client.
// connect() reads the access token from auth storage and includes it in the
// handshake. socket.io's built-in reconnection handles transient network blips.
//
// Components subscribe via getSocket() and listen for events:
//   document:uploaded / document:updated / document:deleted
//   notification:new / user:online / user:offline / connection:status

import { io, type Socket } from "socket.io-client";

import { getAccessToken } from "./auth";

const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:4000";

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  return socket;
}

export function connectSocket(): Socket | null {
  if (socket?.connected) return socket;

  const token = getAccessToken();
  if (!token) return null;

  socket = io(SOCKET_URL, {
    auth: { token },
    reconnection: true,
    // Never give up — server outages are usually transient.
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000, // start at 1s
    reconnectionDelayMax: 5000, // cap exponential backoff at 5s
    // Default transports = ["polling", "websocket"]. Allows fallback when the
    // WebSocket upgrade fails (e.g., during backend restart or behind some proxies).
  });

  // Lightweight console logs make connection issues debuggable from devtools.
  socket.on("connect", () => {
    console.log("[socket] connected", socket?.id);
  });
  socket.on("disconnect", (reason) => {
    console.log("[socket] disconnected:", reason);
  });
  socket.on("connect_error", (err) => {
    console.warn("[socket] connect_error:", err.message);
  });

  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

// ─── Own-action marker (used to suppress duplicate toast in own tab) ──
// Components call markOwnAction() RIGHT BEFORE making an API call.
// Socket-event listeners check isRecentOwnAction() to skip echoes of their
// own action (the user already saw a success toast from the API path).
let lastOwnActionAt = 0;

export function markOwnAction(): void {
  lastOwnActionAt = Date.now();
}

export function isRecentOwnAction(windowMs = 2500): boolean {
  return Date.now() - lastOwnActionAt < windowMs;
}
