const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const maxBytes = 5 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const { env } = await import("cloudflare:workers");
    if (!env.BUCKET) throw new Error("Portrait storage is unavailable.");
    const contentType = request.headers.get("content-type")?.split(";")[0].trim() || "";
    if (!allowedTypes.has(contentType)) {
      return Response.json({ error: "Use a JPG, PNG, WebP, or GIF image." }, { status: 415 });
    }
    const bytes = await request.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > maxBytes) {
      return Response.json({ error: "Portrait images must be smaller than 5 MB." }, { status: 413 });
    }
    const extension = contentType === "image/jpeg" ? "jpg" : contentType.split("/")[1];
    const key = `portraits/${crypto.randomUUID()}.${extension}`;
    await env.BUCKET.put(key, bytes, {
      httpMetadata: { contentType, cacheControl: "public, max-age=31536000, immutable" },
    });
    return Response.json({ url: `/api/portraits/${encodeURIComponent(key)}` }, { status: 201 });
  } catch {
    return Response.json({ error: "The portrait could not be uploaded." }, { status: 500 });
  }
}
