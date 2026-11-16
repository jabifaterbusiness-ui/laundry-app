import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { getChatNotifications, type ChatNotification } from "../../lib/chat-api.js";
import { hasPermission } from "../../lib/permissions.js";
import { useAuthStore } from "../../state/auth-store.js";
import "./ChatAlertManager.css";

export function ChatAlertManager() {
  const token = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);
  const branchId = useAuthStore((state) => state.activeBranchId);
  const navigate = useNavigate();
  const cursor = useRef({ since: new Date(Date.now() - 15_000).toISOString(), afterId: undefined as string | undefined });
  const seen = useRef(new Set<string>());
  const [alert, setAlert] = useState<ChatNotification | null>(null);

  useEffect(() => {
    cursor.current = { since: new Date().toISOString(), afterId: undefined };
    seen.current.clear();
    setAlert(null);
  }, [branchId]);

  const notifications = useQuery({
    queryKey: ["chat-notifications", branchId],
    queryFn: async () => {
      const nextCursor = new Date().toISOString();
      const result = await getChatNotifications(cursor.current.since, cursor.current.afterId);
      if (result.data.length === 30) {
        const lastMessage = result.data[result.data.length - 1];
        cursor.current = { since: lastMessage.createdAt, afterId: lastMessage.id };
      } else {
        cursor.current = { since: nextCursor, afterId: undefined };
      }
      return result.data;
    },
    enabled: Boolean(token && branchId && hasPermission(user, "chat.view")),
    refetchInterval: 4_000,
    refetchIntervalInBackground: true,
    retry: 1,
  });

  useEffect(() => {
    for (const item of notifications.data ?? []) {
      if (seen.current.has(item.id)) continue;
      seen.current.add(item.id);
      setAlert(item);

      if (
        typeof window !== "undefined" &&
        document.hidden &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        try {
          const conversation = item.conversationKind === "GROUP"
            ? item.conversationTitle || "Team group"
            : "Private chat";
          const notification = new Notification(`New message from ${item.senderName}`, {
            body: conversation,
            tag: `laundryangel-chat-${item.id}`,
            icon: "/icons/laundryangel-192.png",
          });
          notification.onclick = () => {
            window.focus();
            navigate("/chat");
            notification.close();
          };
        } catch {
          // Browser notification support varies; the in-app alert remains available.
        }
      }
    }
  }, [notifications.data, navigate]);

  if (!alert) return null;

  const conversation = alert.conversationKind === "GROUP"
    ? alert.conversationTitle || "Team group"
    : "Private chat";

  return (
    <aside className="chat-alert" role="status" aria-live="polite">
      <span className="chat-alert-icon" aria-hidden="true">✉</span>
      <div className="chat-alert-copy">
        <strong>New message · {alert.senderName}</strong>
        <span>{conversation}</span>
      </div>
      <button type="button" onClick={() => { setAlert(null); navigate("/chat"); }}>
        Open
      </button>
      <button type="button" className="chat-alert-dismiss" aria-label="Dismiss message alert" onClick={() => setAlert(null)}>×</button>
    </aside>
  );
}
