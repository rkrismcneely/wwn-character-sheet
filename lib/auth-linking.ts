import { APIError, createAuthMiddleware, getOAuthState, getSessionFromCtx } from "better-auth/api";
import { getCurrentAuthContext } from "@better-auth/core/context";
import { type AuthProvider, type ProviderConfiguration } from "./auth-providers.ts";
import { authenticationSafeguardsReady, availableAuthProviders, connectedAccounts } from "./account/connected-accounts.ts";

/** These values are set by the server, then protected by Better Auth's OAuth state. */
export function accountSecurityHooks(db: D1Database, env: ProviderConfiguration, baseURL: string) {
  return {
    before: createAuthMiddleware(async ctx => {
      if (ctx.path === "/sign-in/social" || ctx.path === "/link-social") {
        const provider = ctx.body?.provider as AuthProvider;
        if (!(await availableAuthProviders(db, env)).includes(provider)) throw new APIError("BAD_REQUEST", { code: "PROVIDER_NOT_FOUND", message: "Sign-in method unavailable." });
        for (const field of ["callbackURL", "newUserCallbackURL", "errorCallbackURL"] as const) {
          const value = ctx.body?.[field];
          if (value && new URL(value, baseURL).origin !== new URL(baseURL).origin) {
            throw new APIError("BAD_REQUEST", { code: "INVALID_CALLBACK_URL", message: "Invalid return destination." });
          }
        }
        if (ctx.path === "/link-social") {
          if (!await authenticationSafeguardsReady(db)) throw new APIError("BAD_REQUEST", { code: "PROVIDER_NOT_FOUND", message: "Connected accounts are not available yet." });
          const session = await getSessionFromCtx(ctx, { disableCookieCache: true });
          if (!session) throw new APIError("UNAUTHORIZED", { code: "UNAUTHORIZED", message: "Sign in is required." });
          if (Date.now() - new Date(session.session.createdAt).getTime() > ctx.context.sessionConfig.freshAge * 1000) {
            throw new APIError("UNAUTHORIZED", { code: "SESSION_EXPIRED", message: "Please sign in again." });
          }
          // This application uses the authorization-code linking path, never client-supplied tokens.
          if (ctx.body?.idToken) throw new APIError("BAD_REQUEST", { message: "Use the provider authorization flow." });
          const existing = await connectedAccounts(db, session.user.id, env);
          if (existing.some(account => account.provider === provider && account.connected)) {
            throw new APIError("BAD_REQUEST", { code: "ACCOUNT_ALREADY_CONNECTED", message: "Sign-in method already connected." });
          }
          ctx.body.callbackURL = "/account?connected=1";
        }
        ctx.body.errorCallbackURL = "/auth/error";
        ctx.body.additionalData = { tweProvider: provider };
      }
      if (ctx.path === "/unlink-account") {
        const session = await getSessionFromCtx(ctx, { disableCookieCache: true });
        if (!session) throw new APIError("UNAUTHORIZED", { code: "UNAUTHORIZED", message: "Sign in is required." });
        const accounts = await connectedAccounts(db, session.user.id, env);
        if (!accounts.some(account => account.provider === ctx.body?.providerId && account.canDisconnect)) {
          throw new APIError("BAD_REQUEST", { code: "FAILED_TO_UNLINK_LAST_ACCOUNT", message: "Connect another available sign-in method first." });
        }
      }
    }),
  };
}

/** Called after Better Auth validates/consumes OAuth state, before any identity writes. */
export async function validateProviderCallback(provider: AuthProvider, db: D1Database): Promise<void> {
  const current = await getCurrentAuthContext();
  if (!current.path?.startsWith("/callback/")) return;
  // A provider callback runs inside a complete Better Auth endpoint context.
  const ctx = current as Parameters<typeof getSessionFromCtx>[0];
  const state = await getOAuthState();
  if (state?.tweProvider !== provider) throw ctx.redirect(new URL("/auth/error?error=state_mismatch", ctx.context.baseURL).href);
  if ((provider === "discord" || state.link) && !await authenticationSafeguardsReady(db)) {
    throw ctx.redirect(new URL("/auth/error?error=provider_not_found", ctx.context.baseURL).href);
  }
  if (state.link) {
    const session = await getSessionFromCtx(ctx, { disableCookieCache: true });
    if (!session || session.user.id !== state.link.userId) {
      throw ctx.redirect(new URL("/auth/error?error=link_session_changed", ctx.context.baseURL).href);
    }
  }
}

/** Reuse a real canonical email ONLY after an exact, already-linked provider-ID lookup. */
export async function discordProfileEmail(db: D1Database, profile: { id: string; email?: string | null; verified?: boolean }) {
  const existing = await db.prepare(`SELECT u.email, u.email_verified AS verified
    FROM account a JOIN user u ON u.id = a.user_id
    WHERE a.provider_id = 'discord' AND a.account_id = ?`).bind(profile.id)
    .first<{ email: string; verified: number }>();
  if (existing) return { email: existing.email, emailVerified: Boolean(existing.verified) };
  const email = typeof profile.email === "string" ? profile.email.trim() : "";
  return { email: profile.verified === true && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) ? email : undefined, emailVerified: profile.verified === true && Boolean(email) };
}
