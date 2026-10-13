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
const EOCD_MIN_LENGTH = 22;
const EOCD_MAX_COMMENT_LENGTH = 65_535;

function normalizeArchivePath(rawPath: string): string {
  const normalized = rawPath.replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.some((part) => part === "..")) {
    throw new Error(`Unsafe archive path: ${rawPath}`);
  }
  return parts.join("/");
}

function requireRange(buffer: Buffer, offset: number, length: number, label: string): void {
  if (
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(length) ||
    offset < 0 ||
    length < 0 ||
    offset > buffer.length ||
    length > buffer.length - offset
  ) {
    throw new Error(`Invalid ZIP: truncated or out-of-range ${label}`);
  }
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  if (buffer.length < EOCD_MIN_LENGTH) {
    throw new Error("Invalid ZIP: end of central directory not found");
  }

  const min = Math.max(0, buffer.length - EOCD_MIN_LENGTH - EOCD_MAX_COMMENT_LENGTH);
  for (let i = buffer.length - EOCD_MIN_LENGTH; i >= min; i -= 1) {
    if (buffer.readUInt32LE(i) !== EOCD_SIGNATURE) continue;

    const commentLength = buffer.readUInt16LE(i + 20);
    if (i + EOCD_MIN_LENGTH + commentLength === buffer.length) return i;
  }

  throw new Error("Invalid ZIP: end of central directory not found");
}

/**
 * Dependency-free ZIP reader for stored and raw-deflate entries.
 * All offsets are bounds-checked and decompression is capped before output
 * is allocated beyond the configured uncompressed-size limit.
 */
export function readZip(
  buffer: Buffer,
  limits = { maxFiles: 10_000, maxUncompressedBytes: 2 * 1024 * 1024 * 1024 },
): ArchiveEntry[] {
  const eocd = findEndOfCentralDirectory(buffer);
  requireRange(buffer, eocd, EOCD_MIN_LENGTH, "end of central directory");

  const diskNumber = buffer.readUInt16LE(eocd + 4);
  const centralDisk = buffer.readUInt16LE(eocd + 6);
  const entriesOnDisk = buffer.readUInt16LE(eocd + 8);
  const entryCount = buffer.readUInt16LE(eocd + 10);
  const centralSize = buffer.readUInt32LE(eocd + 12);
  const centralOffset = buffer.readUInt32LE(eocd + 16);

  if (diskNumber !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount) {
    throw new Error("Invalid ZIP: multi-disk archives are not supported");
  }
  if (entryCount === 0xffff || centralOffset === 0xffffffff || centralSize === 0xffffffff) {
    throw new Error("Invalid ZIP: ZIP64 archives are not supported");
  }
  if (!Number.isSafeInteger(limits.maxFiles) || limits.maxFiles < 0) {
    throw new Error("Invalid ZIP file-count limit");
  }
  if (!Number.isSafeInteger(limits.maxUncompressedBytes) || limits.maxUncompressedBytes < 0) {
    throw new Error("Invalid ZIP uncompressed-size limit");
  }
  if (entryCount > limits.maxFiles) throw new Error("ZIP contains too many files");

  requireRange(buffer, centralOffset, centralSize, "central directory");
  if (centralOffset + centralSize > eocd) {
    throw new Error("Invalid ZIP: central directory overlaps end record");
  }

  const entries: ArchiveEntry[] = [];
  let offset = centralOffset;
  const centralEnd = centralOffset + centralSize;
  let totalUncompressed = 0;

  for (let i = 0; i < entryCount; i += 1) {
    requireRange(buffer, offset, 46, "central directory entry");
    if (buffer.readUInt32LE(offset) !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw new Error("Invalid ZIP central directory");
    }

    const flags = buffer.readUInt16LE(offset + 8);
    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const startDisk = buffer.readUInt16LE(offset + 34);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const entryLength = 46 + fileNameLength + extraLength + commentLength;

    requireRange(buffer, offset, entryLength, "central directory entry fields");
    if (offset + entryLength > centralEnd) {
      throw new Error("Invalid ZIP: central directory entry exceeds directory bounds");
    }
    if (startDisk !== 0 || compressedSize === 0xffffffff ||
        uncompressedSize === 0xffffffff || localHeaderOffset === 0xffffffff) {
      throw new Error("Invalid ZIP: split or ZIP64 entry is not supported");
    }
    if ((flags & 0x0001) !== 0) {
      throw new Error("Invalid ZIP: encrypted entries are not supported");
    }

    const name = buffer.subarray(offset + 46, offset + 46 + fileNameLength).toString("utf8");
    offset += entryLength;

    const path = normalizeArchivePath(name);
    if (!path || path.endsWith("/")) continue;

    if (uncompressedSize > limits.maxUncompressedBytes) {
      throw new Error(`ZIP entry too large: ${path}`);
    }
    if (totalUncompressed > limits.maxUncompressedBytes - uncompressedSize) {
      throw new Error("ZIP expands beyond configured limit");
    }
    totalUncompressed += uncompressedSize;

    requireRange(buffer, localHeaderOffset, 30, `local header for ${path}`);
    if (buffer.readUInt32LE(localHeaderOffset) !== LOCAL_FILE_SIGNATURE) {
      throw new Error(`Invalid ZIP local header: ${path}`);
    }

    const localFlags = buffer.readUInt16LE(localHeaderOffset + 6);
    const localMethod = buffer.readUInt16LE(localHeaderOffset + 8);
    const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    if ((localFlags & 0x0001) !== 0 || localMethod !== compressionMethod) {
      throw new Error(`Invalid ZIP local header flags or method: ${path}`);
    }

    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    requireRange(buffer, localHeaderOffset + 30, localNameLength + localExtraLength, `local header fields for ${path}`);
    requireRange(buffer, dataStart, compressedSize, `compressed data for ${path}`);
    if (dataStart + compressedSize > centralOffset) {
      throw new Error(`Invalid ZIP: file data overlaps central directory: ${path}`);
    }

    const localName = buffer.subarray(localHeaderOffset + 30, localHeaderOffset + 30 + localNameLength).toString("utf8");
    if (localName !== name) throw new Error(`Invalid ZIP: filename mismatch for ${path}`);

    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    let data: Buffer;
    if (compressionMethod === 0) {
      if (compressedSize !== uncompressedSize) throw new Error(`ZIP size mismatch: ${path}`);
      data = Buffer.from(compressed);
    } else if (compressionMethod === 8) {
      try {
        data = inflateRawSync(compressed, {
          maxOutputLength: Math.max(1, Math.min(uncompressedSize, limits.maxUncompressedBytes - (totalUncompressed - uncompressedSize))),
        });
      } catch {
        throw new Error(`Invalid or oversized compressed ZIP entry: ${path}`);
      }
    } else {
      throw new Error(`Unsupported ZIP compression method ${compressionMethod}: ${path}`);
    }

    if (data.length !== uncompressedSize) throw new Error(`ZIP size mismatch: ${path}`);
    entries.push({ path, data, compressedSize, uncompressedSize });
  }

  if (offset !== centralEnd) throw new Error("Invalid ZIP: central directory size mismatch");
  return entries;
}
