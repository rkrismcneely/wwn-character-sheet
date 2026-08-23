import {
  characterLifecycleErrorResponse,
  setCharacterArchived,
} from "../../lifecycle";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const { id } = await context.params;
    return Response.json(await setCharacterArchived(request, id, true));
  } catch (error) {
    return characterLifecycleErrorResponse(error, "The character could not be archived.");
  }
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  try {
    const { id } = await context.params;
    return Response.json(await setCharacterArchived(request, id, false));
  } catch (error) {
    return characterLifecycleErrorResponse(error, "The character could not be restored.");
  }
}
