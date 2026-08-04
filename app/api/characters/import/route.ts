import { getSessionActor } from "@/lib/auth-session";
import { parseCharacterImport } from "@/lib/characters/sanitize";
import { readBoundedJson, RequestBodyError } from "@/lib/http-json";
import { createOwnedCharacter, getD1 } from "../db";

export async function POST(request: Request): Promise<Response> {
  const actor = await getSessionActor(request);
  if (!actor) {
    return Response.json({ error: "Sign in is required." }, { status: 401 });
  }

  try {
    const imported = parseCharacterImport(await readBoundedJson(request));
    if (!imported) {
      return Response.json(
        { error: "Unsupported or malformed character export." },
        { status: 422 },
      );
    }

    const created = await createOwnedCharacter(
      await getD1(),
      actor.userId,
      imported.character,
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
    return Response.json(
      { error: "The character could not be imported." },
      { status: 500 },
    );
  }
}
