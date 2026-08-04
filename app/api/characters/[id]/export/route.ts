import { getSessionActor } from "@/lib/auth-session";
import { authorizeCharacterWrite } from "@/lib/characters/authorization";
import { isPlausiblePublicCharacterId } from "@/lib/characters/identifiers";
import { safeCharacterExport } from "@/lib/characters/sanitize";
import { findCharacterByPublicId, getD1 } from "../../db";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context): Promise<Response> {
  const actor = await getSessionActor(request);
  if (!actor) {
    return Response.json({ error: "Sign in is required." }, { status: 401 });
  }

  try {
    const { id: publicId } = await context.params;
    if (!isPlausiblePublicCharacterId(publicId)) {
      return Response.json({ error: "Character not found." }, { status: 404 });
    }
    const row = await findCharacterByPublicId(await getD1(), publicId);
    if (!row) {
      return Response.json({ error: "Character not found." }, { status: 404 });
    }
    const authorization = authorizeCharacterWrite(actor, row);
    if (!authorization.allowed) {
      return Response.json(
        { error: authorization.status === 404 ? "Character not found." : "Not permitted." },
        { status: authorization.status },
      );
    }

    return Response.json({
      format: "wwn-character-sheet",
      version: 2,
      exportedAt: new Date().toISOString(),
      character: safeCharacterExport(JSON.parse(row.data) as unknown),
    });
  } catch {
    return Response.json(
      { error: "The character could not be exported." },
      { status: 500 },
    );
  }
}
