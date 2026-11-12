import { apiFetch } from "./api-client.js";

export type CommunicationChannel = "WHATSAPP" | "EMAIL";
export interface AnnouncementInput {
  title: string; message: string; channels: CommunicationChannel[];
  audience: "ALL_CUSTOMERS" | "SELECTED_CUSTOMERS" | "CUSTOMER_GROUP"; customerIds?: string[]; groupId?: string;
  whatsappTemplateName?: string | null; whatsappTemplateLanguage?: string | null;
}
export interface CustomerGroup {
  id: string; name: string; description: string | null;
  _count: { members: number }; members: Array<{ customerId: string; customer: { id: string; name: string; phone: string } }>;
}
export interface StatusNotificationRule {
  id: string; status: string; enabled: boolean; channel: CommunicationChannel | "BOTH";
  whatsappMessage: string | null; whatsappTemplateName: string | null; whatsappTemplateLanguage: string | null;
  emailSubject: string | null; emailMessage: string | null;
}
export interface CommunicationDelivery {
  id: string; channel: CommunicationChannel; messageType: string; destination: string;
  status: string; providerMessageId: string | null; errorMessage: string | null;
  createdAt: string; sentAt: string | null;
  retryOfId: string | null; retryAttempt: number; retryAvailable: boolean;
  customer: { id: string; name: string };
  order: { id: string; orderNumber: string } | null;
  campaign: { id: string; title: string } | null;
}
export interface UnpickedOrder {
  id: string; orderNumber: string; createdAt: string; readyAt: string | null; orderTotal: number;
  customer: { id: string; name: string; phone: string; email: string | null };
  branch: { name: string };
}
export interface ReminderConfig {
  id: string; enabled: boolean; thresholdMonths: number;
  whatsappTemplateName: string | null; whatsappTemplateLanguage: string | null;
}
export async function listCustomerGroups(auth: { accessToken: string | null }) {
  return apiFetch<{ data: CustomerGroup[] }>("/communications/customer-groups", { accessToken: auth.accessToken });
}
export async function saveCustomerGroup(input: { name: string; description?: string | null; customerIds: string[] }, auth: { accessToken: string | null }, id?: string) {
  return apiFetch<CustomerGroup>(id ? `/communications/customer-groups/${id}` : "/communications/customer-groups", { method: id ? "PUT" : "POST", accessToken: auth.accessToken, body: JSON.stringify(input) });
}
export async function deleteCustomerGroup(id: string, auth: { accessToken: string | null }) {
  return apiFetch<void>(`/communications/customer-groups/${id}`, { method: "DELETE", accessToken: auth.accessToken });
}
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
export async function getReminderConfig(auth: { accessToken: string | null; branchId?: string | null }) {
  return apiFetch<ReminderConfig>("/communications/unpicked-orders/config", { accessToken: auth.accessToken, branchId: auth.branchId });
}
export async function saveReminderConfig(input: {
  enabled: boolean; thresholdMonths: number; whatsappTemplateName?: string | null; whatsappTemplateLanguage?: string | null;
}, auth: { accessToken: string | null; branchId?: string | null }) {
  return apiFetch<ReminderConfig>("/communications/unpicked-orders/config", { method: "PUT", accessToken: auth.accessToken, branchId: auth.branchId, body: JSON.stringify(input) });
}
export async function listUnpickedOrders(auth: { accessToken: string | null; branchId?: string | null }) {
  return apiFetch<{ data: UnpickedOrder[] }>("/communications/unpicked-orders", { accessToken: auth.accessToken, branchId: auth.branchId });
}
export async function sendUnpickedReminders(input: { orderIds: string[]; channels: CommunicationChannel[]; message: string }, auth: { accessToken: string | null; branchId?: string | null }) {
  return apiFetch<{ orderCount: number; results: Array<{ status: string; orderId?: string; channel: string; error?: string }> }>("/communications/unpicked-orders/remind", { method: "POST", accessToken: auth.accessToken, branchId: auth.branchId, body: JSON.stringify(input) });
}
export async function listCommunicationDeliveries(auth: { accessToken: string | null; branchId?: string | null }) {
  return apiFetch<{ data: CommunicationDelivery[] }>("/communications/deliveries", {
    accessToken: auth.accessToken,
    branchId: auth.branchId,
  });
}


export interface WhatsAppBusinessConnection {
  id: string;
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  status: string;
  connectedAt: string;
  tokenExpiresAt: string | null;
  lastVerifiedAt: string | null;
  lastError: string | null;
  receiptTemplateName: string | null;
  receiptTemplateLanguage: string | null;
}
export interface WhatsAppConnectionStatus {
  configured: boolean;
  missingConfiguration: string[];
  appId: string | null;
  configurationId: string | null;
  apiVersion: string | null;
  connection: WhatsAppBusinessConnection | null;
}
export async function getWhatsAppConnection(auth: { accessToken: string | null }) {
  return apiFetch<WhatsAppConnectionStatus>("/whatsapp/connection", { accessToken: auth.accessToken });
}
export async function completeWhatsAppConnection(input: { code: string; wabaId: string; phoneNumberId: string }, auth: { accessToken: string | null }) {
  return apiFetch<{ connection: WhatsAppBusinessConnection }>("/whatsapp/connection/embedded-signup", { method: "POST", accessToken: auth.accessToken, body: JSON.stringify(input) });
}
export async function saveWhatsAppReceiptTemplate(input: { templateName: string | null; language: string | null }, auth: { accessToken: string | null }) {
  return apiFetch<{ receiptTemplateName: string | null; receiptTemplateLanguage: string | null }>(
    "/whatsapp/connection/receipt-template",
    { method: "PATCH", accessToken: auth.accessToken, body: JSON.stringify(input) },
  );
}
export async function disconnectWhatsAppConnection(auth: { accessToken: string | null }) {
  return apiFetch<void>("/whatsapp/connection", { method: "DELETE", accessToken: auth.accessToken });
}


export async function retryCommunicationDelivery(id: string, auth: { accessToken: string | null; branchId?: string | null }) {
  return apiFetch<{ status: string; deliveryId?: string; providerMessageId?: string; retryOfId: string; retryAttempt: number; error?: string }>(
    `/communications/deliveries/${id}/retry`,
    { method: "POST", accessToken: auth.accessToken, branchId: auth.branchId },
  );
}
