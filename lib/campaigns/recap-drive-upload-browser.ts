import {
  DRIVE_UPLOAD_CHUNK_BYTES, driveChunkRange, nextDriveUploadOffset, validateDriveSessionUrl,
} from "./recap-drive-upload.ts";

export type DriveUploadedFile = { id: string; mimeType?: string; size?: string; name?: string };
type Progress = (bytesSent: number, totalBytes: number) => void;

/**
 * Browser-side upload straight to the GM's Google Drive session.
 * TWE does not receive the audio bytes or OAuth access/refresh token.
 * The browser must remain open; cross-browser resumability is a later phase.
 */
export async function uploadRecordingToDrive(
  file: Blob,
  rawSessionUrl: string,
  progress: Progress = () => {},
  options: { fetcher?: typeof fetch; signal?: AbortSignal; chunkBytes?: number } = {},
): Promise<DriveUploadedFile> {
  const sessionUrl = validateDriveSessionUrl(rawSessionUrl);
  if (!file.size) throw new Error("Choose a nonempty audio recording.");
  const fetcher = options.fetcher ?? fetch;
  const chunkBytes = options.chunkBytes ?? DRIVE_UPLOAD_CHUNK_BYTES;
  let offset = 0;
  let consecutiveFailures = 0;
  while (offset < file.size) {
    if (options.signal?.aborted) throw new Error("Recording upload cancelled.");
    const next = driveChunkRange(file.size, offset, chunkBytes);
    let response: Response;
    try {
      response = await fetcher(sessionUrl, {
        method: "PUT",
        headers: { "Content-Range": next.contentRange },
        body: file.slice(next.start, next.endExclusive),
        signal: options.signal,
      });
    } catch (error) {
      if (options.signal?.aborted) throw error;
      consecutiveFailures += 1;
      if (consecutiveFailures > 3) throw new Error("Drive upload interrupted repeatedly. Retry with the original file.");
      // Query Google's actual acknowledged position; never guess how many
      // bytes arrived during a lost connection or retry the entire file.
      const check = await fetcher(sessionUrl, {
        method: "PUT", headers: { "Content-Range": "bytes */" + file.size },
        signal: options.signal,
      });
      if (check.status === 200 || check.status === 201) {
        return verifiedUploadedFile(await check.json());
      }
      offset = nextDriveUploadOffset(check.status, check.headers.get("Range"), file.size);
      progress(offset,file.size);
      continue;
    }
    if (response.status === 200 || response.status === 201) {
      const uploaded = verifiedUploadedFile(await response.json());
      progress(file.size,file.size);
      return uploaded;
    }
    const acknowledged = nextDriveUploadOffset(response.status, response.headers.get("Range"), file.size);
    if (acknowledged < offset || acknowledged > next.endExclusive) {
      throw new Error("Drive returned an inconsistent upload position.");
    }
    if (acknowledged === offset) {
      consecutiveFailures += 1;
      if (consecutiveFailures > 3) throw new Error("Drive did not acknowledge upload progress.");
    } else {
      consecutiveFailures = 0;
    }
    offset = acknowledged;
    progress(offset,file.size);
  }
  throw new Error("Drive did not confirm the recording upload.");
}
function verifiedUploadedFile(raw: unknown): DriveUploadedFile {
  if (!raw || typeof raw !== "object") throw new Error("Google Drive did not return a saved file.");
  const file = raw as Record<string,unknown>;
  if (typeof file.id !== "string" || !/^[a-zA-Z0-9_-]{5,256}$/u.test(file.id)) {
    throw new Error("Google Drive did not confirm a valid file ID.");
  }
  return {
    id: file.id,
    mimeType: typeof file.mimeType === "string" ? file.mimeType : undefined,
    size: typeof file.size === "string" ? file.size : undefined,
    name: typeof file.name === "string" ? file.name : undefined,
  };
}
