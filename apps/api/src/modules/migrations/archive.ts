import { inflateRawSync } from "node:zlib";

export interface ArchiveEntry {
  path: string;
  data: Buffer;
  compressedSize: number;
  uncompressedSize: number;
}

const LOCAL_FILE_SIGNATURE = 0x04034b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const EOCD_SIGNATURE = 0x06054b50;

function normalizeArchivePath(rawPath: string): string {
  const normalized = rawPath.replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.some((part) => part === "..")) {
    throw new Error(`Unsafe archive path: ${rawPath}`);
  }
  return parts.join("/");
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const min = Math.max(0, buffer.length - 65_557);
  for (let i = buffer.length - 22; i >= min; i -= 1) {
    if (buffer.readUInt32LE(i) === EOCD_SIGNATURE) return i;
  }
  throw new Error("Invalid ZIP: end of central directory not found");
}

/**
 * Small dependency-free ZIP reader. It intentionally supports only the two
 * common ZIP methods used by business backups: stored (0) and raw-deflate (8).
 * Paths are normalized and traversal is rejected before any data is exposed.
 */
export function readZip(buffer: Buffer, limits = { maxFiles: 10_000, maxUncompressedBytes: 2 * 1024 * 1024 * 1024 }): ArchiveEntry[] {
  const eocd = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocd + 10);
  const centralOffset = buffer.readUInt32LE(eocd + 16);

  if (entryCount > limits.maxFiles) throw new Error("ZIP contains too many files");

  const entries: ArchiveEntry[] = [];
  let offset = centralOffset;
  let totalUncompressed = 0;

  for (let i = 0; i < entryCount; i += 1) {
    if (buffer.readUInt32LE(offset) !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw new Error("Invalid ZIP central directory");
    }

    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + fileNameLength).toString("utf8");
    offset += 46 + fileNameLength + extraLength + commentLength;

    const path = normalizeArchivePath(name);
    if (!path || path.endsWith("/")) continue;
    if (uncompressedSize > limits.maxUncompressedBytes) throw new Error(`ZIP entry too large: ${path}`);
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > limits.maxUncompressedBytes) throw new Error("ZIP expands beyond configured limit");

    if (buffer.readUInt32LE(localHeaderOffset) !== LOCAL_FILE_SIGNATURE) {
      throw new Error(`Invalid ZIP local header: ${path}`);
    }
    const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);

    let data: Buffer;
    if (compressionMethod === 0) data = Buffer.from(compressed);
    else if (compressionMethod === 8) data = inflateRawSync(compressed);
    else throw new Error(`Unsupported ZIP compression method ${compressionMethod}: ${path}`);

    if (data.length !== uncompressedSize) throw new Error(`ZIP size mismatch: ${path}`);
    entries.push({ path, data, compressedSize, uncompressedSize });
  }

  return entries;
}
