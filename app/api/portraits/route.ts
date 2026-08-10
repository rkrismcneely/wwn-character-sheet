export async function POST(): Promise<Response> {
  return Response.json(
    { error: "Portrait uploads require a signed-in character owner." },
    { status: 401 },
  );
}
