import { CampaignServiceError } from "./service.ts";

export function campaignErrorResponse(
  error: unknown,
  fallbackMessage: string,
): Response {
  if (error instanceof CampaignServiceError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return Response.json({ error: fallbackMessage }, { status: 500 });
}
