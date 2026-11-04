/** Cloudflare Worker entry point for the Vinext application. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { CANONICAL_ORIGIN, FALLBACK_WORKER_HOST } from "../lib/auth-constants";
import { getSessionActor } from "../lib/auth-session";
import { authorizeLiveSessionConnection } from "../lib/campaigns/live-session-service";
import { CampaignServiceError } from "../lib/campaigns/service";
import { runGeminiScheduledTick } from "../lib/campaigns/recap-gemini-scheduler";
import {POST as postGeminiTranscription} from "../app/api/campaigns/[id]/session-recaps/transcript/gemini/route";
import {POST as postGroqTranscription} from "../app/api/campaigns/[id]/session-recaps/transcript/transcribe/route";
import {matchDirectRecapTranscription} from "../lib/campaigns/recap-direct-transcription";
import {handleStagedRecapAudio} from "../lib/campaigns/recap-staged-audio";
import { runRecapOnlyScheduledTick } from "../lib/campaigns/recap-only-runner";
import { runVerifiedGeminiRecapRecoveryTick } from "../lib/campaigns/recap-gemini-auto-recovery";
import { runVerifiedSingleAudioRecoveryTick } from "../lib/campaigns/recap-gemini-single-recovery";
import {
  CLIENT_ERROR_REPORT_PATH,
  OBSERVABILITY_EVENT_VERSION,
  createErrorFingerprint,
  normalizeClientErrorReport,
  sanitizeErrorName,
  sanitizeRayId,
  sanitizeRoutePath,
} from "../lib/observability";

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

const MAX_CLIENT_ERROR_BODY = 4096;

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

function requestContext(request: Request) {
  return {
    route: sanitizeRoutePath(request.url),
    method: request.method,
    ray: sanitizeRayId(request.headers.get("cf-ray")),
  };
}

function logServerResponse(request: Request, status: number, category = "server-response") {
  console.error({
    event: "twe_server_error",
    version: OBSERVABILITY_EVENT_VERSION,
    category,
    status,
    ...requestContext(request),
  });
}

async function logUnexpectedServerError(
  request: Request,
  error: unknown,
  category = "uncaught-exception",
) {
  console.error({
    event: "twe_server_error",
    version: OBSERVABILITY_EVENT_VERSION,
    category,
    errorName: sanitizeErrorName(error instanceof Error ? error.name : undefined),
    fingerprint: await createErrorFingerprint(error),
    ...requestContext(request),
  });
}

function genericUnexpectedResponse(url: URL): Response {
  if (url.pathname.startsWith("/api/")) {
    return Response.json({ error: "An unexpected server error occurred." }, { status: 500 });
  }
  return new Response("Tales Without End hit an unexpected server error.", {
    status: 500,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

async function handleClientErrorReport(request: Request, url: URL): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { allow: "POST" } });
  }

  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if ((origin && origin !== url.origin) || fetchSite === "cross-site") {
    return new Response(null, { status: 403 });
  }

  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return new Response(null, { status: 415 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_CLIENT_ERROR_BODY) {
    return new Response(null, { status: 413 });
  }

  const raw = await request.text();
  if (raw.length > MAX_CLIENT_ERROR_BODY) return new Response(null, { status: 413 });

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return new Response(null, { status: 400 });
  }

  const report = normalizeClientErrorReport(parsed);
  if (!report) return new Response(null, { status: 400 });

  console.error({
    event: "twe_client_error",
    version: OBSERVABILITY_EVENT_VERSION,
    ...report,
    ray: sanitizeRayId(request.headers.get("cf-ray")),
  });

  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}

const worker = {
  async scheduled(_controller: ScheduledController, env: CloudflareEnv,
    ctx: ExecutionContext): Promise<void> {
    // No external AI usage unless a verified, explicit rollout flag is enabled.
    // Errors never disclose OAuth/API credentials or raw transcription content.
    ctx.waitUntil(runGeminiScheduledTick(env as unknown as Parameters<typeof runGeminiScheduledTick>[0])
      .catch(() => {
        console.error({event:"twe_gemini_cron_failed",category:"transcription-scheduler"});
      }));
    ctx.waitUntil(runRecapOnlyScheduledTick(env as unknown as Parameters<typeof runRecapOnlyScheduledTick>[0])
      .catch(() => {
        console.error({event:"twe_recap_only_cron_failed",category:"private-recap-scheduler"});
      }).then(() => runVerifiedGeminiRecapRecoveryTick(
        env as unknown as Parameters<typeof runVerifiedGeminiRecapRecoveryTick>[0]
      )).then(() => runVerifiedSingleAudioRecoveryTick(
        env as unknown as Parameters<typeof runVerifiedSingleAudioRecoveryTick>[0]
      )).catch(() => {
        console.error({event:"twe_recap_recovery_failed",category:"private-recap-scheduler"});
      }));
  },
  async fetch(request: Request, env: CloudflareEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    try {
      if (url.pathname === CLIENT_ERROR_REPORT_PATH) {
        return await handleClientErrorReport(request, url);
      }

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
          if (error instanceof CampaignServiceError) {
            if (status >= 500) logServerResponse(request, status, "live-session-response");
          } else {
            await logUnexpectedServerError(request, error, "live-session-exception");
          }
          return Response.json({ error: message }, { status });
        }
      }

      // Recap cloud-audio uploads can be 5–11 MiB per prepared section.
      // Route these two exact POST endpoints directly to their already
      // authenticated app handlers, bypassing the framework request-body
      // parser which can respond with plain-text "Payload Too Large" before
      // the route handler is invoked. Cloudflare's ingress body limit remains
      // in force; the app handlers still validate size, GM permissions, CSRF,
      // speaker attribution and explicit provider consent.
      // Prepared audio crosses the ingress boundary in <=512 KiB pieces.
      // Only the exact authenticated GM staging endpoint is handled here.
      const stagedClip=url.pathname.match(
        /^\/api\/campaigns\/(cmp_[A-Za-z0-9_-]{22})\/session-recaps\/transcript\/staged\/(gemini|groq)$/u);
      if(request.method==="POST"&&stagedClip){
        const response=await handleStagedRecapAudio(request,stagedClip[1],
          stagedClip[2] as "gemini"|"groq",env.BUCKET);
        if(response.status>=500)logServerResponse(request,response.status,"recap-staging-response");
        return response;
      }
      const transcribeClip=matchDirectRecapTranscription(url.pathname,request.method);
      if(transcribeClip){
        const routeContext={params:Promise.resolve({id:transcribeClip.campaignId})};
        const response=transcribeClip.provider==="gemini"
          ?await postGeminiTranscription(request,routeContext)
          :await postGroqTranscription(request,routeContext);
        if(response.status>=500)logServerResponse(request,response.status,"recap-transcription-response");
        return response;
      }
      const response = await handler.fetch(request, env, ctx);
      if (response.status >= 500) logServerResponse(request, response.status);
      return response;
    } catch (error) {
      if (error instanceof Response) return error;
      await logUnexpectedServerError(request, error);
      return genericUnexpectedResponse(url);
    }
  },
};

export default worker satisfies ExportedHandler<CloudflareEnv>;
