import { config } from "../../../config/index.js";

export interface SendWhatsAppReceiptInput {
  to: string;
  message: string;
}

interface WhatsAppApiResponse {
  messages?: Array<{
    id?: string;
  }>;
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

  const response = await fetch(
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
        type: "text",
        text: {
          body: input.message,
        },
      }),
    },
  );

  const payload = (await response.json()) as WhatsAppApiResponse;

  if (!response.ok) {
    throw new Error(
      `WhatsApp delivery failed: ${
        payload.error?.message ?? `HTTP ${response.status}`
      }`,
    );
  }

  const id = payload.messages?.[0]?.id;

  if (!id) {
    throw new Error("WhatsApp delivery returned no message ID");
  }

  return { id };
}
