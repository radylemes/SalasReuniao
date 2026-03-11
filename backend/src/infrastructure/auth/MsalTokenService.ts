import { ConfidentialClientApplication } from "@azure/msal-node";
import { Tenant } from "../../domain/entities/Tenant";
import { AppError } from "../../application/errors/AppError";

export class MsalTokenService {
  private readonly apps = new Map<string, ConfidentialClientApplication>();

  private getOrCreateApp(tenant: Tenant) {
    const key = tenant.localidade.toLowerCase();
    const existing = this.apps.get(key);
    if (existing) return existing;

    const app = new ConfidentialClientApplication({
      auth: {
        clientId: tenant.clientId,
        authority: `https://login.microsoftonline.com/${tenant.tenantId}`,
        clientSecret: tenant.clientSecret,
      },
    });
    this.apps.set(key, app);
    return app;
  }

  async getAccessToken(tenant: Tenant) {
    const app = this.getOrCreateApp(tenant);
    const result = await app.acquireTokenByClientCredential({
      scopes: ["https://graph.microsoft.com/.default"],
    });

    if (!result?.accessToken) {
      throw new AppError("TOKEN_ACQUISITION_FAILED", "Falha ao adquirir token do Graph.", 401);
    }

    return result.accessToken;
  }
}
