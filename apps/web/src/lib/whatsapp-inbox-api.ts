import { apiFetch, apiFetchBlob } from "./api-client.js";

export interface WhatsAppInboxMessage {
  id: string;
  providerMessageId: string | null;
  direction: "INBOUND" | "OUTBOUND";
  phone: string;
  text: string;
  messageType: string;
  mediaId: string | null;
  mediaMimeType: string | null;
  mediaCaption: string | null;
  mediaFilename: string | null;
  timestamp: string;
  status: string;
}
export interface WhatsAppConversation {
  customerId: string | null;
  customerName: string;
  phone: string;
  lastMessage: string;
  lastMessageAt: string;
  lastDirection: string;
  lastStatus: string;
  unreadCount: number;
  messages: WhatsAppInboxMessage[];
}
export async function getWhatsAppConversations(accessToken: string | null) {
  return apiFetch<{ data: WhatsAppConversation[] }>("/whatsapp/inbox/conversations", { accessToken });
}
export async function sendWhatsAppReply(input: { customerId?: string | null; phone: string; body: string }, accessToken: string | null) {
  return apiFetch<{ id: string; customerId: string | null; customerName: string; phone: string; body: string; sentAt: string; status: string }>(
    "/whatsapp/inbox/conversations/replies",
    { method: "POST", accessToken, body: JSON.stringify(input) },
  );
}
export async function markWhatsAppConversationRead(input: { customerId?: string | null; phone: string }, accessToken: string | null) {
  return apiFetch<{ markedRead: number }>(
    "/whatsapp/inbox/conversations/read",
    { method: "POST", accessToken, body: JSON.stringify(input) },
  );
}

export interface ApprovedWhatsAppTemplate {
  id: string;
  name: string;
  language: string;
  category: string;
  bodyVariableCount: number;
  headerFormat?: string | null;
}
export async function getApprovedWhatsAppTemplates(accessToken: string | null) {
  return apiFetch<{ data: ApprovedWhatsAppTemplate[] }>("/whatsapp/inbox/templates", { accessToken });
}
export async function sendWhatsAppTemplate(input: { customerId?: string | null; phone: string; templateName: string; language: string; variables: string[] }, accessToken: string | null) {
  return apiFetch<{ providerMessageId: string; customerId: string | null; phone: string; template: string; status: string }>(
    "/whatsapp/inbox/templates/send",
    { method: "POST", accessToken, body: JSON.stringify(input) },
  );
}

export async function getWhatsAppMediaPreview(mediaId: string, accessToken: string | null) {
  return apiFetchBlob(`/whatsapp/inbox/media/${encodeURIComponent(mediaId)}`, { accessToken });
}
