import { getSessionActor } from "@/lib/auth-session";
import { readBoundedJson, RequestBodyError } from "@/lib/http-json";
import {
  createOwnedCharacter,
  getD1,
  listCharacters,
} from "./db";

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const requestedScope = url.searchParams.get("scope") ?? "public";
    if (requestedScope !== "mine" && requestedScope !== "public") {
      return Response.json({ error: "Invalid library scope." }, { status: 400 });
    }

    const actor = await getSessionActor(request);
    if (requestedScope === "mine" && !actor) {
      return Response.json({ error: "Sign in is required." }, { status: 401 });
    }

    const rows = await listCharacters(await getD1(), {
      actor,
      scope: requestedScope,
      query: url.searchParams.get("q") ?? undefined,
    });
    return Response.json({
      characters: rows.map(({ ownerUserId, publicId, ...row }) => ({
        id: publicId,
        ...row,
        permissions: { canEdit: actor?.userId === ownerUserId },
      })),
    });
  } catch {
    return Response.json(
      { error: "The character library is temporarily unavailable." },
      { status: 503 },
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  const actor = await getSessionActor(request);
  if (!actor) {
    return Response.json({ error: "Sign in is required." }, { status: 401 });
  }

  try {
    const body = (await readBoundedJson(request)) as { character?: unknown };
    const created = await createOwnedCharacter(
      await getD1(),
      actor.userId,
      body?.character,
    );
    return Response.json(
      {
        id: created.publicId,
        version: created.version,
        visibility: "private",
        updatedAt: created.updatedAt,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof TypeError) {
      return Response.json({ error: "Invalid character data." }, { status: 400 });
    }
    return Response.json(
      { error: "The character could not be created." },
      { status: 500 },
    );
  }
}
