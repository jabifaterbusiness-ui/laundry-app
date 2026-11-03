import { config } from "../../../config/index.js";

export interface SendWhatsAppReceiptInput {
  to: string;
  image: Buffer;
  caption?: string;
}

interface WhatsAppApiResponse {
  messages?: Array<{
    id?: string;
  }>;
  media?: Array<{
    id?: string;
  }>;
  id?: string;
  error?: {
    message?: string;
  };
}

export async function sendWhatsAppReceipt(
  input: SendWhatsAppReceiptInput,
): Promise<{ id: string }> {
  const {
    whatsappApiVersion,
    whatsappPhoneNumberId,
    whatsappAccessToken,
  } = config.receiptDelivery;

  if (
    !whatsappApiVersion ||
    !whatsappPhoneNumberId ||
    !whatsappAccessToken
  ) {
    throw new Error("WhatsApp provider is not configured");
  }

  const mediaForm = new FormData();
  mediaForm.append("messaging_product", "whatsapp");
  mediaForm.append(
    "file",
    new Blob([input.image], { type: "image/png" }),
    "receipt.png",
  );
  mediaForm.append("type", "image/png");

  const mediaResponse = await fetch(
    "https://graph.facebook.com/" +
      whatsappApiVersion +
      "/" +
      whatsappPhoneNumberId +
      "/media",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${whatsappAccessToken}`,
      },
      body: mediaForm,
    },
  );

  const mediaPayload = (await mediaResponse.json()) as WhatsAppApiResponse;

  if (!mediaResponse.ok) {
    throw new Error(
      `WhatsApp media upload failed: ${
        mediaPayload.error?.message ?? `HTTP ${mediaResponse.status}`
      }`,
    );
  }

  const mediaId =
    mediaPayload.id ??
    mediaPayload.media?.[0]?.id;

  if (!mediaId) {
    throw new Error("WhatsApp media upload returned no media ID");
  }

  const messageResponse = await fetch(
    "https://graph.facebook.com/" +
      whatsappApiVersion +
      "/" +
      whatsappPhoneNumberId +
      "/messages",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${whatsappAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: input.to,
        type: "image",
        image: {
          id: mediaId,
          ...(input.caption ? { caption: input.caption } : {}),
        },
      }),
    },
  );

  const messagePayload =
    (await messageResponse.json()) as WhatsAppApiResponse;

  if (!messageResponse.ok) {
    throw new Error(
      `WhatsApp delivery failed: ${
        messagePayload.error?.message ?? `HTTP ${messageResponse.status}`
      }`,
    );
  }

  const id = messagePayload.messages?.[0]?.id;

  if (!id) {
    throw new Error("WhatsApp delivery returned no message ID");
  }

  return { id };
}


export interface SendWhatsAppTextInput {
  to: string;
  body: string;
}

export async function sendWhatsAppText(input: SendWhatsAppTextInput): Promise<{ id: string }> {
  const { whatsappApiVersion, whatsappPhoneNumberId, whatsappAccessToken } = config.receiptDelivery;
  if (!whatsappApiVersion || !whatsappPhoneNumberId || !whatsappAccessToken) {
    throw new Error("WhatsApp provider is not configured");
  }
  const response = await fetch(
    `https://graph.facebook.com/${whatsappApiVersion}/${whatsappPhoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${whatsappAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: input.to,
        type: "text",
        text: { preview_url: false, body: input.body },
      }),
    },
  );
  const payload = (await response.json()) as WhatsAppApiResponse;
  if (!response.ok) {
    throw new Error(`WhatsApp delivery failed: ${payload.error?.message ?? `HTTP ${response.status}`}`);
  }
  const id = payload.messages?.[0]?.id;
  if (!id) throw new Error("WhatsApp delivery returned no message ID");
  return { id };
}
