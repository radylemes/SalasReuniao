import { TenantRepository } from "../../domain/contracts/TenantRepository";
import { Localidade, Tenant } from "../../domain/entities/Tenant";

type EnvTenantDefinition = {
  localidade: Localidade;
  tenantIdEnv: string;
  clientIdEnv: string;
  clientSecretEnv: string;
};

const TENANT_DEFINITIONS: EnvTenantDefinition[] = [
  {
    localidade: "WTorre",
    tenantIdEnv: "WTORRE_TENANT_ID",
    clientIdEnv: "WTORRE_CLIENT_ID",
    clientSecretEnv: "WTORRE_CLIENT_SECRET",
  },
  {
    localidade: "Allianz",
    tenantIdEnv: "ALLIANZ_TENANT_ID",
    clientIdEnv: "ALLIANZ_CLIENT_ID",
    clientSecretEnv: "ALLIANZ_CLIENT_SECRET",
  },
];

export class EnvTenantRepository implements TenantRepository {
  private readonly tenantsByLocalidade = new Map<string, Tenant>();

  constructor() {
    for (const definition of TENANT_DEFINITIONS) {
      const tenantId = process.env[definition.tenantIdEnv]?.trim();
      const clientId = process.env[definition.clientIdEnv]?.trim();
      const clientSecret = process.env[definition.clientSecretEnv]?.trim();

      if (!tenantId || !clientId || !clientSecret) {
        continue;
      }

      const tenant: Tenant = {
        localidade: definition.localidade,
        tenantId,
        clientId,
        clientSecret,
      };

      this.tenantsByLocalidade.set(this.normalizeLocalidade(definition.localidade), tenant);
    }
  }

  async findByLocalidade(localidade: Localidade): Promise<Tenant | null> {
    const key = this.normalizeLocalidade(localidade);
    return this.tenantsByLocalidade.get(key) ?? null;
  }

  private normalizeLocalidade(localidade: string): string {
    return localidade.trim().toLowerCase();
  }
}
