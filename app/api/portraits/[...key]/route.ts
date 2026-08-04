import { getSessionActor } from "@/lib/auth-session";
import { canReadCharacter } from "@/lib/characters/authorization";
import {
  portraitURL,
  validPortraitObjectKey,
} from "@/lib/characters/portraits";
import { getD1 } from "@/app/api/characters/db";

type Context = { params: Promise<{ key: string[] }> };

interface PortraitCharacterRow {
  ownerUserId: string | null;
  visibility: "private" | "unlisted" | "public";
}

export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const { key: keyParts } = await context.params;
    const key = keyParts.join("/");
    if (!validPortraitObjectKey(key)) {
      return new Response("Portrait not found.", { status: 404 });
    }

    const canonicalURL = portraitURL(key);
    const legacyEncodedURL = `/api/portraits/${encodeURIComponent(key)}`;
    const row = await (await getD1())
      .prepare(
        `SELECT owner_user_id AS ownerUserId, visibility
         FROM characters
         WHERE portrait_key = ?
            OR json_extract(data, '$.portrait') = ?
            OR json_extract(data, '$.portrait') = ?
         LIMIT 1`,
      )
      .bind(key, canonicalURL, legacyEncodedURL)
      .first<PortraitCharacterRow>();
    const actor = await getSessionActor(request);
    if (!row || !canReadCharacter(actor, row)) {
      return new Response("Portrait not found.", { status: 404 });
    }

    const { env } = await import("cloudflare:workers");
    const object = await env.BUCKET.get(key);
    if (!object) return new Response("Portrait not found.", { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("cache-control", "private, no-store");
    headers.set("x-content-type-options", "nosniff");
    return new Response(object.body, { headers });
  } catch {
    return new Response("Portrait unavailable.", { status: 503 });
  }
}
