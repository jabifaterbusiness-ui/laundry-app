import { prisma } from "../../lib/prisma.js";
import { config } from "../../config/index.js";
import { AppError } from "../../middleware/error-handler.js";
import { decryptWhatsAppAccessToken } from "./whatsapp-token-crypto.js";

const MAX_MEDIA_BYTES = 10 * 1024 * 1024;
const ALLOWED_MEDIA_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp", "video/mp4",
  "audio/ogg", "audio/mpeg", "application/pdf",
]);

type StoredMessage = {
  type?: string;
  image?: { id?: string };
  video?: { id?: string };
  audio?: { id?: string };
  document?: { id?: string };
  sticker?: { id?: string };
};

type MetaMediaMetadata = {
  url?: string;
  mime_type?: string;
  file_size?: string | number;
  error?: { message?: string };
};

function isMetaMediaUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const trustedHost = host === "fbsbx.com" || host.endsWith(".fbsbx.com") ||
      host === "fbcdn.net" || host.endsWith(".fbcdn.net") ||
      host === "facebook.com" || host.endsWith(".facebook.com");
    if (url.protocol !== "https:" || !trustedHost || url.username || url.password || url.port) return null;
    return url;
  } catch {
    return null;
  }
}

export async function getWhatsAppMediaPreview(businessId: string, mediaId: string) {
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(mediaId)) throw new AppError("Invalid WhatsApp media ID", 422);

  // Only media referenced by an inbound message belonging to this tenant can
  // be downloaded. A media ID supplied by another tenant is never sufficient.
  const events = await prisma.whatsAppWebhookEvent.findMany({
    where: { businessId, eventType: "MESSAGE_RECEIVED" },
    orderBy: { receivedAt: "desc" },
    take: 1000,
    select: { payload: true },
  });
  const belongsToBusiness = events.some((event) => {
    const payload = event.payload as StoredMessage;
    const media = payload[payload.type as keyof StoredMessage];
    return Boolean(media && typeof media === "object" && "id" in media && media.id === mediaId);
  });
  if (!belongsToBusiness) throw new AppError("WhatsApp media was not found for this business", 404);

  const connection = await prisma.whatsAppBusinessConnection.findUnique({
    where: { businessId },
    select: { encryptedAccessToken: true, status: true },
  });
  if (!connection || connection.status !== "CONNECTED") {
    throw new AppError("Connect this business's WhatsApp number before viewing media", 409);
  }
  const apiVersion = config.receiptDelivery.whatsappApiVersion;
  if (!apiVersion) throw new AppError("WhatsApp API version is not configured by the platform", 503);
  const token = decryptWhatsAppAccessToken(connection.encryptedAccessToken);

  const metadataResponse = await fetch(`https://graph.facebook.com/${apiVersion}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const metadata = await metadataResponse.json() as MetaMediaMetadata;
  if (!metadataResponse.ok || !metadata.url) {
    throw new AppError(metadata.error?.message ?? "WhatsApp media could not be retrieved from Meta", 502);
  }
  const declaredSize = Number(metadata.file_size ?? 0);
  if (declaredSize > MAX_MEDIA_BYTES) throw new AppError("This WhatsApp attachment is too large to preview (10 MB maximum)", 413);
  const mediaUrl = isMetaMediaUrl(metadata.url);
  if (!mediaUrl) throw new AppError("Meta returned an unexpected media download URL", 502);

  const mediaResponse = await fetch(mediaUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!mediaResponse.ok) throw new AppError("WhatsApp media download failed", 502);
  const contentType = (metadata.mime_type ?? mediaResponse.headers.get("content-type") ?? "")
    .split(";")[0]?.trim().toLowerCase();
  if (!contentType || !ALLOWED_MEDIA_TYPES.has(contentType)) {
    throw new AppError("This WhatsApp attachment type cannot be previewed safely", 415);
  }
  const bytes = Buffer.from(await mediaResponse.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_MEDIA_BYTES) {
    throw new AppError("This WhatsApp attachment is empty or exceeds the 10 MB preview limit", 413);
  }
  return { bytes, contentType };
}
