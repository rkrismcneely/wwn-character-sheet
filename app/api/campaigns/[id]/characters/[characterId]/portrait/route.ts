import { env } from "cloudflare:workers";
import { getSessionActor } from "@/lib/auth-session";
import { readCampaignLinkedCharacter } from "@/lib/campaigns/characters";
import { getCampaignD1 } from "@/lib/campaigns/service";
import { validPortraitObjectKey } from "@/lib/characters/portraits";

type Context = {
  params: Promise<{ id: string; characterId: string }>;
};

function notFound(): Response {
  return new Response("Portrait not found.", { status: 404 });
}

function portraitKey(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/api/portraits/")) {
    return null;
  }
  try {
    const key = value
      .slice("/api/portraits/".length)
      .split("/")
      .map(part => decodeURIComponent(part))
      .join("/");
    return validPortraitObjectKey(key) ? key : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) return notFound();
    const { id, characterId } = await context.params;
    const payload = await readCampaignLinkedCharacter(
      await getCampaignD1(),
      actor,
      id,
      characterId,
      { rewritePortrait: false },
    );
    const key = portraitKey(payload.character.portrait);
    if (!key) return notFound();
    const object = await env.BUCKET.get(key);
    if (!object) return notFound();
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("cache-control", "private, no-store");
    headers.set("x-content-type-options", "nosniff");
    return new Response(object.body, { headers });
  } catch {
    return notFound();
  }
}
