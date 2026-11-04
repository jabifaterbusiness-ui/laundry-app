import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../../state/auth-store.js";
import { getWhatsAppConnection } from "../../lib/communications-api.js";
import { getApprovedWhatsAppTemplates, getWhatsAppConversations, markWhatsAppConversationRead, sendWhatsAppReply, sendWhatsAppTemplate, type WhatsAppConversation } from "../../lib/whatsapp-inbox-api.js";

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-NG", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export function WhatsAppInboxPanel() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const queryClient = useQueryClient();
  const [selectedPhone, setSelectedPhone] = useState("");
  const [draft, setDraft] = useState("");
  const [feedback, setFeedback] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [templateLanguage, setTemplateLanguage] = useState("");
  const [templateVariables, setTemplateVariables] = useState<string[]>([]);
  const connectionQuery = useQuery({ queryKey: ["whatsapp", "connection"], queryFn: () => getWhatsAppConnection({ accessToken }), enabled: Boolean(accessToken) });
  const isConnected = connectionQuery.data?.connection?.status === "CONNECTED";
  const conversationsQuery = useQuery({
    queryKey: ["whatsapp", "conversations"],
    queryFn: () => getWhatsAppConversations(accessToken),
    enabled: Boolean(accessToken && isConnected),
    refetchInterval: 15000,
  });
  const conversations = conversationsQuery.data?.data ?? [];
  const templatesQuery = useQuery({ queryKey: ["whatsapp", "approved-templates"], queryFn: () => getApprovedWhatsAppTemplates(accessToken), enabled: Boolean(accessToken && isConnected), staleTime: 60000 });
  const templates = templatesQuery.data?.data ?? [];
  const selectedTemplate = templates.find((item) => item.name === templateName && item.language === templateLanguage) ?? templates[0] ?? null;
  useEffect(() => { if (selectedTemplate) setTemplateVariables(Array(selectedTemplate.bodyVariableCount).fill("")); }, [selectedTemplate?.id, selectedTemplate?.bodyVariableCount]);
  const selected = conversations.find((item) => item.phone === selectedPhone) ?? conversations[0] ?? null;
  const readMutation = useMutation({
    mutationFn: (conversation: WhatsAppConversation) => markWhatsAppConversationRead({ customerId: conversation.customerId, phone: conversation.phone }, accessToken),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["whatsapp", "conversations"] }),
  });
  const templateMutation = useMutation({
    mutationFn: () => {
      if (!selected || !selectedTemplate) throw new Error("Select a conversation and an approved template.");
      return sendWhatsAppTemplate({ customerId: selected.customerId, phone: selected.phone, templateName: selectedTemplate.name, language: selectedTemplate.language, variables: templateVariables }, accessToken);
    },
    onSuccess: async (result) => { setFeedback("Approved template “" + result.template + "” sent."); setTemplateVariables(Array(selectedTemplate?.bodyVariableCount ?? 0).fill("")); await queryClient.invalidateQueries({ queryKey: ["whatsapp", "conversations"] }); },
    onError: (error) => setFeedback(error instanceof Error ? error.message : "Unable to send approved template."),
  });
  const sendMutation = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error("Select a customer conversation first.");
      return sendWhatsAppReply({ customerId: selected.customerId, phone: selected.phone, body: draft }, accessToken);
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
      {!connectionQuery.isLoading && !isConnected ? <div style={{ marginTop: 18, padding: 24, background: "#fff7ed", borderRadius: 14, color: "#9a3412" }}>Connect this company’s WhatsApp Business number above to start receiving and replying to customer messages.</div> : null}
      {conversationsQuery.isLoading || connectionQuery.isLoading ? <p>Loading conversations…</p> : null}
      {isConnected && conversationsQuery.isError ? <p role="alert" style={{ color: "#b91c1c" }}>WhatsApp conversations could not be loaded. Check the connection and refresh.</p> : null}
      {isConnected && !conversationsQuery.isLoading && conversations.length === 0 ? <div style={{ marginTop: 18, padding: 30, textAlign: "center", background: "#f8fafc", borderRadius: 14 }}><h3>No customer messages yet</h3><p style={{ color: "#64748b" }}>When customers message your connected WhatsApp number, their conversations will appear here.</p></div> : null}
      {conversations.length > 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, .8fr) minmax(0, 1.7fr)", gap: 14, marginTop: 18, minHeight: 430 }}>
          <div style={{ border: "1px solid #e2e8f0", borderRadius: 13, overflow: "auto", maxHeight: 520 }}>
            {conversations.map((conversation: WhatsAppConversation) => (
              <button key={conversation.phone} type="button" onClick={() => { setSelectedPhone(conversation.phone); setFeedback(""); if (conversation.unreadCount > 0) readMutation.mutate(conversation); }} style={{ display: "block", width: "100%", textAlign: "left", padding: 13, border: 0, borderBottom: "1px solid #edf2f7", background: selected?.phone === conversation.phone ? "#ecfdf5" : "#fff", cursor: "pointer" }}>
                <strong style={{ display: "block", color: "#0f172a" }}>{conversation.customerName}</strong>
                <small style={{ color: "#64748b" }}>{conversation.phone}</small>
                <span style={{ display: "block", color: "#475569", fontSize: 12, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", marginTop: 5 }}>{conversation.lastMessage}</span>
                <small style={{ color: "#94a3b8" }}>{formatTime(conversation.lastMessageAt)}</small>
                {conversation.unreadCount > 0 ? <span style={{ float: "right", background: "#0f766e", color: "#fff", borderRadius: 99, padding: "2px 7px", fontSize: 11 }}>{conversation.unreadCount} new</span> : null}
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
                
                <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={3} maxLength={4096} placeholder="Write a WhatsApp reply…" style={{ width: "100%", resize: "vertical", border: "1px solid #cbd5e1", borderRadius: 10, padding: 10, boxSizing: "border-box" }} />
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginTop: 8 }}>
                  <small style={{ color: "#64748b" }}>Free-form replies are available within 24 hours of the customer's last message.</small>
                  <button type="submit" disabled={!draft.trim() || sendMutation.isPending} style={{ background: "#0f766e", color: "#fff", border: 0, borderRadius: 9, padding: "9px 15px", fontWeight: 700 }}>{sendMutation.isPending ? "Sending…" : "Send reply"}</button>
                </div>
                {feedback ? <p role="status" style={{ color: sendMutation.isError || templateMutation.isError ? "#b91c1c" : "#047857", fontSize: 13, marginBottom: 0 }}>{feedback}</p> : null}
              </form>
              <details style={{ padding: "0 12px 12px" }}>
                <summary style={{ cursor: "pointer", color: "#0f766e", fontWeight: 700 }}>Send an approved template (outside the 24-hour reply window)</summary>
                
                {templatesQuery.isLoading ? <p>Loading approved templates…</p> : null}
                {templatesQuery.isError ? <p role="alert" style={{ color: "#b91c1c" }}>Could not load templates from Meta. Check the WhatsApp connection.</p> : null}
                {templates.length === 0 && !templatesQuery.isLoading && !templatesQuery.isError ? <p style={{ color: "#64748b", fontSize: 13 }}>No approved templates are available in this company’s WhatsApp account yet. Create and get a template approved in WhatsApp Manager first.</p> : null}
                {selectedTemplate ? (
                  <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                    <label style={{ display: "grid", gap: 4, fontSize: 13 }}>Approved template
                      <select value={selectedTemplate ? selectedTemplate.name + "|" + selectedTemplate.language : ""} onChange={(event) => { const [name, language] = event.target.value.split("|"); setTemplateName(name ?? ""); setTemplateLanguage(language ?? ""); const match = templates.find((item) => item.name === name && item.language === language); setTemplateVariables(Array(match?.bodyVariableCount ?? 0).fill("")); }} style={{ padding: 9, border: "1px solid #cbd5e1", borderRadius: 8 }}>
                        {templates.map((item) => <option key={item.id} value={item.name + "|" + item.language}>{item.name} · {item.language} · {item.category}</option>)}
                      </select>
                    </label>
                    {Array.from({ length: selectedTemplate.bodyVariableCount }, (_, index) => (
                      <label key={index} style={{ display: "grid", gap: 4, fontSize: 13 }}>Body variable {index + 1}
                        <input value={templateVariables[index] ?? ""} onChange={(event) => setTemplateVariables((current) => { const values = [...current]; values[index] = event.target.value; return values; })} maxLength={1024} placeholder={"Value for {{" + (index + 1) + "}}"} style={{ padding: 9, border: "1px solid #cbd5e1", borderRadius: 8 }} />
                      </label>
                    ))}
                    <button type="button" disabled={templateMutation.isPending || templateVariables.length !== selectedTemplate.bodyVariableCount || templateVariables.some((value) => !value.trim())} onClick={() => templateMutation.mutate()} style={{ justifySelf: "start", background: "#0f766e", color: "#fff", border: 0, borderRadius: 9, padding: "9px 15px", fontWeight: 700 }}>{templateMutation.isPending ? "Sending template…" : "Send approved template"}</button>
                  </div>
                ) : null}
              </details>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
