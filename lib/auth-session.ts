import { env } from "cloudflare:workers";
import { createAuth, isAuthRuntimeConfigured } from "./auth";

export interface SessionActor {
  userId: string;
}

export async function getSessionActor(
  request: Pick<Request, "headers">,
): Promise<SessionActor | null> {
  if (!isAuthRuntimeConfigured(env)) return null;

  const session = await createAuth(env).api.getSession({
    headers: request.headers,
  });

  return session?.user.id ? { userId: session.user.id } : null;
}
