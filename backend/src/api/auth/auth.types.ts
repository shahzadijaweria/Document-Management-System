// Public user shape — what we return from auth endpoints.
// passwordHash is intentionally not here so it can never leak to clients.
export type SafeUser = {
  id: string;
  email: string;
  name: string;
  role: "USER" | "ADMIN";
  createdAt: Date;
  updatedAt: Date;
};

export type AuthResult = {
  user: SafeUser;
  accessToken: string;
  refreshToken: string;
};

export type RefreshResult = {
  accessToken: string;
  refreshToken: string;
};
