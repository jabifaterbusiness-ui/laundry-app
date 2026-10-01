import { apiFetch } from "./api-client.js";

export type SuspiciousActivityRecord = {
  id: string;
  timestamp: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorUserId: string | null;
  actorName: string | null;
  metadata: unknown;
  correlationId: string | null;
};

export function listSuspiciousActivity(
  accessToken: string,
  limit = 100,
) {
  return apiFetch<SuspiciousActivityRecord[]>(
    `/audit/suspicious-activity?limit=${encodeURIComponent(String(limit))}`,
    {
      accessToken,
    },
  );
}
