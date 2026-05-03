// Request:  attach Authorization: Bearer <accessToken> if present.
// Response: on 401, try /api/auth/refresh once; if that succeeds, retry the
//           original request with the new token. If it fails too -> clear tokens
//           and redirect to /login.

import axios, { type InternalAxiosRequestConfig } from "axios";

import {
  clearAuth,
  getAccessToken,
  getRefreshToken,
  setTokens,
} from "./auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export const api = axios.create({
  baseURL: API_URL,
});

// Attach token to every request
api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Track which requests have already been retried so we don't loop forever
type RetriedConfig = InternalAxiosRequestConfig & { _retry?: boolean };

// Use a bare axios instance for the refresh call so the response interceptor
// here doesn't recursively try to refresh on a refresh failure.
const refreshAxios = axios.create({ baseURL: API_URL });

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as RetriedConfig | undefined;
    if (!originalRequest) return Promise.reject(error);

    const isUnauthorized = error.response?.status === 401;
    const alreadyRetried = originalRequest._retry === true;
    const isAuthEndpoint = originalRequest.url?.includes("/api/auth/") ?? false;

    if (!isUnauthorized || alreadyRetried || isAuthEndpoint) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      const refreshToken = getRefreshToken();
      if (!refreshToken) throw new Error("No refresh token");

      const { data } = await refreshAxios.post<{
        accessToken: string;
        refreshToken: string;
      }>("/api/auth/refresh", { refreshToken });

      setTokens(data.accessToken, data.refreshToken);
      originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
      return api(originalRequest);
    } catch (refreshError) {
      // Refresh failed — log out and bounce to login
      clearAuth();
      if (typeof window !== "undefined" && window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
      return Promise.reject(refreshError);
    }
  },
);
