import "cross-fetch/polyfill";
import { Client } from "@microsoft/microsoft-graph-client";
import { Tenant } from "../../domain/entities/Tenant";
import { MsalTokenService } from "../auth/MsalTokenService";

export class GraphClientFactory {
  constructor(private readonly tokenService: MsalTokenService) {}

  create(tenant: Tenant) {
    return Client.init({
      authProvider: async (done) => {
        try {
          const token = await this.tokenService.getAccessToken(tenant);
          done(null, token);
        } catch (error) {
          done(error as Error, null);
        }
      },
    });
  }
}
