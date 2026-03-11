import dotenv from "dotenv";
import { pool } from "./postgres";

dotenv.config();

async function run() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tenants (
      id SERIAL PRIMARY KEY,
      localidade VARCHAR(120) NOT NULL UNIQUE,
      tenant_id VARCHAR(120) NOT NULL,
      client_id VARCHAR(120) NOT NULL,
      client_secret TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(
    `
    INSERT INTO tenants (localidade, tenant_id, client_id, client_secret, active)
    VALUES
      ('WTorre', $1, $2, $3, TRUE),
      ('Allianz', $4, $5, $6, TRUE)
    ON CONFLICT (localidade)
    DO UPDATE SET
      tenant_id = EXCLUDED.tenant_id,
      client_id = EXCLUDED.client_id,
      client_secret = EXCLUDED.client_secret,
      active = EXCLUDED.active,
      updated_at = NOW();
  `,
    [
      process.env.WTORRE_TENANT_ID ?? "replace-wtorre-tenant-id",
      process.env.WTORRE_CLIENT_ID ?? "replace-wtorre-client-id",
      process.env.WTORRE_CLIENT_SECRET ?? "replace-wtorre-client-secret",
      process.env.ALLIANZ_TENANT_ID ?? "replace-allianz-tenant-id",
      process.env.ALLIANZ_CLIENT_ID ?? "replace-allianz-client-id",
      process.env.ALLIANZ_CLIENT_SECRET ?? "replace-allianz-client-secret",
    ],
  );

  console.log("Seed executada com sucesso.");
  await pool.end();
}

run().catch(async (error) => {
  console.error("Erro ao executar seed:", error);
  await pool.end();
  process.exit(1);
});
