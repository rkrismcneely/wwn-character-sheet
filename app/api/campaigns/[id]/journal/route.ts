import { getSessionActor } from "@/lib/auth-session";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import { getCampaignD1 } from "@/lib/campaigns/service";
import { createJournalEntry, journalReaderOptions, listJournal, setJournalReaders, updateJournalEntry } from "@/lib/campaigns/journal";
import { readBoundedJson, RequestBodyError } from "@/lib/http-json";

type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const { id } = await context.params;
    const preview = new URL(request.url).searchParams.get("preview") === "player";
    const query = new URL(request.url).searchParams;
    if (query.has("readers")) return Response.json(await journalReaderOptions(await getCampaignD1(), actor, id, query.get("readers") ?? ""));
    return Response.json(await listJournal(await getCampaignD1(), actor, id, preview));
  } catch (error) { return campaignErrorResponse(error, "The journal could not be loaded."); }
}
export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const { id } = await context.params;
    const body = await readBoundedJson(request, 120 * 1024);
    return Response.json({ entry: await createJournalEntry(await getCampaignD1(), actor, id, (body ?? {}) as Record<string, unknown>) }, { status: 201 });
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

export async function PUT(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const { id } = await context.params;
    const body = await readBoundedJson(request, 16 * 1024) as { entryId?: string; userIds?: string[] };
    return Response.json(await setJournalReaders(await getCampaignD1(), actor, id, body.entryId ?? "", body.userIds ?? []));
  } catch (error) {
    if (error instanceof RequestBodyError) return Response.json({ error: error.message }, { status: error.status });
    return campaignErrorResponse(error, "Journal readers could not be updated.");
  }
}
