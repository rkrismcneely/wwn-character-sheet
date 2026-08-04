export class RequestBodyError extends Error {
  public readonly status: 400 | 413;

  constructor(
    message: string,
    status: 400 | 413,
  ) {
    super(message);
    this.status = status;
  }
}

export async function readBoundedJson(
  request: Request,
  maximumBytes = 1024 * 1024,
): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new RequestBodyError("Request body is too large.", 413);
  }
  if (!request.body) throw new RequestBodyError("A JSON request body is required.", 400);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel();
      throw new RequestBodyError("Request body is too large.", 413);
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new RequestBodyError("Malformed JSON request body.", 400);
  }
}
