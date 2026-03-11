import { Tenant } from "../../domain/entities/Tenant";

declare global {
  namespace Express {
    interface Request {
      tenant?: Tenant;
      localidade?: string;
      correlationId?: string;
    }
  }
}

export {};
