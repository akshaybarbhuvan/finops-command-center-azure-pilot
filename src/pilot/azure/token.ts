import "server-only";
// Azure Resource Manager access tokens for the application's own identity.
// On App Service: the managed identity only (no secrets). Elsewhere (operator CLI / local validation):
// the developer's Azure CLI sign-in. Client-secret environment credentials are deliberately not used.
import { AzureCliCredential, ManagedIdentityCredential, type TokenCredential } from "@azure/identity";

const ARM_SCOPE = "https://management.azure.com/.default";

export function createCredential(env: Record<string, string | undefined>, managedIdentityClientId?: string): TokenCredential {
  if (env.WEBSITE_SITE_NAME || env.IDENTITY_ENDPOINT) {
    return managedIdentityClientId ? new ManagedIdentityCredential({ clientId: managedIdentityClientId }) : new ManagedIdentityCredential();
  }
  return new AzureCliCredential();
}

export function armTokenProvider(credential: TokenCredential) {
  return async (signal?: AbortSignal) => {
    const t = await credential.getToken(ARM_SCOPE, { abortSignal: signal });
    if (!t?.token) throw new Error("No token");
    return t.token;
  };
}
