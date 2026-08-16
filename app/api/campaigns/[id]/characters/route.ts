import { getSessionActor } from "@/lib/auth-session";
import {
  linkCharacterToCampaign,
  listCampaignCharacters,
  listEligibleCampaignCharacters,
  unlinkCharacterFromCampaign,
} from "@/lib/campaigns/characters";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import { getCampaignD1 } from "@/lib/campaigns/service";
import { readBoundedJson, RequestBodyError } from "@/lib/http-json";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) {
      return Response.json({ error: "Sign in is required." }, { status: 401 });
    }
    const { id } = await context.params;
    const db = await getCampaignD1();
    const [characters, eligibleCharacters] = await Promise.all([
      listCampaignCharacters(db, actor, id),
      listEligibleCampaignCharacters(db, actor, id),
    ]);
    return Response.json({ characters, eligibleCharacters });
  } catch (error) {
    return campaignErrorResponse(
      error,
      "The campaign character library could not be loaded.",
    );
  }
}

export async function POST(
  request: Request,
  context: Context,
): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) {
      return Response.json({ error: "Sign in is required." }, { status: 401 });
    }
    const { id } = await context.params;
    const body = (await readBoundedJson(request, 16 * 1024)) as {
      characterId?: unknown;
    };
    const character = await linkCharacterToCampaign(
      await getCampaignD1(),
      actor,
      id,
      body?.characterId,
    );
    return Response.json({ character }, { status: 201 });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return campaignErrorResponse(error, "The character could not be linked.");
  }
}

export async function DELETE(
  request: Request,
  context: Context,
): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) {
      return Response.json({ error: "Sign in is required." }, { status: 401 });
    }
    const { id } = await context.params;
    const body = (await readBoundedJson(request, 16 * 1024)) as {
      characterId?: unknown;
    };
    await unlinkCharacterFromCampaign(
      await getCampaignD1(),
      actor,
      id,
      body?.characterId,
    );
    return Response.json({ unlinked: true });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return campaignErrorResponse(error, "The character could not be unlinked.");
  }
}
