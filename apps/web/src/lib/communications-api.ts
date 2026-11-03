import { apiFetch } from "./api-client.js";

export type CommunicationChannel = "WHATSAPP" | "EMAIL";
export interface AnnouncementInput {
  title: string; message: string; channels: CommunicationChannel[];
  audience: "ALL_CUSTOMERS" | "SELECTED_CUSTOMERS"; customerIds?: string[];
}
export interface StatusNotificationRule {
  id: string; status: string; enabled: boolean; channel: CommunicationChannel | "BOTH";
  whatsappMessage: string | null; emailSubject: string | null; emailMessage: string | null;
}
export interface CommunicationDelivery {
  id: string; channel: CommunicationChannel; messageType: string; destination: string;
  status: string; providerMessageId: string | null; errorMessage: string | null;
  createdAt: string; sentAt: string | null;
  customer: { id: string; name: string };
  order: { id: string; orderNumber: string } | null;
  campaign: { id: string; title: string } | null;
}
export interface UnpickedOrder {
  id: string; orderNumber: string; createdAt: string; orderTotal: number;
  customer: { id: string; name: string; phone: string; email: string | null };
  branch: { name: string };
}
export interface ReminderConfig { id: string; enabled: boolean; thresholdMonths: number }
export async function createAnnouncement(input: AnnouncementInput, auth: { accessToken: string | null }) {
  return apiFetch<{ campaignId: string; recipientCount: number; results: Array<{ status: string; channel: string; customerId?: string; error?: string }> }>("/communications/announcements", { method: "POST", accessToken: auth.accessToken, body: JSON.stringify(input) });
}
export async function listStatusRules(auth: { accessToken: string | null }) {
  return apiFetch<{ data: StatusNotificationRule[] }>("/communications/status-rules", { accessToken: auth.accessToken });
}
export async function saveStatusRule(input: Omit<StatusNotificationRule, "id">, auth: { accessToken: string | null }) {
  return apiFetch<StatusNotificationRule>("/communications/status-rules", { method: "PUT", accessToken: auth.accessToken, body: JSON.stringify(input) });
}
export async function deleteStatusRule(id: string, auth: { accessToken: string | null }) {
  return apiFetch<void>(`/communications/status-rules/${id}`, { method: "DELETE", accessToken: auth.accessToken });
}
export async function getReminderConfig(auth: { accessToken: string | null }) {
  return apiFetch<ReminderConfig>("/communications/unpicked-orders/config", { accessToken: auth.accessToken });
}
export async function saveReminderConfig(input: { enabled: boolean; thresholdMonths: number }, auth: { accessToken: string | null }) {
  return apiFetch<ReminderConfig>("/communications/unpicked-orders/config", { method: "PUT", accessToken: auth.accessToken, body: JSON.stringify(input) });
}
export async function listUnpickedOrders(auth: { accessToken: string | null }) {
  return apiFetch<{ data: UnpickedOrder[] }>("/communications/unpicked-orders", { accessToken: auth.accessToken });
}
export async function sendUnpickedReminders(input: { orderIds: string[]; channels: CommunicationChannel[]; message: string }, auth: { accessToken: string | null }) {
  return apiFetch<{ orderCount: number; results: Array<{ status: string; orderId?: string; channel: string; error?: string }> }>("/communications/unpicked-orders/remind", { method: "POST", accessToken: auth.accessToken, body: JSON.stringify(input) });
}
export async function listCommunicationDeliveries(auth: { accessToken: string | null }) {
  return apiFetch<{ data: CommunicationDelivery[] }>("/communications/deliveries", { accessToken: auth.accessToken });
}
