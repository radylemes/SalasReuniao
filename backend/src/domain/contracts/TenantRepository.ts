import { Localidade, Tenant } from "../entities/Tenant";

export interface TenantRepository {
  findByLocalidade(localidade: Localidade): Promise<Tenant | null>;
}
