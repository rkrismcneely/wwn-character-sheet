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
  account: {
    encryptOAuthTokens: true,
  },
  rateLimit: {
    enabled: true,
    storage: "database",
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
