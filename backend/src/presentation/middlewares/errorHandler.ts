import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../../application/errors/AppError";

function normalizeStatusCode(value: unknown, fallback = 500): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  if (parsed < 100 || parsed > 999) return fallback;
  return parsed;
}

function mapGraphError(error: any) {
  const statusCode = normalizeStatusCode(error?.statusCode ?? error?.status, 500);
  const code = error?.code ?? error?.body?.error?.code ?? "INTERNAL_ERROR";
  const details = error?.body ?? error?.message ?? error;

  if (statusCode === 401 || code === "InvalidAuthenticationToken" || code === "invalid_token") {
    return {
      statusCode: 401,
      code: "INVALID_TOKEN",
      message: "Token expirado ou invalido",
      details,
    };
  }

  if (statusCode === 403) {
    return {
      statusCode: 403,
      code: "FORBIDDEN_RESOURCE",
      message: "Acesso negado ao tenant/recurso",
      details,
    };
  }

  return {
    statusCode,
    code,
    message: error?.message ?? "Erro interno.",
    details,
  };
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const correlationId = req.correlationId ?? "n/a";

  if (err instanceof AppError) {
    const statusCode = normalizeStatusCode(err.statusCode, 400);
    return res.status(statusCode).json({
      code: err.code,
      message: err.message,
      details: err.details ?? null,
      correlationId,
    });
  }

  if (err instanceof ZodError) {
    const first = err.issues[0];
    const path = first?.path?.join(".") ?? "";
    const message = first ? (path ? `${path}: ${first.message}` : first.message) : "Dados invalidos.";
    return res.status(400).json({
      code: "VALIDATION_ERROR",
      message,
      details: err.issues,
      correlationId,
    });
  }

  const mapped = mapGraphError(err);
  return res.status(mapped.statusCode).json({
    code: mapped.code,
    message: mapped.message,
    details: mapped.details ?? null,
    correlationId,
  });
}
