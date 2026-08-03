type Context = { params: Promise<{ key: string[] }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { env } = await import("cloudflare:workers");
    if (!env.BUCKET) throw new Error("Portrait storage is unavailable.");
    const { key } = await context.params;
    const object = await env.BUCKET.get(key.join("/"));
    if (!object) return new Response("Portrait not found.", { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("cache-control", "public, max-age=31536000, immutable");
    return new Response(object.body, { headers });
  } catch {
    return new Response("Portrait unavailable.", { status: 503 });
  }
}
