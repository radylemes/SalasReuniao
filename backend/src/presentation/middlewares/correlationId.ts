import { randomUUID } from "node:crypto";
import { Request, Response, NextFunction } from "express";

export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const correlationId = req.header("x-correlation-id") ?? randomUUID();
  req.correlationId = correlationId;
  res.setHeader("x-correlation-id", correlationId);
  next();
}
