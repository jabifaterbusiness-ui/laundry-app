import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../lib/api-client.js";
import { listCustomers } from "../../lib/customers-api.js";
import { useAuthStore } from "../../state/auth-store.js";
import { WhatsAppConnectionPanel } from "./WhatsAppConnectionPanel.js";
import { WhatsAppInboxPanel } from "./WhatsAppInboxPanel.js";
import { getApprovedWhatsAppTemplates } from "../../lib/whatsapp-inbox-api.js";
import {
  createAnnouncement, deleteStatusRule, getReminderConfig, listCustomerGroups,
  listCommunicationDeliveries, listStatusRules, listUnpickedOrders, getWhatsAppConnection,
  saveReminderConfig, saveStatusRule, sendUnpickedReminders, retryCommunicationDelivery,
  type CommunicationChannel,
} from "../../lib/communications-api.js";

const STATUSES = ["RECEIVED", "IN_PROGRESS", "READY_FOR_PICKUP", "COMPLETED", "CANCELLED"];
const DEFAULT_REMINDER = "Hello {{customerName}}, your order {{orderNumber}} has been ready for pickup. Please contact us to arrange collection. Thank you.";
function money(value: number) { return `₦${value.toLocaleString("en-NG")}`; }

export function CommunicationsPage() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const activeBranchId = useAuthStore((state) => state.activeBranchId);
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [announcementMessage, setAnnouncementMessage] = useState("");
  const [announcementTemplateName, setAnnouncementTemplateName] = useState("");
  const [announcementTemplateLanguage, setAnnouncementTemplateLanguage] = useState("");
  const [audience, setAudience] = useState<"ALL_CUSTOMERS" | "SELECTED_CUSTOMERS" | "CUSTOMER_GROUP">("ALL_CUSTOMERS");
  const [groupId, setGroupId] = useState("");
  const [customerIds, setCustomerIds] = useState<string[]>([]);
  const [customerPage, setCustomerPage] = useState(1);
  const [announcementChannels, setAnnouncementChannels] = useState<CommunicationChannel[]>(["WHATSAPP"]);
  const [status, setStatus] = useState("READY_FOR_PICKUP");
  const [ruleEnabled, setRuleEnabled] = useState(true);
  const [ruleChannel, setRuleChannel] = useState<"WHATSAPP" | "EMAIL" | "BOTH">("WHATSAPP");
  const [whatsappTemplate, setWhatsappTemplate] = useState("Hello {{customerName}}, your order {{orderNumber}} is ready for pickup. Thank you for choosing {{companyName}}.");
  const [whatsappTemplateName, setWhatsappTemplateName] = useState("");
  const [whatsappTemplateLanguage, setWhatsappTemplateLanguage] = useState("");
  const [emailSubject, setEmailSubject] = useState("Order update from {{companyName}}");
  const [emailTemplate, setEmailTemplate] = useState("Hello {{customerName}},\n\nYour order {{orderNumber}} is ready for pickup.\n\nThank you for choosing {{companyName}}.");
  const [thresholdMonths, setThresholdMonths] = useState(2);
  const [reminderTemplateName, setReminderTemplateName] = useState("");
  const [reminderTemplateLanguage, setReminderTemplateLanguage] = useState("");
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [reminderMessage, setReminderMessage] = useState(DEFAULT_REMINDER);
  const [reminderChannels, setReminderChannels] = useState<CommunicationChannel[]>(["WHATSAPP"]);
  const [feedback, setFeedback] = useState<string | null>(null);

  const customersQuery = useQuery({
    queryKey: ["customers", "communications", activeBranchId, customerPage],
    queryFn: () => listCustomers({ page: customerPage, pageSize: 100, status: "active" }, { accessToken }),
    enabled: Boolean(accessToken && activeBranchId),
  });
  const connectionQuery = useQuery({
    queryKey: ["whatsapp", "connection"],
    queryFn: () => getWhatsAppConnection({ accessToken }),
    enabled: Boolean(accessToken),
  });
  const approvedTemplatesQuery = useQuery({
    queryKey: ["whatsapp", "templates"],
    queryFn: () => getApprovedWhatsAppTemplates(accessToken),
    enabled: Boolean(accessToken && connectionQuery.data?.connection?.status === "CONNECTED"),
  });
  const groupsQuery = useQuery({
    queryKey: ["communications", "customer-groups"],
    queryFn: () => listCustomerGroups({ accessToken }),
  });
  const rulesQuery = useQuery({
    queryKey: ["communications", "status-rules"],
    queryFn: () => listStatusRules({ accessToken }),
  });
  const deliveriesQuery = useQuery({
    queryKey: ["communications", "deliveries", activeBranchId],
    queryFn: () => listCommunicationDeliveries({ accessToken, branchId: activeBranchId }),
    enabled: Boolean(accessToken && activeBranchId),
  });
  useEffect(() => {
    const rule = rulesQuery.data?.data.find((item) => item.status === status);
    if (rule) {
      setRuleEnabled(rule.enabled);
      setRuleChannel(rule.channel);
      setWhatsappTemplate(rule.whatsappMessage ?? "");
      setWhatsappTemplateName(rule.whatsappTemplateName ?? "");
      setWhatsappTemplateLanguage(rule.whatsappTemplateLanguage ?? "");
      setEmailSubject(rule.emailSubject ?? "");
      setEmailTemplate(rule.emailMessage ?? "");
    } else {
      setRuleEnabled(false);
      setRuleChannel("WHATSAPP");
      setWhatsappTemplate("");
      setWhatsappTemplateName("");
      setWhatsappTemplateLanguage("");
      setEmailSubject("");
      setEmailTemplate("");
    }
  }, [status, rulesQuery.data]);

  const reminderConfigQuery = useQuery({
    queryKey: ["communications", "reminder-config", activeBranchId],
    queryFn: () => getReminderConfig({ accessToken, branchId: activeBranchId }),
    enabled: Boolean(accessToken && activeBranchId),
  });

  useEffect(() => {
    if (!reminderConfigQuery.data) return;
    setThresholdMonths(reminderConfigQuery.data.thresholdMonths);
    setRemindersEnabled(reminderConfigQuery.data.enabled);
    setReminderTemplateName(reminderConfigQuery.data.whatsappTemplateName ?? "");
    setReminderTemplateLanguage(reminderConfigQuery.data.whatsappTemplateLanguage ?? "");
  }, [
    reminderConfigQuery.data?.thresholdMonths,
    reminderConfigQuery.data?.enabled,
    reminderConfigQuery.data?.whatsappTemplateName,
    reminderConfigQuery.data?.whatsappTemplateLanguage,
  ]);

  const unpickedQuery = useQuery({
    queryKey: ["communications", "unpicked-orders", activeBranchId],
    queryFn: () => listUnpickedOrders({ accessToken, branchId: activeBranchId }),
    enabled: Boolean(accessToken && activeBranchId),
  });

  const announcementMutation = useMutation({
    mutationFn: () => createAnnouncement({
      title: title.trim(), message: announcementMessage.trim(), audience,
      channels: announcementChannels,
      ...(announcementTemplateName && announcementTemplateLanguage ? {
        whatsappTemplateName: announcementTemplateName, whatsappTemplateLanguage: announcementTemplateLanguage,
      } : {}),
      ...(audience === "SELECTED_CUSTOMERS" ? { customerIds } : {}),
      ...(audience === "CUSTOMER_GROUP" ? { groupId } : {}),
    }, { accessToken }),
    onSuccess: async (result) => {
      setFeedback(`Announcement processed for ${result.recipientCount} customers. ${result.results.filter((item) => item.status === "SENT").length} deliveries sent; ${result.results.filter((item) => item.status === "FAILED").length} failed.`);
      setTitle(""); setAnnouncementMessage(""); setCustomerIds([]);
      await queryClient.invalidateQueries({ queryKey: ["communications", "deliveries"] });
    },
    onError: (error) => setFeedback(error instanceof ApiError ? error.message : "Unable to send announcement."),
  });
  const ruleMutation = useMutation({
    mutationFn: () => saveStatusRule({
      status, enabled: ruleEnabled, channel: ruleChannel,
      whatsappMessage: whatsappTemplate,
      whatsappTemplateName: whatsappTemplateName || null,
      whatsappTemplateLanguage: whatsappTemplateLanguage || null,
      emailSubject, emailMessage: emailTemplate,
    }, { accessToken }),
    onSuccess: async () => {
      setFeedback(`Notification rule saved for ${status.replaceAll("_", " ")}.`);
      await queryClient.invalidateQueries({ queryKey: ["communications", "status-rules"] });
    },
    onError: (error) => setFeedback(error instanceof Error ? error.message : "Unable to save notification rule."),
  });
  const removeRuleMutation = useMutation({
    mutationFn: (id: string) => deleteStatusRule(id, { accessToken }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["communications", "status-rules"] }),
  });
  const configMutation = useMutation({
    mutationFn: () => saveReminderConfig({
      enabled: remindersEnabled, thresholdMonths,
      whatsappTemplateName: reminderTemplateName || null,
      whatsappTemplateLanguage: reminderTemplateLanguage || null,
    }, { accessToken, branchId: activeBranchId }),
    onSuccess: async () => {
      setFeedback("Unpicked-order reminder settings saved.");
      await queryClient.invalidateQueries({ queryKey: ["communications", "reminder-config"] });
      await queryClient.invalidateQueries({ queryKey: ["communications", "unpicked-orders"] });
    },
  });
  const retryDeliveryMutation = useMutation({
    mutationFn: (id: string) => retryCommunicationDelivery(id, { accessToken, branchId: activeBranchId }),
    onSuccess: async (result) => {
      setFeedback(result.status === "SENT"
        ? "WhatsApp retry submitted successfully."
        : result.status === "FAILED"
          ? "WhatsApp retry failed. Check the delivery error details."
          : "This WhatsApp delivery already has a retry attempt.");
      await queryClient.invalidateQueries({ queryKey: ["communications", "deliveries"] });
    },
    onError: (error) => setFeedback(error instanceof Error ? error.message : "Unable to retry this WhatsApp delivery."),
  });
  const reminderMutation = useMutation({
    mutationFn: () => sendUnpickedReminders({ orderIds: selectedOrderIds, channels: reminderChannels, message: reminderMessage.trim() }, { accessToken, branchId: activeBranchId }),
    onSuccess: async (result) => {
      setFeedback(`Reminder processed for ${result.orderCount} orders. ${result.results.filter((item) => item.status === "SENT").length} deliveries sent; ${result.results.filter((item) => item.status === "FAILED").length} failed.`);
      setSelectedOrderIds([]);
      await queryClient.invalidateQueries({ queryKey: ["communications", "deliveries"] });
    },
    onError: (error) => setFeedback(error instanceof Error ? error.message : "Unable to send reminders."),
  });

  function toggleChannel(value: CommunicationChannel, current: CommunicationChannel[], set: (next: CommunicationChannel[]) => void) {
    set(current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  }
  function loadRule(rule: NonNullable<typeof rulesQuery.data>["data"][number]) {
    setStatus(rule.status); setRuleEnabled(rule.enabled); setRuleChannel(rule.channel);
    setWhatsappTemplate(rule.whatsappMessage ?? "");
    setWhatsappTemplateName(rule.whatsappTemplateName ?? "");
    setWhatsappTemplateLanguage(rule.whatsappTemplateLanguage ?? "");
    setEmailSubject(rule.emailSubject ?? ""); setEmailTemplate(rule.emailMessage ?? "");
  }

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "1.25rem" }}>
      <WhatsAppConnectionPanel />
      <WhatsAppInboxPanel />
      <header style={{ marginBottom: "1.5rem" }}>
        <p style={{ color: "#0f766e", fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" }}>Customer engagement</p>
        <h1>Announcements & Notifications</h1>
        <p>Reach customers through WhatsApp and email, automate order updates, and follow up on uncollected laundry.</p>
      </header>
      {feedback && <p role="status" style={{ padding: "0.8rem 1rem", borderRadius: 10, background: "#ecfdf5", color: "#065f46" }}>{feedback}</p>}

      <section style={{ padding: "1.25rem", border: "1px solid #d8dee8", borderRadius: 16, marginBottom: 18 }}>
        <h2>Compose an announcement</h2>
        <p>Send a company-wide message or select individual customers. Delivery results are recorded for follow-up.</p>
        <form onSubmit={(event) => { event.preventDefault(); announcementMutation.mutate(); }}>
          <label>Announcement title<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={180} required /></label>
          <label>Message<textarea value={announcementMessage} onChange={(event) => setAnnouncementMessage(event.target.value)} rows={4} maxLength={announcementChannels.includes("WHATSAPP") ? 1024 : 4000} required /></label>
          {announcementChannels.includes("WHATSAPP") && (
            <>
              <label>Approved WhatsApp MARKETING template
                <select value={announcementTemplateName && announcementTemplateLanguage ? `${announcementTemplateName}|${announcementTemplateLanguage}` : ""} onChange={(event) => {
                  const selected = approvedTemplatesQuery.data?.data.find((item) => item.category === "MARKETING" && `${item.name}|${item.language}` === event.target.value);
                  setAnnouncementTemplateName(selected?.name ?? "");
                  setAnnouncementTemplateLanguage(selected?.language ?? "");
                }} required>
                  <option value="">Choose an approved marketing template</option>
                  {(approvedTemplatesQuery.data?.data ?? []).filter((template) => template.category === "MARKETING" && template.bodyVariableCount === 3).map((template) => (
                    <option key={template.id} value={`${template.name}|${template.language}`}>
                      {template.name} · {template.language} · {template.bodyVariableCount} variable(s)
                    </option>
                  ))}
                </select>
              </label>
              <small style={{ display: "block", color: "#64748b", marginTop: 4 }}>
                Marketing template BODY variables use this order: {"{{1}}"} customer name, {"{{2}}"} company name, {"{{3}}"} your announcement message. Only approved templates are available.
              </small>
            </>
          )}
          <label>Recipients<select value={audience} onChange={(event) => setAudience(event.target.value as typeof audience)}><option value="ALL_CUSTOMERS">All active customers</option><option value="SELECTED_CUSTOMERS">Selected customers</option><option value="CUSTOMER_GROUP">Customer group</option></select></label>
          {audience === "SELECTED_CUSTOMERS" && (
            <>
            <div style={{ maxHeight: 220, overflow: "auto", border: "1px solid #d8dee8", borderRadius: 10, padding: 10 }}>
              {(customersQuery.data?.data ?? []).map((customer) => <label key={customer.id} style={{ display: "block", padding: "4px 0" }}>
                <input type="checkbox" checked={customerIds.includes(customer.id)} onChange={(event) => setCustomerIds((current) => event.target.checked ? [...current, customer.id] : current.filter((id) => id !== customer.id))} />
                {customer.name} · {customer.phone}
              </label>)}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, paddingTop: 8 }}>
              <small>Page {customersQuery.data?.pagination.page ?? customerPage} of {customersQuery.data?.pagination.totalPages ?? 1} · {customersQuery.data?.pagination.total ?? 0} active customers</small>
              <span>
                <button type="button" disabled={customerPage <= 1} onClick={() => setCustomerPage((page) => Math.max(1, page - 1))}>Previous</button>
                <button type="button" disabled={customerPage >= (customersQuery.data?.pagination.totalPages ?? 1)} onClick={() => setCustomerPage((page) => page + 1)}>Next</button>
              </span>
            </div>
            </>
          )}
          {audience === "CUSTOMER_GROUP" && (
            <label>Customer group<select value={groupId} onChange={(event) => setGroupId(event.target.value)} required>
              <option value="">Choose a group</option>
              {(groupsQuery.data?.data ?? []).map((group) => <option key={group.id} value={group.id}>{group.name} ({group._count.members})</option>)}
            </select></label>
          )}
          <div><strong>Sending channels</strong>
            <label><input type="checkbox" checked={announcementChannels.includes("WHATSAPP")} onChange={() => toggleChannel("WHATSAPP", announcementChannels, setAnnouncementChannels)} /> WhatsApp</label>
            <label><input type="checkbox" checked={announcementChannels.includes("EMAIL")} onChange={() => toggleChannel("EMAIL", announcementChannels, setAnnouncementChannels)} /> Email</label>
          </div>
          <button type="submit" disabled={announcementMutation.isPending || !title.trim() || !announcementMessage.trim() || !announcementChannels.length || (audience === "SELECTED_CUSTOMERS" && !customerIds.length) || (audience === "CUSTOMER_GROUP" && !groupId) || (announcementChannels.includes("WHATSAPP") && (!announcementTemplateName || !announcementTemplateLanguage))}>{announcementMutation.isPending ? "Sending..." : "Send announcement"}</button>
        </form>
      </section>

      <section style={{ padding: "1.25rem", border: "1px solid #d8dee8", borderRadius: 16, marginBottom: 18 }}>
        <h2>Automatic order-status messages</h2>
        <p>Choose which order statuses trigger a customer message. Use template fields: {"{{customerName}}"}, {"{{orderNumber}}"}, {"{{companyName}}"}, {"{{status}}"}.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
          <label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}>{STATUSES.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></label>
          <label>Channel<select value={ruleChannel} onChange={(event) => setRuleChannel(event.target.value as typeof ruleChannel)}><option value="WHATSAPP">WhatsApp</option><option value="EMAIL">Email</option><option value="BOTH">WhatsApp and email</option></select></label>
          <label><input type="checkbox" checked={ruleEnabled} onChange={(event) => setRuleEnabled(event.target.checked)} /> Enable this notification</label>
        </div>
        <label>WhatsApp message<textarea rows={3} value={whatsappTemplate} onChange={(event) => setWhatsappTemplate(event.target.value)} /></label>
        <label>Approved WhatsApp template fallback (outside the 24-hour window)
          <select value={whatsappTemplateName && whatsappTemplateLanguage ? `${whatsappTemplateName}|${whatsappTemplateLanguage}` : ""} onChange={(event) => {
            const selected = approvedTemplatesQuery.data?.data.find((item) => `${item.name}|${item.language}` === event.target.value);
            setWhatsappTemplateName(selected?.name ?? "");
            setWhatsappTemplateLanguage(selected?.language ?? "");
          }}>
            <option value="">No approved template fallback</option>
            {(approvedTemplatesQuery.data?.data ?? []).filter((template) => template.category === "UTILITY" && template.bodyVariableCount <= 4).map((template) => (
              <option key={template.id} value={`${template.name}|${template.language}`}>
                {template.name} · {template.language} · {template.bodyVariableCount} variable(s)
              </option>
            ))}
          </select>
        </label>
        <small style={{ display: "block", color: "#64748b", marginTop: 4 }}>
          Template BODY variables are filled in this order: {"{{1}}"} customer name, {"{{2}}"} order number, {"{{3}}"} order status, {"{{4}}"} company name. Use the matching order in the approved Meta template. Only approved UTILITY templates are offered. Templates are used when the free-form 24-hour window has closed.
        </small>
        <label>Email subject<input value={emailSubject} onChange={(event) => setEmailSubject(event.target.value)} /></label>
        <label>Email message<textarea rows={3} value={emailTemplate} onChange={(event) => setEmailTemplate(event.target.value)} /></label>
        <button type="button" disabled={ruleMutation.isPending} onClick={() => ruleMutation.mutate()}>Save status notification</button>
        <h3>Configured rules</h3>
        {(rulesQuery.data?.data ?? []).map((rule) => <div key={rule.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: 8, borderBottom: "1px solid #e5e7eb" }}>
          <span><strong>{rule.status.replaceAll("_", " ")}</strong> · {rule.channel} · {rule.enabled ? "Enabled" : "Disabled"}</span>
          <span><button type="button" onClick={() => loadRule(rule)}>Edit</button> <button type="button" disabled={removeRuleMutation.isPending} onClick={() => removeRuleMutation.mutate(rule.id)}>Remove</button></span>
        </div>)}
      </section>

      <section style={{ padding: "1.25rem", border: "1px solid #d8dee8", borderRadius: 16, marginBottom: 18 }}>
        <h2>Unpicked orders & customer reminders</h2>
        {!activeBranchId && <p role="status">Select an active branch from the top bar to view and remind customers about unpicked orders.</p>}
        <p>Find orders that have remained ready for pickup beyond your selected age threshold.</p>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "end", gap: 12 }}>
          <label>Age threshold (months)<input type="number" min="1" max="36" value={thresholdMonths} onChange={(event) => setThresholdMonths(Number(event.target.value))} /></label>
          <label><input type="checkbox" checked={remindersEnabled} onChange={(event) => setRemindersEnabled(event.target.checked)} /> Enable reminder section</label>
          <button type="button" disabled={!activeBranchId || configMutation.isPending || thresholdMonths < 1 || thresholdMonths > 36} onClick={() => configMutation.mutate()}>Save reminder settings</button>
        </div>
        {reminderConfigQuery.data && <p>Current setting: {reminderConfigQuery.data.enabled ? "Enabled" : "Disabled"} · {reminderConfigQuery.data.thresholdMonths} months</p>}
        <div style={{ maxHeight: 260, overflow: "auto", margin: "1rem 0" }}>
          {(unpickedQuery.data?.data ?? []).map((order) => <label key={order.id} style={{ display: "block", padding: 8, borderBottom: "1px solid #e5e7eb" }}>
            <input type="checkbox" checked={selectedOrderIds.includes(order.id)} onChange={(event) => setSelectedOrderIds((current) => event.target.checked ? [...current, order.id] : current.filter((id) => id !== order.id))} />
            <strong>#{order.orderNumber}</strong> · {order.customer.name} · {order.branch.name} · {money(order.orderTotal)} · {new Date(order.readyAt ?? order.createdAt).toLocaleDateString("en-NG")}
          </label>)}
          {(unpickedQuery.data?.data ?? []).length === 0 && <p>No unpicked orders match the current threshold.</p>}
        </div>
        <label>Reminder message<textarea rows={3} value={reminderMessage} onChange={(event) => setReminderMessage(event.target.value)} /></label>
        <label>Approved WhatsApp template fallback (outside the 24-hour window)
          <select value={reminderTemplateName && reminderTemplateLanguage ? `${reminderTemplateName}|${reminderTemplateLanguage}` : ""} onChange={(event) => {
            const selected = approvedTemplatesQuery.data?.data.find((item) => item.category === "UTILITY" && item.bodyVariableCount <= 4 && `${item.name}|${item.language}` === event.target.value);
            setReminderTemplateName(selected?.name ?? "");
            setReminderTemplateLanguage(selected?.language ?? "");
          }}>
            <option value="">No approved template fallback</option>
            {(approvedTemplatesQuery.data?.data ?? []).filter((template) => template.category === "UTILITY" && template.bodyVariableCount <= 4).map((template) => (
              <option key={template.id} value={`${template.name}|${template.language}`}>
                {template.name} · {template.language} · {template.bodyVariableCount} variable(s)
              </option>
            ))}
          </select>
        </label>
        <small style={{ display: "block", color: "#64748b", marginTop: 4 }}>
          For approved UTILITY templates, BODY variables use the same order: customer name, order number, order status, company name.
        </small>
        <label><input type="checkbox" checked={reminderChannels.includes("WHATSAPP")} onChange={() => toggleChannel("WHATSAPP", reminderChannels, setReminderChannels)} /> WhatsApp</label>
        <label><input type="checkbox" checked={reminderChannels.includes("EMAIL")} onChange={() => toggleChannel("EMAIL", reminderChannels, setReminderChannels)} /> Email</label>
        <button type="button" disabled={!activeBranchId || reminderMutation.isPending || !selectedOrderIds.length || !reminderChannels.length || !reminderMessage.trim() || !remindersEnabled} onClick={() => reminderMutation.mutate()}>{reminderMutation.isPending ? "Sending reminders..." : `Send reminders to ${selectedOrderIds.length} selected orders`}</button>
      </section>

      <section style={{ padding: "1.25rem", border: "1px solid #d8dee8", borderRadius: 16 }}>
        <h2>Delivery history</h2>
        <p>Most recent 200 communication attempts for the selected branch. Business-wide announcement deliveries remain visible across branches.</p>
        {!activeBranchId && <p role="status">Select an active branch to view delivery history.</p>}
        {deliveriesQuery.isLoading && <p>Loading delivery history...</p>}
        {(deliveriesQuery.data?.data ?? []).map((delivery) => <div key={delivery.id} style={{ display: "grid", gridTemplateColumns: "minmax(120px,1fr) minmax(100px,1fr) minmax(90px,auto)", gap: 8, padding: 9, borderBottom: "1px solid #e5e7eb" }}>
          <span><strong>{delivery.customer.name}</strong><small style={{ display: "block" }}>{delivery.messageType.replaceAll("_", " ")}</small></span>
          <span>{delivery.channel} · {delivery.status}<small style={{ display: "block" }}>{new Date(delivery.createdAt).toLocaleString("en-NG")}</small></span>
          <span>{delivery.order?.orderNumber ? `Order #${delivery.order.orderNumber}` : delivery.campaign?.title ?? "—"}</span>
          {delivery.retryAttempt > 0 && <small style={{ gridColumn: "1 / -1", color: "#64748b" }}>Retry attempt {delivery.retryAttempt}</small>}
          {delivery.errorMessage && <small role="alert" style={{ gridColumn: "1 / -1", color: "#b91c1c" }}>{delivery.errorMessage}</small>}
          {delivery.retryAvailable && <span style={{ gridColumn: "1 / -1" }}>
            <button type="button" disabled={retryDeliveryMutation.isPending} onClick={() => retryDeliveryMutation.mutate(delivery.id)}>
              {retryDeliveryMutation.isPending ? "Retrying..." : "Retry WhatsApp delivery"}
            </button>
          </span>}
        </div>)}
      </section>
    </main>
  );
}
