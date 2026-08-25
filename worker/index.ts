/** Cloudflare Worker entry point for the Vinext application. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { CANONICAL_ORIGIN, FALLBACK_WORKER_HOST } from "../lib/auth-constants";
import { getSessionActor } from "../lib/auth-session";
import { authorizeLiveSessionConnection } from "../lib/campaigns/live-session-service";
import { CampaignServiceError } from "../lib/campaigns/service";

export { CampaignLiveSession } from "./campaign-live-session";

const supportedImageFormats = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
  "rgb",
  "rgba",
] as const);

type SupportedImageFormat =
  | "image/jpeg"
  | "image/png"
  | "image/gif"
  | "image/webp"
  | "image/avif"
  | "rgb"
  | "rgba";

function supportedImageFormat(value: string): SupportedImageFormat {
  return supportedImageFormats.has(value as SupportedImageFormat)
    ? (value as SupportedImageFormat)
    : "image/webp";
}

const worker = {
  async fetch(request: Request, env: CloudflareEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (
      url.hostname === FALLBACK_WORKER_HOST &&
      url.pathname.startsWith("/api/auth/")
    ) {
      return Response.redirect(
        new URL(url.pathname + url.search, CANONICAL_ORIGIN),
        307,
      );
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format: supportedImageFormat(format), quality });
          return result.response();
        },
      }, allowedWidths);
    }

    const liveSession = url.pathname.match(/^\/api\/campaigns\/(cmp_[A-Za-z0-9_-]{22})\/session\/live$/u);
    if (liveSession && request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      try {
        const actor = await getSessionActor(request);
        if (!actor) return Response.json({ error: "Sign in is required." }, { status: 401 });
        const connection = await authorizeLiveSessionConnection(env.DB, actor, liveSession[1]);
        const headers = new Headers(request.headers);
        headers.set("X-TWE-Session-Id", connection.sessionId);
        headers.set("X-TWE-Participant-Key", connection.participantKey);
        return env.CAMPAIGN_LIVE_SESSION.getByName(`campaign:${connection.campaignId}`).fetch(new Request(request, { headers }));
      } catch (error) {
        const status = error instanceof CampaignServiceError ? error.status : 503;
        const message = error instanceof CampaignServiceError ? error.message : "Live sessions are temporarily unavailable.";
        return Response.json({ error: message }, { status });
      }
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker satisfies ExportedHandler<CloudflareEnv>;
