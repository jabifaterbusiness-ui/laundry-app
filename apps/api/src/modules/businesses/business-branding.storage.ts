import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { config } from "../../config/index.js";
import { AppError } from "../../middleware/error-handler.js";

const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

const OUTPUT_FILENAME = "logo.png";
const MAX_IMAGE_WIDTH = 4000;
const MAX_IMAGE_HEIGHT = 4000;

function businessDirectory(businessId: string) {
  return path.join(config.businessBranding.storageDir, businessId);
}

function logoFilePath(businessId: string) {
  return path.join(businessDirectory(businessId), OUTPUT_FILENAME);
}

function logoUrl() {
  return `${config.appUrl}/api/v1/businesses/logo`;
}

export async function saveBusinessLogo(
  businessId: string,
  input: Buffer,
  mimeType: string,
): Promise<{ logoUrl: string }> {
  if (!businessId) {
    throw new AppError("Business context is required", 400);
  }

  if (!Buffer.isBuffer(input) || input.length === 0) {
    throw new AppError("Logo image is required", 422);
  }

  if (input.length > config.businessBranding.maxUploadBytes) {
    throw new AppError("Logo image exceeds the maximum allowed size", 422);
  }

  if (!ALLOWED_MIME_TYPES.has(mimeType.toLowerCase())) {
    throw new AppError("Logo must be a PNG, JPEG, or WebP image", 422);
  }

  let normalized: Buffer;

  try {
    const image = sharp(input, {
      limitInputPixels: MAX_IMAGE_WIDTH * MAX_IMAGE_HEIGHT,
    });
    const metadata = await image.metadata();

    if (
      !metadata.width ||
      !metadata.height ||
      metadata.width > MAX_IMAGE_WIDTH ||
      metadata.height > MAX_IMAGE_HEIGHT
    ) {
      throw new AppError("Logo image dimensions are too large", 422);
    }

    normalized = await image
      .rotate()
      .png({
        compressionLevel: 9,
        adaptiveFiltering: true,
      })
      .toBuffer();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("Logo image is invalid or could not be processed", 422);
  }

  const directory = businessDirectory(businessId);
  const finalPath = logoFilePath(businessId);
  const temporaryPath = path.join(
    directory,
    `.logo-${randomUUID()}.tmp`,
  );

  await mkdir(directory, { recursive: true, mode: 0o700 });

  try {
    const existingDirectory = await stat(directory);
    if (!existingDirectory.isDirectory()) {
      throw new AppError("Business logo storage is unavailable", 500);
    }

    await writeFile(temporaryPath, normalized, {
      flag: "wx",
      mode: 0o600,
    });

    await rename(temporaryPath, finalPath);

    return { logoUrl: logoUrl() };
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);

    if (error instanceof AppError) throw error;
    throw new AppError("Unable to store business logo", 500);
  }
}

export async function readBusinessLogo(
  businessId: string,
): Promise<Buffer | null> {
  if (!businessId) return null;

  try {
    return await readFile(logoFilePath(businessId));
  } catch (error) {
    const code =
      typeof error === "object" &&
      error !== null &&
      "code" in error
        ? error.code
        : undefined;

    if (code === "ENOENT") return null;
    throw new AppError("Unable to read business logo", 500);
  }
}

export async function deleteBusinessLogo(businessId: string): Promise<void> {
  if (!businessId) return;

  await rm(businessDirectory(businessId), {
    recursive: true,
    force: true,
  });
}

export function getBusinessLogoUrl(): string {
  return logoUrl();
}
