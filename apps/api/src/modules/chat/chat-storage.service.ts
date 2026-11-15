import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../../config/index.js";
import { AppError } from "../../middleware/error-handler.js";

export const CHAT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const root = path.resolve(config.businessBranding.storageDir, "chat-private");
const MIME = {
  "image/png": (b: Buffer) => b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  "image/jpeg": (b: Buffer) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/gif": (b: Buffer) => /^GIF8[79]a$/.test(b.subarray(0, 6).toString("ascii")),
  "image/webp": (b: Buffer) => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP",
  "application/pdf": (b: Buffer) => b.subarray(0, 5).toString("ascii") === "%PDF-",
  "text/plain": (b: Buffer) => !b.includes(0),
  "text/csv": (b: Buffer) => !b.includes(0),
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": (b: Buffer) => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04,
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": (b: Buffer) => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04,
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": (b: Buffer) => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04,
} as const;

export function sanitizeChatFilename(value: string): string {
  const cleaned = Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return character === "/" || character === "\\\\" || code < 32 || code === 127 ? "_" : character;
  }).join("").replace(/\s+/g, " ").trim().slice(0, 160);
  return cleaned && cleaned !== "." && cleaned !== ".." ? cleaned : "attachment";
}

export async function storeChatFile(businessId: string, buffer: Buffer, declaredMime: string, originalName: string) {
  if (!buffer.length || buffer.length > CHAT_MAX_UPLOAD_BYTES) throw new AppError("File must be between 1 byte and 10 MB", 413);
  const mime = declaredMime.toLowerCase().split(";")[0]?.trim() as keyof typeof MIME;
  const validate = MIME[mime];
  if (!validate || !validate(buffer)) throw new AppError("This file type is not supported or its contents do not match the declared type", 415);
  const id = randomUUID();
  const directory = path.join(root, businessId);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const storageKey = businessId + "/" + id;
  await writeFile(path.join(directory, id), buffer, { flag: "wx", mode: 0o600 });
  return {
    storageKey,
    originalName: sanitizeChatFilename(originalName),
    safeMimeType: mime,
    sizeBytes: buffer.length,
    checksum: createHash("sha256").update(buffer).digest("hex"),
  };
}

export async function readChatFile(businessId: string, storageKey: string) {
  const match = /^([a-zA-Z0-9-]+)\/([0-9a-f-]{36})$/.exec(storageKey);
  if (!match || match[1] !== businessId) throw new AppError("Attachment not found", 404);
  try {
    return await readFile(path.join(root, businessId, match[2]!));
  } catch {
    throw new AppError("Attachment file is unavailable", 404);
  }
}

export async function deleteChatFile(businessId: string, storageKey: string) {
  const match = /^([a-zA-Z0-9-]+)\/([0-9a-f-]{36})$/.exec(storageKey);
  if (!match || match[1] !== businessId) return;
  await unlink(path.join(root, businessId, match[2]!)).catch(() => undefined);
}
