import { apiFetch } from "./api-client.js";
export interface BusinessInboxMessage {
  id: string; broadcastId: string; title: string; body: string;
  displayDurationMinutes: number; publishedAt: string; expiresAt: string | null;
  readAt: string | null; dismissedAt: string | null;
}
export interface BusinessInboxResponse { messages: BusinessInboxMessage[]; unreadCount: number; }
export async function getBusinessInbox(accessToken: string | null) {
  return apiFetch<BusinessInboxResponse>("/inbox", { accessToken });
}
export async function markBusinessInboxMessageRead(id: string, accessToken: string | null) {
  return apiFetch<{ id: string; readAt: string | null }>(`/inbox/${encodeURIComponent(id)}/read`, { method: "PATCH", accessToken });
}
export async function dismissBusinessInboxMessage(id: string, accessToken: string | null) {
  return apiFetch<{ id: string; dismissedAt: string | null }>(`/inbox/${encodeURIComponent(id)}/dismiss`, { method: "PATCH", accessToken });
}
