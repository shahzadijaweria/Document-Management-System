"use client";

// Auth context — single source of truth for "who is logged in" client-side.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

import { api } from "@/lib/api";
import {
  type AuthUser,
  clearAuth,
  getRefreshToken,
  getUser,
  setTokens,
  setUser as persistUser,
} from "@/lib/auth";
import { connectSocket, disconnectSocket } from "@/lib/socket";

type AuthResponse = {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    name: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const stored = getUser();
    if (stored) {
      setUserState(stored);
      connectSocket();
    }
    setIsLoading(false);
  }, []);

  const handleAuthSuccess = useCallback((data: AuthResponse) => {
    setTokens(data.accessToken, data.refreshToken);
    persistUser(data.user);
    setUserState(data.user);
    connectSocket();
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const { data } = await api.post<AuthResponse>("/api/auth/login", {
        email,
        password,
      });
      handleAuthSuccess(data);
    },
    [handleAuthSuccess],
  );

  const register = useCallback(
    async (email: string, password: string, name: string) => {
      const { data } = await api.post<AuthResponse>("/api/auth/register", {
        email,
        password,
        name,
      });
      handleAuthSuccess(data);
    },
    [handleAuthSuccess],
  );

  const logout = useCallback(async () => {
    try {
      // Best-effort logout call: revokes both tokens server-side.
      // Even if it fails (network, 401), we still clear locally.
      await api.post("/api/auth/logout", {
        refreshToken: getRefreshToken(),
      });
    } catch {
    }
    clearAuth();
    setUserState(null);
    disconnectSocket();
    router.push("/login");
  }, [router]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: user !== null,
        isLoading,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
