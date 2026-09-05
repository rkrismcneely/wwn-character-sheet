import { getSessionActor } from "@/lib/auth-session";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import {
  createCampaignItem,
  listCampaignItemsForCharacter,
  listCampaignItemsForManagement,
} from "@/lib/campaigns/items";
import { getCampaignD1 } from "@/lib/campaigns/service";
import { readBoundedJson, RequestBodyError } from "@/lib/http-json";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const { id } = await context.params;
    const characterId = new URL(request.url).searchParams.get("characterId");
    const db = await getCampaignD1();
    if (characterId) {
      return Response.json({ items: await listCampaignItemsForCharacter(db, actor, id, characterId) });
    }
    return Response.json(await listCampaignItemsForManagement(db, actor, id));
  } catch (error) {
    return campaignErrorResponse(error, "Campaign items could not be opened.");
  }
}

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const { id } = await context.params;
    const body = await readBoundedJson(request, 24 * 1024) as Record<string, unknown>;
    const item = await createCampaignItem(await getCampaignD1(), actor, id, body);
    return Response.json({ item }, { status: 201 });
  } catch (error) {
    if (error instanceof RequestBodyError) return Response.json({ error: error.message }, { status: error.status });
    return campaignErrorResponse(error, "Campaign item could not be created.");
  }
}
