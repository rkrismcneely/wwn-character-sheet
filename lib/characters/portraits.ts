const portraitContentTypes = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
} as const;

export const MAX_PORTRAIT_BYTES = 5 * 1024 * 1024;

export type PortraitContentType = keyof typeof portraitContentTypes;

export function isPortraitContentType(
  value: string,
): value is PortraitContentType {
  return Object.hasOwn(portraitContentTypes, value);
}

export function portraitExtension(contentType: PortraitContentType): string {
  return portraitContentTypes[contentType];
}

export function portraitObjectKey(
  publicId: string,
  contentType: PortraitContentType,
): string {
  return `portraits/${publicId}/${crypto.randomUUID()}.${portraitExtension(contentType)}`;
}

export function portraitBytesMatchContentType(
  bytes: ArrayBuffer,
  contentType: PortraitContentType,
): boolean {
  const data = new Uint8Array(bytes);
  if (contentType === "image/jpeg") {
    return data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  }
  if (contentType === "image/png") {
    return data.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
      .every((value, index) => data[index] === value);
  }
  if (contentType === "image/webp") {
    return data.length >= 12 && new TextDecoder().decode(data.slice(0, 4)) === "RIFF"
      && new TextDecoder().decode(data.slice(8, 12)) === "WEBP";
  }
  if (contentType === "image/gif") {
    const signature = new TextDecoder().decode(data.slice(0, 6));
    return signature === "GIF87a" || signature === "GIF89a";
  }
  return false;
}

export function portraitURL(key: string): string {
  return `/api/portraits/${key.split("/").map(encodeURIComponent).join("/")}`;
}

export function validPortraitObjectKey(key: string): boolean {
  return (
    key.length > 0 &&
    key.length <= 512 &&
    key.startsWith("portraits/") &&
    !key.includes("..") &&
    !key.includes("\\")
  );
}
