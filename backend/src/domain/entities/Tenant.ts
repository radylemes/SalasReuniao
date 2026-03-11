export type Localidade = "WTorre" | "Allianz" | (string & {});

export interface Tenant {
  localidade: Localidade;
  tenantId: string;
  clientId: string;
  clientSecret: string;
}
