import { TenantRepository } from "../../domain/contracts/TenantRepository";
import { Localidade, Tenant } from "../../domain/entities/Tenant";
import { pool } from "../db/postgres";

type TenantRow = {
  id: number;
  localidade: string;
  tenant_id: string;
  client_id: string;
  client_secret: string;
  active: boolean;
  created_at: Date;
  updated_at: Date;
};

export class PostgresTenantRepository implements TenantRepository {
  async findByLocalidade(localidade: Localidade): Promise<Tenant | null> {
    const { rows } = await pool.query<TenantRow>(
      `SELECT id, localidade, tenant_id, client_id, client_secret, active, created_at, updated_at
       FROM tenants
       WHERE localidade = $1 AND active = TRUE
       LIMIT 1`,
      [localidade],
    );

    const row = rows[0];
    if (!row) return null;

    return {
      id: row.id,
      localidade: row.localidade,
      tenantId: row.tenant_id,
      clientId: row.client_id,
      clientSecret: row.client_secret,
      active: row.active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
