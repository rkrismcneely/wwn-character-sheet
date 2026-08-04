import { getSessionActor } from "@/lib/auth-session";
import {
  claimLegacyCharacters,
  LegacyClaimError,
} from "@/lib/characters/claims";
import { readBoundedJson, RequestBodyError } from "@/lib/http-json";
import { getD1 } from "../characters/db";

export async function POST(request: Request): Promise<Response> {
  const actor = await getSessionActor(request);
  if (!actor) {
    return Response.json({ error: "Sign in is required." }, { status: 401 });
  }

  try {
    const body = (await readBoundedJson(request, 8 * 1024)) as {
      token?: unknown;
    };
    if (typeof body?.token !== "string") {
      return Response.json({ error: "A claim token is required." }, { status: 400 });
    }
    const characters = await claimLegacyCharacters(
      await getD1(),
      actor,
      body.token.trim(),
    );
    return Response.json({ claimed: characters.length, characters });
  } catch (error) {
    if (error instanceof RequestBodyError || error instanceof LegacyClaimError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json(
      { error: "The character claim could not be completed." },
      { status: 500 },
    );
  }
}
