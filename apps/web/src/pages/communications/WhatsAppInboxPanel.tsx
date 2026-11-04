import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../../state/auth-store.js";
import { getWhatsAppConversations, sendWhatsAppReply, type WhatsAppConversation } from "../../lib/whatsapp-inbox-api.js";

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-NG", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export function WhatsAppInboxPanel() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const queryClient = useQueryClient();
  const [selectedPhone, setSelectedPhone] = useState("");
  const [draft, setDraft] = useState("");
  const [feedback, setFeedback] = useState("");
  const conversationsQuery = useQuery({
    queryKey: ["whatsapp", "conversations"],
    queryFn: () => getWhatsAppConversations(accessToken),
    enabled: Boolean(accessToken),
    refetchInterval: 15000,
  });
  const conversations = conversationsQuery.data?.data ?? [];
  const selected = conversations.find((item) => item.phone === selectedPhone) ?? conversations[0] ?? null;
  const sendMutation = useMutation({
    mutationFn: () => {
      if (!selected?.customerId) throw new Error("This number is not linked to a customer record yet.");
      return sendWhatsAppReply(selected.customerId, draft, accessToken);
    },
    onSuccess: async () => {
      setDraft("");
      setFeedback("Reply sent to the customer.");
      await queryClient.invalidateQueries({ queryKey: ["whatsapp", "conversations"] });
    },
    onError: (error) => setFeedback(error instanceof Error ? error.message : "Unable to send this reply."),
  });

  return (
    <section style={{ border: "1px solid #dbe3ed", borderRadius: 18, padding: 20, marginBottom: 22, background: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div><p style={{ color: "#0f766e", fontSize: 12, fontWeight: 800, letterSpacing: ".08em", margin: 0 }}>CUSTOMER MESSAGING</p><h2 style={{ margin: "5px 0" }}>WhatsApp inbox</h2><p style={{ color: "#64748b", margin: 0 }}>Receive customer messages and reply using your business WhatsApp number.</p></div>
        <span style={{ background: "#ecfdf5", color: "#047857", borderRadius: 999, padding: "7px 12px", fontSize: 12, fontWeight: 700 }}>Live updates · 15 sec</span>
      </div>
      {conversationsQuery.isLoading ? <p>Loading conversations…</p> : null}
      {conversationsQuery.isError ? <p role="alert" style={{ color: "#b91c1c" }}>WhatsApp conversations could not be loaded. Check the connection and refresh.</p> : null}
      {!conversationsQuery.isLoading && conversations.length === 0 ? <div style={{ marginTop: 18, padding: 30, textAlign: "center", background: "#f8fafc", borderRadius: 14 }}><h3>No customer messages yet</h3><p style={{ color: "#64748b" }}>When customers message your connected WhatsApp number, their conversations will appear here.</p></div> : null}
      {conversations.length > 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, .8fr) minmax(0, 1.7fr)", gap: 14, marginTop: 18, minHeight: 430 }}>
          <div style={{ border: "1px solid #e2e8f0", borderRadius: 13, overflow: "auto", maxHeight: 520 }}>
            {conversations.map((conversation: WhatsAppConversation) => (
              <button key={conversation.phone} type="button" onClick={() => { setSelectedPhone(conversation.phone); setFeedback(""); }} style={{ display: "block", width: "100%", textAlign: "left", padding: 13, border: 0, borderBottom: "1px solid #edf2f7", background: selected?.phone === conversation.phone ? "#ecfdf5" : "#fff", cursor: "pointer" }}>
                <strong style={{ display: "block", color: "#0f172a" }}>{conversation.customerName}</strong>
                <small style={{ color: "#64748b" }}>{conversation.phone}</small>
                <span style={{ display: "block", color: "#475569", fontSize: 12, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", marginTop: 5 }}>{conversation.lastMessage}</span>
                <small style={{ color: "#94a3b8" }}>{formatTime(conversation.lastMessageAt)}</small>
              </button>
            ))}
          </div>
          {selected ? (
            <div style={{ display: "flex", flexDirection: "column", border: "1px solid #e2e8f0", borderRadius: 13, minWidth: 0 }}>
              <header style={{ padding: 13, borderBottom: "1px solid #e2e8f0" }}><strong>{selected.customerName}</strong><small style={{ display: "block", color: "#64748b" }}>{selected.phone}</small></header>
              <div style={{ flex: 1, minHeight: 260, maxHeight: 360, overflow: "auto", padding: 14, background: "#f8fafc" }}>
                {selected.messages.map((message) => (
                  <div key={message.id} style={{ display: "flex", justifyContent: message.direction === "OUTBOUND" ? "flex-end" : "flex-start", marginBottom: 10 }}>
                    <div style={{ maxWidth: "82%", padding: "9px 12px", borderRadius: 13, background: message.direction === "OUTBOUND" ? "#dcfce7" : "#fff", border: "1px solid #e2e8f0" }}>
                      <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{message.text}</div>
                      <small style={{ display: "block", color: "#64748b", marginTop: 5, textAlign: "right" }}>{formatTime(message.timestamp)} · {message.status}</small>
                    </div>
                  </div>
                ))}
              </div>
              <form onSubmit={(event) => { event.preventDefault(); sendMutation.mutate(); }} style={{ padding: 12, borderTop: "1px solid #e2e8f0" }}>
                {!selected.customerId ? <p style={{ color: "#b45309", fontSize: 13 }}>This number is not linked to a customer record. Add the customer to your records before replying.</p> : null}
                <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={3} maxLength={4096} placeholder="Write a WhatsApp reply…" style={{ width: "100%", resize: "vertical", border: "1px solid #cbd5e1", borderRadius: 10, padding: 10, boxSizing: "border-box" }} />
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginTop: 8 }}>
                  <small style={{ color: "#64748b" }}>Free-form replies are available within 24 hours of the customer's last message.</small>
                  <button type="submit" disabled={!selected.customerId || !draft.trim() || sendMutation.isPending} style={{ background: "#0f766e", color: "#fff", border: 0, borderRadius: 9, padding: "9px 15px", fontWeight: 700 }}>{sendMutation.isPending ? "Sending…" : "Send reply"}</button>
                </div>
                {feedback ? <p role="status" style={{ color: sendMutation.isError ? "#b91c1c" : "#047857", fontSize: 13, marginBottom: 0 }}>{feedback}</p> : null}
              </form>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
