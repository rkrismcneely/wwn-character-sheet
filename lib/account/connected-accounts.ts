import { AUTH_PROVIDERS, configuredProviders, type ProviderConfiguration } from "../auth-providers.ts";

export async function authenticationSafeguardsReady(db: D1Database): Promise<boolean> {
  const row = await db.prepare(`SELECT COUNT(*) AS count FROM sqlite_master
    WHERE tbl_name = 'account' AND name IN
    ('account_provider_identity_unique', 'account_user_provider_unique', 'account_keep_login_method')`).first<{ count: number }>();
  return row?.count === 3;
}

export async function availableAuthProviders(db: D1Database, env: ProviderConfiguration) {
  const providers = configuredProviders(env);
  if (providers.includes("discord") && !await authenticationSafeguardsReady(db)) return providers.filter(provider => provider !== "discord");
  return providers;
}

export async function connectedAccounts(db: D1Database, userId: string, env: ProviderConfiguration) {
  const rows = await db.prepare("SELECT provider_id AS provider FROM account WHERE user_id = ?")
    .bind(userId).all<{ provider: string }>();
  const connected = new Set(rows.results.map(row => row.provider));
  const available = await availableAuthProviders(db, env);
  const canUnlink = await authenticationSafeguardsReady(db);
  return AUTH_PROVIDERS.map(provider => ({
    provider,
    connected: connected.has(provider),
    available: available.includes(provider),
    canDisconnect: canUnlink && connected.has(provider) && available.some(other => other !== provider && connected.has(other)),
  }));
}

export type ConnectedAccount = Awaited<ReturnType<typeof connectedAccounts>>[number];
