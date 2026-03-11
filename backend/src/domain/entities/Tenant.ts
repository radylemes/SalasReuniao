export type Localidade = "WTorre" | "Allianz" | (string & {});

export interface Tenant {
  id: number;
  localidade: Localidade;
  tenantId: string;
  clientId: string;
  clientSecret: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}
