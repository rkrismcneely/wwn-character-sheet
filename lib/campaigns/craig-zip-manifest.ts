/** Bounded ZIP central-directory scanner for Craig multitrack manifests.
 * This deliberately does not decompress potentially untrusted archive entries.
 * Supports ordinary ZIP; ZIP64 and encrypted archives are rejected.
 */
export type CraigArchiveEntry = { filename: string; compressedBytes: number; uncompressedBytes: number; compression: number };
const MAX_ENTRIES = 128;
const MAX_DIRECTORY = 1024 * 1024;
function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function decode(bytes: Uint8Array) {
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
export function zipDirectoryLocation(tail: Uint8Array, totalSize: number) {
  ensure(totalSize >= 22 && tail.length <= totalSize && tail.length <= 65557, "Invalid ZIP archive size.");
  const view = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  let offset = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) === tail.length) {
      offset = i; break;
    }
  }
  ensure(offset >= 0, "ZIP directory trailer missing or unsupported.");
  const disk = view.getUint16(offset + 4, true);
  const centralDisk = view.getUint16(offset + 6, true);
  const countDisk = view.getUint16(offset + 8, true);
  const count = view.getUint16(offset + 10, true);
  const size = view.getUint32(offset + 12, true);
  const start = view.getUint32(offset + 16, true);
  ensure(disk === 0 && centralDisk === 0 && countDisk === count, "Multi-disk archives are unsupported.");
  ensure(count > 0 && count <= MAX_ENTRIES && count !== 0xffff, "Archive contains too many tracks.");
  ensure(size > 0 && size <= MAX_DIRECTORY && start !== 0xffffffff, "ZIP central directory exceeds limits.");
  ensure(start + size <= totalSize - tail.length + offset, "Invalid ZIP directory bounds.");
  return { offset: start, length: size, entries: count };
}
export function parseZipDirectory(bytes: Uint8Array, count: number): CraigArchiveEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries: CraigArchiveEntry[] = [];
  let at = 0;
  for (let i = 0; i < count; i++) {
    ensure(at + 46 <= bytes.length && view.getUint32(at, true) === 0x02014b50, "ZIP directory entry invalid.");
    const flags = view.getUint16(at + 8, true);
    const compression = view.getUint16(at + 10, true);
    const compressedBytes = view.getUint32(at + 20, true);
    const uncompressedBytes = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const disk = view.getUint16(at + 34, true);
    const localOffset = view.getUint32(at + 42, true);
    const end = at + 46 + nameLength + extraLength + commentLength;
    ensure(end <= bytes.length, "ZIP entry exceeds directory.");
    ensure(!(flags & 1) && (compression === 0 || compression === 8) &&
      disk === 0 && localOffset !== 0xffffffff && compressedBytes !== 0xffffffff &&
      uncompressedBytes !== 0xffffffff, "Encrypted, ZIP64 or unsupported compression.");
    const filename = decode(bytes.subarray(at + 46, at + 46 + nameLength));
    ensure(filename.length <= 240 && !filename.startsWith("/") && !filename.includes("\\") &&
      !filename.split("/").includes("..") && !/[\u0000-\u001f\u007f]/u.test(filename), "Unsafe archive filename.");
    if (filename && !filename.endsWith("/")) entries.push({ filename, compressedBytes, uncompressedBytes, compression });
    at = end;
  }
  ensure(at === bytes.length, "Unexpected ZIP directory trailing data.");
  return entries;
}
