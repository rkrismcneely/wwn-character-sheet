import { CampaignServiceError } from "./service.ts";

/** Browser playback accepts only one bounded HTTP byte-range request at a time. */
export function validateAudioRangeHeader(raw: string | null, byteSize: number): string | null {
  if (raw === null) return null;
  if (!Number.isSafeInteger(byteSize) || byteSize <= 0 || raw.length > 80) {
    throw new CampaignServiceError("Invalid audio range.", 416);
  }
  const match = /^bytes=(\d+)-(\d*)$/u.exec(raw);
  const suffix = /^bytes=-(\d+)$/u.exec(raw);
  if (!match && !suffix) throw new CampaignServiceError("Only one audio byte range is supported.", 416);
  if (suffix) {
    const size = Number(suffix[1]);
    if (!Number.isSafeInteger(size) || size < 1) {
      throw new CampaignServiceError("Invalid audio suffix range.", 416);
    }
    return "bytes=-" + size;
  }
  const start = Number(match![1]);
  const end = match![2] ? Number(match![2]) : null;
  if (!Number.isSafeInteger(start) || start < 0 || start >= byteSize ||
      (end !== null && (!Number.isSafeInteger(end) || end < start))) {
    throw new CampaignServiceError("Audio range is not satisfiable.", 416);
  }
  return "bytes=" + start + "-" + (end === null ? "" : Math.min(end,byteSize-1));
}

export function audioPlaybackHeaders(mimeType: string, upstreamHeaders: Headers): Headers {
  const headers=new Headers({
    "content-type":mimeType,
    "cache-control":"private, no-store",
    "x-content-type-options":"nosniff",
    "accept-ranges":"bytes",
  });
  for(const key of ["content-length","content-range","etag"]){
    const value=upstreamHeaders.get(key);
    if(value)headers.set(key,value);
  }
  return headers;
}
