import { auth, isAuthRuntimeConfigured } from "./auth";

export interface SessionActor {
  userId: string;
}

export async function getSessionActor(
  request: Pick<Request, "headers">,
): Promise<SessionActor | null> {
  if (!isAuthRuntimeConfigured()) return null;

  const session = await auth.api.getSession({
    headers: request.headers,
  });

  return session?.user.id ? { userId: session.user.id } : null;
}
