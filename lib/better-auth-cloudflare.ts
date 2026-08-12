import { getBetterAuthVersion } from "@better-auth/core/context";
import { AsyncLocalStorage } from "node:async_hooks";

type BetterAuthGlobalContext = {
  adapterAsyncStorage?: AsyncLocalStorage<unknown>;
  endpointContextAsyncStorage?: AsyncLocalStorage<unknown>;
  requestStateAsyncStorage?: AsyncLocalStorage<unknown>;
};

type BetterAuthGlobal = {
  context: BetterAuthGlobalContext;
};

const betterAuthGlobalSymbol = Symbol.for("better-auth:global");

/**
 * Better Auth 1.6.x lazily imports node:async_hooks and caches that promise at
 * module scope. On Cloudflare, a dynamic import first evaluated by an aborted
 * request can remain tied to that request's I/O context. Install the three
 * stateless AsyncLocalStorage instances synchronously so request handling never
 * awaits that cached import.
 */
export function initializeBetterAuthCloudflareAsyncStorage(): void {
  getBetterAuthVersion();
  const betterAuthGlobal = Reflect.get(
    globalThis,
    betterAuthGlobalSymbol,
  ) as BetterAuthGlobal | undefined;

  if (!betterAuthGlobal?.context) {
    throw new Error("Better Auth global context is unavailable.");
  }

  betterAuthGlobal.context.adapterAsyncStorage ??= new AsyncLocalStorage();
  betterAuthGlobal.context.endpointContextAsyncStorage ??= new AsyncLocalStorage();
  betterAuthGlobal.context.requestStateAsyncStorage ??= new AsyncLocalStorage();
}

initializeBetterAuthCloudflareAsyncStorage();
