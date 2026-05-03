// HTTP handlers for /api/auth/*.

import type { Request, Response } from "express";

import { UnauthorizedError } from "../../utils/errors";
import * as authService from "./auth.service";
import type {
  LoginInput,
  LogoutInput,
  RefreshInput,
  RegisterInput,
} from "./auth.validation";

export async function register(req: Request, res: Response): Promise<void> {
  const result = await authService.register(req.body as RegisterInput);
  res.status(201).json(result);
}

export async function login(req: Request, res: Response): Promise<void> {
  const result = await authService.login(req.body as LoginInput);
  res.status(200).json(result);
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const { refreshToken } = req.body as RefreshInput;
  const result = await authService.refresh(refreshToken);
  res.status(200).json(result);
}

export async function logout(req: Request, res: Response): Promise<void> {
  // requireAuth runs first and guarantees req.user; the check is just for TS narrowing.
  if (!req.user) throw new UnauthorizedError();
  const { refreshToken } = req.body as LogoutInput;
  await authService.logout(req.user.jti, req.user.exp, refreshToken);
  res.status(204).send();
}
