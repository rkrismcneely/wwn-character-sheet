import { getSessionActor } from "@/lib/auth-session";
import {
  AccountProfileError,
  getAccountD1,
  readAccountProfile,
  resetAccountDisplayName,
  updateAccountDisplayName,
} from "@/lib/account/profile";
import { readBoundedJson, RequestBodyError } from "@/lib/http-json";

function errorResponse(error: unknown, fallback: string): Response {
  if (error instanceof AccountProfileError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof RequestBodyError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return Response.json({ error: fallback }, { status: 500 });
}

export async function GET(request: Request): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    const profile = await readAccountProfile(await getAccountD1(), actor);
    return Response.json({ profile });
  } catch (error) {
    return errorResponse(error, "The account profile is temporarily unavailable.");
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    const body = (await readBoundedJson(request, 8 * 1024)) as {
      displayName?: unknown;
    };
    const profile = await updateAccountDisplayName(
      await getAccountD1(),
      actor,
      body?.displayName,
    );
    return Response.json({ profile });
  } catch (error) {
    return errorResponse(error, "The account profile could not be updated.");
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    const profile = await resetAccountDisplayName(
      await getAccountD1(),
      actor,
    );
    return Response.json({ profile });
  } catch (error) {
    return errorResponse(error, "The account profile could not be reset.");
  }
}
