const mapContentTypes = {
  "image/jpeg": "jpg",
  "image/png": "png",
} as const;

export const MAX_MAP_BACKGROUND_BYTES = 15 * 1024 * 1024;
export const MIN_MAP_BACKGROUND_EDGE = 256;
export const MAX_MAP_BACKGROUND_EDGE = 12000;
export const MAX_MAP_BACKGROUND_PIXELS = 80_000_000;

export type MapBackgroundContentType = keyof typeof mapContentTypes;

export interface MapImageDimensions {
  width: number;
  height: number;
}

export function isMapBackgroundContentType(value: string): value is MapBackgroundContentType {
  return Object.hasOwn(mapContentTypes, value);
}

function pngDimensions(data: Uint8Array): MapImageDimensions | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (data.length < 24 || !signature.every((value, index) => data[index] === value)) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

const jpegSofMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function jpegDimensions(data: Uint8Array): MapImageDimensions | null {
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 8 < data.length) {
    if (data[offset] !== 0xff) { offset += 1; continue; }
    while (offset < data.length && data[offset] === 0xff) offset += 1;
    if (offset >= data.length) return null;
    const marker = data[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 1 >= data.length) return null;
    const length = (data[offset] << 8) | data[offset + 1];
    if (length < 2 || offset + length > data.length) return null;
    if (jpegSofMarkers.has(marker) && length >= 7) {
      return {
        height: (data[offset + 3] << 8) | data[offset + 4],
        width: (data[offset + 5] << 8) | data[offset + 6],
      };
    }
    offset += length;
  }
  return null;
}

export function mapImageDimensions(bytes: ArrayBuffer, contentType: MapBackgroundContentType): MapImageDimensions | null {
  const data = new Uint8Array(bytes);
  const dimensions = contentType === "image/png" ? pngDimensions(data) : jpegDimensions(data);
  if (!dimensions) return null;
  if (
    dimensions.width < MIN_MAP_BACKGROUND_EDGE
    || dimensions.height < MIN_MAP_BACKGROUND_EDGE
    || dimensions.width > MAX_MAP_BACKGROUND_EDGE
    || dimensions.height > MAX_MAP_BACKGROUND_EDGE
    || dimensions.width * dimensions.height > MAX_MAP_BACKGROUND_PIXELS
  ) return null;
  return dimensions;
}

export function mapBackgroundObjectKey(campaignPublicId: string, contentType: MapBackgroundContentType): string {
  return `campaign-maps/${campaignPublicId}/${crypto.randomUUID()}.${mapContentTypes[contentType]}`;
}

export function validMapBackgroundObjectKey(key: string): boolean {
  return key.length > 0
    && key.length <= 512
    && key.startsWith("campaign-maps/")
    && !key.includes("..")
    && !key.includes("\\");
}
