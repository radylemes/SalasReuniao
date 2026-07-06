import { timingSafeEqual } from "node:crypto";
import { NextFunction, Request, Response } from "express";
import { AppError } from "../../application/errors/AppError";

function keysMatch(provided: string, configured: string): boolean {
  if (provided.length !== configured.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(provided), Buffer.from(configured));
}

export function adminAuthMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const configuredKey = process.env.ADMIN_API_KEY?.trim();
  if (!configuredKey) {
    next(new AppError("ADMIN_NOT_CONFIGURED", "Administração não configurada (ADMIN_API_KEY).", 503));
    return;
  }

  const providedKey = req.header("x-admin-key")?.trim();
  if (!providedKey || !keysMatch(providedKey, configuredKey)) {
    next(new AppError("ADMIN_UNAUTHORIZED", "Chave de administração inválida.", 401));
    return;
  }

  next();
}
