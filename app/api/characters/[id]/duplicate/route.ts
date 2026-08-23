import {
  characterLifecycleErrorResponse,
  duplicateCharacter,
} from "../../lifecycle";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const { id } = await context.params;
    return Response.json(
      { character: await duplicateCharacter(request, id) },
      { status: 201 },
    );
  } catch (error) {
    return characterLifecycleErrorResponse(error, "The character could not be duplicated.");
  }
}
