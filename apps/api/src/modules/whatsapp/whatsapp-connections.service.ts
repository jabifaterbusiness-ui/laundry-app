import { prisma } from "../../lib/prisma.js";
import { config } from "../../config/index.js";
import { AppError } from "../../middleware/error-handler.js";
import { encryptWhatsAppAccessToken, decryptWhatsAppAccessToken } from "./whatsapp-token-crypto.js";

type GraphError = { error?: { message?: string; code?: number; error_subcode?: number } };
type TokenResponse = { access_token?: string; token_type?: string; expires_in?: number } & GraphError;
type PhoneResponse = { id?: string; display_phone_number?: string; verified_name?: string } & GraphError;
type WabaResponse = { id?: string; name?: string } & GraphError;

function requireMetaConfig() {
  const { whatsappApiVersion, whatsappAppId, whatsappAppSecret, whatsappTokenEncryptionKey } = config.receiptDelivery;
  if (!whatsappApiVersion || !whatsappAppId || !whatsappAppSecret || !whatsappTokenEncryptionKey) {
    throw new AppError("WhatsApp Embedded Signup is not fully configured by the platform", 503);
  }
  return { whatsappApiVersion, whatsappAppId, whatsappAppSecret };
}

async function graphRequest<T extends GraphError>(url: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  });
  const payload = await response.json() as T;
  if (!response.ok) {
    throw new AppError(payload.error?.message ?? `Meta Graph API request failed (HTTP ${response.status})`, 502);
  }
  return payload;
}

export async function getWhatsAppConnectionStatus(businessId: string) {
  const connection = await prisma.whatsAppBusinessConnection.findUnique({
    where: { businessId },
    select: {
      id: true, wabaId: true, phoneNumberId: true, displayPhoneNumber: true,
      verifiedName: true, status: true, connectedAt: true, tokenExpiresAt: true,
      lastVerifiedAt: true, lastError: true,
    },
  });
  return {
    configured: Boolean(config.receiptDelivery.whatsappAppId && config.receiptDelivery.whatsappEmbeddedSignupConfigId),
    appId: config.receiptDelivery.whatsappAppId ?? null,
    configurationId: config.receiptDelivery.whatsappEmbeddedSignupConfigId ?? null,
    connection,
  };
}

export async function completeWhatsAppEmbeddedSignup(input: {
  businessId: string; code: string; wabaId: string; phoneNumberId: string;
}) {
  const { whatsappApiVersion, whatsappAppId, whatsappAppSecret } = requireMetaConfig();
  if (!/^[0-9]{5,30}$/.test(input.wabaId) || !/^[0-9]{5,30}$/.test(input.phoneNumberId)) {
    throw new AppError("Meta returned invalid WhatsApp account details", 422);
  }
  if (!input.code || input.code.length > 4096) throw new AppError("Invalid Embedded Signup authorization code", 422);

  const exchangeUrl = new URL(`https://graph.facebook.com/${whatsappApiVersion}/oauth/access_token`);
  exchangeUrl.searchParams.set("client_id", whatsappAppId);
  exchangeUrl.searchParams.set("client_secret", whatsappAppSecret);
  exchangeUrl.searchParams.set("code", input.code);
  const tokenResponse = await fetch(exchangeUrl);
  const tokenPayload = await tokenResponse.json() as TokenResponse;
  if (!tokenResponse.ok || !tokenPayload.access_token) {
    throw new AppError(tokenPayload.error?.message ?? "Meta authorization code could not be exchanged", 502);
  }

  const accessToken = tokenPayload.access_token;
  const base = `https://graph.facebook.com/${whatsappApiVersion}`;
  const [phone, waba] = await Promise.all([
    graphRequest<PhoneResponse>(`${base}/${input.phoneNumberId}?fields=id,display_phone_number,verified_name`, accessToken),
    graphRequest<WabaResponse>(`${base}/${input.wabaId}?fields=id,name`, accessToken),
  ]);
  if (phone.id !== input.phoneNumberId || waba.id !== input.wabaId) {
    throw new AppError("The WhatsApp phone number and business account could not be verified", 422);
  }

  await graphRequest<GraphError>(`${base}/${input.wabaId}/subscribed_apps`, accessToken, { method: "POST" });

  const expiresAt = typeof tokenPayload.expires_in === "number"
    ? new Date(Date.now() + tokenPayload.expires_in * 1000)
    : null;
  try {
    const connection = await prisma.whatsAppBusinessConnection.upsert({
      where: { businessId: input.businessId },
      create: {
        businessId: input.businessId, wabaId: input.wabaId, phoneNumberId: input.phoneNumberId,
        displayPhoneNumber: phone.display_phone_number ?? null, verifiedName: phone.verified_name ?? null,
        encryptedAccessToken: encryptWhatsAppAccessToken(accessToken), tokenExpiresAt: expiresAt,
        status: "CONNECTED", connectedAt: new Date(), lastVerifiedAt: new Date(), lastError: null,
      },
      update: {
        wabaId: input.wabaId, phoneNumberId: input.phoneNumberId,
        displayPhoneNumber: phone.display_phone_number ?? null, verifiedName: phone.verified_name ?? null,
        encryptedAccessToken: encryptWhatsAppAccessToken(accessToken), tokenExpiresAt: expiresAt,
        status: "CONNECTED", connectedAt: new Date(), lastVerifiedAt: new Date(), lastError: null,
      },
      select: { id: true, wabaId: true, phoneNumberId: true, displayPhoneNumber: true, verifiedName: true, status: true, connectedAt: true, tokenExpiresAt: true },
    });
    return connection;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      throw new AppError("This WhatsApp phone number is already connected to another LaundryAngel business", 409);
    }
    throw error;
  }
}

export async function disconnectWhatsAppBusiness(businessId: string) {
  const connection = await prisma.whatsAppBusinessConnection.findUnique({ where: { businessId } });
  if (!connection) return;
  const { whatsappApiVersion } = requireMetaConfig();
  const token = decryptWhatsAppAccessToken(connection.encryptedAccessToken);
  try {
    await fetch(`https://graph.facebook.com/${whatsappApiVersion}/${connection.wabaId}/subscribed_apps`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // Local disconnection must remain possible if Meta is temporarily unavailable.
  }
  await prisma.whatsAppBusinessConnection.delete({ where: { businessId } });
}
