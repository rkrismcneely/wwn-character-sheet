import { getSessionActor } from "@/lib/auth-session";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import { getCampaignD1 } from "@/lib/campaigns/service";
import {
  createCampaignSessionRecap, getCampaignSessionRecap, listCampaignSessionRecaps,
  sessionRecapArchive, updateCampaignSessionRecap,
} from "@/lib/campaigns/session-recaps";
import { readBoundedJson, RequestBodyError } from "@/lib/http-json";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const { id } = await context.params;
    const query = new URL(request.url).searchParams;
    const db = await getCampaignD1();
    if (query.has("recapId")) return Response.json({ recap: await getCampaignSessionRecap(db, actor, id, query.get("recapId")) });
    if (query.get("view") === "player") return Response.json(await sessionRecapArchive(db, actor, id));
    const page = Number(query.get("page") ?? 1);
    return Response.json(await listCampaignSessionRecaps(db, actor, id, page));
  } catch (error) { return campaignErrorResponse(error, "Session recaps could not be loaded."); }
}

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const { id } = await context.params;
    const body = await readBoundedJson(request, 40 * 1024) as { date?: unknown; title?: unknown; content?: unknown; draftOnly?: unknown };
    return Response.json({ recap: await createCampaignSessionRecap(await getCampaignD1(), actor, id, body ?? {}) }, { status: 201 });
  } catch (error) {
    if (error instanceof RequestBodyError) return Response.json({ error: error.message }, { status: error.status });
    return campaignErrorResponse(error, "The session recap could not be created.");
  }
}

export async function PATCH(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const { id } = await context.params;
    const body = await readBoundedJson(request, 40 * 1024) as {
      id?: unknown; date?: unknown; title?: unknown; content?: unknown; updatedAt?: unknown;
    };
    return Response.json({ recap: await updateCampaignSessionRecap(await getCampaignD1(), actor, id, body ?? {}) });
  } catch (error) {
    if (error instanceof RequestBodyError) return Response.json({ error: error.message }, { status: error.status });
    return campaignErrorResponse(error, "The session recap could not be updated.");
  }
}
