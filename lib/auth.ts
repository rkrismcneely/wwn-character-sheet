import { env } from "cloudflare:workers";
import { betterAuth } from "better-auth";
import { CANONICAL_ORIGIN } from "./auth-constants";

export const LOCAL_AUTH_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
] as const;

const requiredAuthBindingNames = [
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
] as const;

export type AuthBindingName = (typeof requiredAuthBindingNames)[number];

export function missingAuthBindings(
  runtimeEnv: Pick<CloudflareEnv, AuthBindingName> = env,
): AuthBindingName[] {
  return requiredAuthBindingNames.filter(
    (name) => typeof runtimeEnv[name] !== "string" || runtimeEnv[name].length === 0,
  );
}

export function isAuthRuntimeConfigured(
  runtimeEnv: Pick<CloudflareEnv, AuthBindingName> = env,
): boolean {
  return missingAuthBindings(runtimeEnv).length === 0;
}

export const auth = betterAuth({
  database: env.DB,
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  basePath: "/api/auth",
  trustedOrigins: [CANONICAL_ORIGIN, ...LOCAL_AUTH_ORIGINS],
  emailAndPassword: {
    enabled: false,
  },
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      disableDefaultScope: true,
      scope: ["openid", "email", "profile"],
    },
  },
  user: {
    fields: {
      emailVerified: "email_verified",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  session: {
    fields: {
      expiresAt: "expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
      ipAddress: "ip_address",
      userAgent: "user_agent",
      userId: "user_id",
    },
  },
  account: {
    encryptOAuthTokens: true,
    fields: {
      accountId: "account_id",
      providerId: "provider_id",
      userId: "user_id",
      accessToken: "access_token",
      refreshToken: "refresh_token",
      idToken: "id_token",
      accessTokenExpiresAt: "access_token_expires_at",
      refreshTokenExpiresAt: "refresh_token_expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  verification: {
    fields: {
      expiresAt: "expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    modelName: "rate_limit",
    fields: {
      lastRequest: "last_request",
    },
  },
  advanced: {
    useSecureCookies: env.BETTER_AUTH_URL?.startsWith("https://") ?? false,
    disableCSRFCheck: false,
    disableOriginCheck: false,
    crossSubDomainCookies: {
      enabled: false,
    },
    ipAddress: {
      ipAddressHeaders: ["cf-connecting-ip"],
    },
    database: {
      generateId: "uuid",
    },
  },
  logger: {
    level: "error",
  },
});

export type Auth = typeof auth;
