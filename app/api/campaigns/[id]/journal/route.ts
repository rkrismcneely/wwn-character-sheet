import { getSessionActor } from "@/lib/auth-session";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import { getCampaignD1 } from "@/lib/campaigns/service";
import { createJournalEntry, listJournal, updateJournalEntry } from "@/lib/campaigns/journal";
import { readBoundedJson, RequestBodyError } from "@/lib/http-json";

type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const { id } = await context.params;
    const preview = new URL(request.url).searchParams.get("preview") === "player";
    return Response.json(await listJournal(await getCampaignD1(), actor, id, preview));
  } catch (error) { return campaignErrorResponse(error, "The journal could not be loaded."); }
}
export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const { id } = await context.params;
    const body = await readBoundedJson(request, 120 * 1024);
    return Response.json({ entry: await createJournalEntry(await getCampaignD1(), actor, id, body ?? {}) }, { status: 201 });
  } catch (error) {
    if (error instanceof RequestBodyError) return Response.json({ error: error.message }, { status: error.status });
    return campaignErrorResponse(error, "The journal entry could not be created.");
  }
}
export async function PATCH(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const { id } = await context.params;
    const body = await readBoundedJson(request, 120 * 1024);
    return Response.json({ entry: await updateJournalEntry(await getCampaignD1(), actor, id, body ?? {}) });
  } catch (error) {
    if (error instanceof RequestBodyError) return Response.json({ error: error.message }, { status: error.status });
    return campaignErrorResponse(error, "The journal entry could not be updated.");
  }
}
