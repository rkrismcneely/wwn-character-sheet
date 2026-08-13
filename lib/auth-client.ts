"use client";

import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";
import type { Auth } from "./auth";
import { CANONICAL_ORIGIN, FALLBACK_WORKER_HOST } from "./auth-constants";

function authBaseURL(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return window.location.hostname === FALLBACK_WORKER_HOST
    ? CANONICAL_ORIGIN
    : undefined;
}

export const authClient = createAuthClient({
  baseURL: authBaseURL(),
  plugins: [inferAdditionalFields<Auth>()],
});
