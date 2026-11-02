import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { dismissBusinessInboxMessage, getBusinessInbox, markBusinessInboxMessageRead, type BusinessInboxMessage } from "../../lib/inbox-api.js";
import { useAuthStore } from "../../state/auth-store.js";
import "./InboxPage.css";
function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
export function InboxPage() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const queryClient = useQueryClient();
  const inboxQuery = useQuery({ queryKey: ["business-inbox"], queryFn: () => getBusinessInbox(accessToken), enabled: Boolean(accessToken), refetchInterval: 60_000 });
  const [feedback, setFeedback] = useState("");
  const refresh = async () => queryClient.invalidateQueries({ queryKey: ["business-inbox"] });
  const readMutation = useMutation({
    mutationFn: (id: string) => markBusinessInboxMessageRead(id, accessToken),
    onSuccess: async () => { setFeedback("Message marked as read."); await refresh(); },
  });
  const dismissMutation = useMutation({
    mutationFn: (id: string) => dismissBusinessInboxMessage(id, accessToken),
    onSuccess: async () => { await refresh(); },
  });
  const messages = inboxQuery.data?.messages ?? [];
  return (
    <section className="business-inbox-page">
      <header className="business-inbox-hero">
        <div><span className="business-inbox-eyebrow">BUSINESS COMMUNICATIONS</span><h1>Inbox</h1><p>Important updates and announcements from the LaundryAngel platform team.</p></div>
        <div className="business-inbox-count"><strong>{inboxQuery.data?.unreadCount ?? 0}</strong><span>Unread messages</span></div>
      </header>
      {inboxQuery.isLoading ? <div className="business-inbox-panel">Loading your inbox…</div> : null}
      {inboxQuery.isError ? <div className="business-inbox-panel business-inbox-error" role="alert">Your inbox could not be loaded. Please refresh and try again.</div> : null}
      {feedback ? <p className="business-inbox-feedback" role="status">{feedback}</p> : null}
      {!inboxQuery.isLoading && !inboxQuery.isError && messages.length === 0 ? <div className="business-inbox-empty"><span>✉</span><h2>You’re all caught up</h2><p>New platform announcements will appear here.</p></div> : null}
      <div className="business-inbox-list">
        {messages.map((message: BusinessInboxMessage) => (
          <article className={`business-inbox-card ${message.readAt ? "is-read" : "is-unread"}`} key={message.id}>
            <div className="business-inbox-card-heading"><div><span className="business-inbox-tag">{message.readAt ? "Read" : "New announcement"}</span><h2>{message.title}</h2></div><time>{formatDate(message.publishedAt)}</time></div>
            <p>{message.body}</p>
            <div className="business-inbox-card-actions">
              {!message.readAt ? <button type="button" className="button button-primary" disabled={readMutation.isPending} onClick={() => readMutation.mutate(message.id)}>Mark as read</button> : <span className="business-inbox-read-label">Read</span>}
              {!message.dismissedAt ? <button type="button" className="button button-secondary" disabled={dismissMutation.isPending} onClick={() => dismissMutation.mutate(message.id)}>Dismiss popup</button> : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
