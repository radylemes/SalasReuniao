import { NextFunction, Request, Response } from "express";
import { TenantRepository } from "../../domain/contracts/TenantRepository";
import { AppError } from "../../application/errors/AppError";

export function tenantResolverMiddleware(tenantRepository: TenantRepository) {
  return async function resolveTenant(req: Request, _res: Response, next: NextFunction) {
    try {
      const localidade =
        req.header("x-localidade") ??
        (typeof req.query.localidade === "string" ? req.query.localidade : undefined) ??
        process.env.DEFAULT_LOCALIDADE;

      if (!localidade) {
        throw new AppError(
          "LOCALIDADE_REQUIRED",
          "Informe a localidade via header x-localidade ou query localidade.",
          400,
        );
      }

      const tenant = await tenantRepository.findByLocalidade(localidade);
      if (!tenant) {
        throw new AppError("TENANT_NOT_FOUND", `Tenant nao encontrado para localidade ${localidade}.`, 404);
      }

      req.localidade = localidade;
      req.tenant = tenant;
      next();
    } catch (error) {
      next(error);
    }
  };
}
