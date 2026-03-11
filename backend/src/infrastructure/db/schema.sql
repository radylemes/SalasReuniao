CREATE TABLE IF NOT EXISTS tenants (
  id SERIAL PRIMARY KEY,
  localidade VARCHAR(120) NOT NULL UNIQUE,
  tenant_id VARCHAR(120) NOT NULL,
  client_id VARCHAR(120) NOT NULL,
  client_secret TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenants_localidade ON tenants (localidade);
