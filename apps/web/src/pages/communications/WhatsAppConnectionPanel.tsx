import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  completeWhatsAppConnection,
  disconnectWhatsAppConnection,
  getWhatsAppConnection,
  saveWhatsAppReceiptTemplate,
} from "../../lib/communications-api.js";
import { getApprovedWhatsAppTemplates } from "../../lib/whatsapp-inbox-api.js";
import { useAuthStore } from "../../state/auth-store.js";

declare global {
  interface Window {
    FB?: {
      init: (options: { appId: string; cookie: boolean; xfbml: boolean; version: string }) => void;
      login: (callback: (response: { authResponse?: { code?: string }; status?: string }) => void, options: Record<string, unknown>) => void;
    };
    fbAsyncInit?: () => void;
  }
}

type SignupAsset = { wabaId: string; phoneNumberId: string };

export function WhatsAppConnectionPanel() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const businessId = useAuthStore((state) => state.user?.businessId);
  const queryClient = useQueryClient();
  const [sdkReady, setSdkReady] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [receiptTemplateSelection, setReceiptTemplateSelection] = useState("");
  const codeRef = useRef<string | null>(null);
  const assetRef = useRef<SignupAsset | null>(null);
  const submittedRef = useRef(false);

  const connectionQuery = useQuery({
    queryKey: ["whatsapp", "connection", businessId],
    queryFn: () => getWhatsAppConnection({ accessToken }),
    enabled: Boolean(accessToken && businessId),
  });

  const approvedTemplatesQuery = useQuery({
    queryKey: ["whatsapp", "templates", businessId],
    queryFn: () => getApprovedWhatsAppTemplates(accessToken),
    enabled: Boolean(accessToken && businessId && connectionQuery.data?.connection?.status === "CONNECTED"),
  });

  useEffect(() => {
    codeRef.current = null;
    assetRef.current = null;
    submittedRef.current = false;
    setSdkReady(false);
    setFeedback("");
    setReceiptTemplateSelection("");
  }, [businessId]);

  useEffect(() => {
    const connection = connectionQuery.data?.connection;
    setReceiptTemplateSelection(
      connection?.receiptTemplateName && connection.receiptTemplateLanguage
        ? `${connection.receiptTemplateName}|${connection.receiptTemplateLanguage}`
        : "",
    );
  }, [businessId, connectionQuery.data?.connection?.receiptTemplateName, connectionQuery.data?.connection?.receiptTemplateLanguage]);

  const receiptTemplateMutation = useMutation({
    mutationFn: () => {
      const selected = approvedTemplatesQuery.data?.data.find((template) =>
        `${template.name}|${template.language}` === receiptTemplateSelection,
      );
      return saveWhatsAppReceiptTemplate({
        templateName: selected?.name ?? null,
        language: selected?.language ?? null,
      }, { accessToken });
    },
    onSuccess: async () => {
      setFeedback("WhatsApp receipt template settings saved.");
      await queryClient.invalidateQueries({ queryKey: ["whatsapp", "connection", businessId] });
    },
    onError: (error) => setFeedback(error instanceof Error ? error.message : "Unable to save the receipt template."),
  });

  const connectMutation = useMutation({
    mutationFn: (input: { code: string; wabaId: string; phoneNumberId: string }) =>
      completeWhatsAppConnection(input, { accessToken }),
    onSuccess: async ({ connection }) => {
      setFeedback(`WhatsApp connected: ${connection.displayPhoneNumber ?? connection.phoneNumberId}`);
      codeRef.current = null;
      assetRef.current = null;
      submittedRef.current = false;
      await queryClient.invalidateQueries({ queryKey: ["whatsapp", "connection", businessId] });
      await queryClient.invalidateQueries({ queryKey: ["whatsapp", "templates", businessId] });
      await queryClient.invalidateQueries({ queryKey: ["whatsapp", "approved-templates", businessId] });
    },
    onError: (error) => {
      submittedRef.current = false;
      setFeedback(error instanceof Error ? error.message : "Unable to connect this WhatsApp account.");
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: () => disconnectWhatsAppConnection({ accessToken }),
    onSuccess: async () => {
      setFeedback("WhatsApp account disconnected from this business.");
      await queryClient.invalidateQueries({ queryKey: ["whatsapp", "connection", businessId] });
      await queryClient.invalidateQueries({ queryKey: ["whatsapp", "templates", businessId] });
      await queryClient.invalidateQueries({ queryKey: ["whatsapp", "approved-templates", businessId] });
    },
    onError: (error) => setFeedback(error instanceof Error ? error.message : "Unable to disconnect WhatsApp."),
  });

  const tryCompleteSignup = useCallback(() => {
    if (!codeRef.current || !assetRef.current || submittedRef.current) return;
    submittedRef.current = true;
    connectMutation.mutate({
      code: codeRef.current,
      wabaId: assetRef.current.wabaId,
      phoneNumberId: assetRef.current.phoneNumberId,
    });
  }, [connectMutation]);

  const signupConfig = connectionQuery.data;
  useEffect(() => {
    if (!signupConfig?.configured || !signupConfig.appId || !signupConfig.apiVersion) return;
    window.fbAsyncInit = () => {
      window.FB?.init({
        appId: signupConfig.appId!,
        cookie: true,
        xfbml: false,
        version: signupConfig.apiVersion!,
      });
      setSdkReady(true);
    };
    if (window.FB) {
      window.fbAsyncInit();
      return;
    }
    if (!document.getElementById("facebook-jssdk")) {
      const script = document.createElement("script");
      script.id = "facebook-jssdk";
      script.src = "https://connect.facebook.net/en_US/sdk.js";
      script.async = true;
      script.defer = true;
      document.body.appendChild(script);
    }
  }, [businessId, signupConfig?.configured, signupConfig?.appId, signupConfig?.apiVersion]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      let originHost = "";
      try {
        originHost = new URL(event.origin).hostname;
      } catch {
        return;
      }
      if (!(originHost === "facebook.com" || originHost.endsWith(".facebook.com")) || typeof event.data !== "string") return;
      let message: { type?: string; event?: string; data?: { waba_id?: string; phone_number_id?: string } };
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.type !== "WA_EMBEDDED_SIGNUP") return;
      if (message.event === "FINISH" && message.data?.waba_id && message.data?.phone_number_id) {
        assetRef.current = { wabaId: message.data.waba_id, phoneNumberId: message.data.phone_number_id };
        tryCompleteSignup();
      } else if (message.event === "CANCEL" || message.event === "ERROR") {
        setFeedback("WhatsApp setup was not completed. You can safely try again.");
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [tryCompleteSignup]);

  function launchSignup() {
    if (!window.FB || !signupConfig?.configurationId) return;
    codeRef.current = null;
    assetRef.current = null;
    submittedRef.current = false;
    setFeedback("Complete the secure WhatsApp setup in the Meta window.");
    window.FB.login((response) => {
      const code = response.authResponse?.code;
      if (!code) {
        setFeedback("Meta did not return an authorization code. Please try again.");
        return;
      }
      codeRef.current = code;
      tryCompleteSignup();
    }, {
      config_id: signupConfig.configurationId,
      response_type: "code",
      override_default_response_type: true,
      extras: { setup: {} },
    });
  }

  const connection = signupConfig?.connection;
  return (
    <section style={{ border: "1px solid #d9e3ec", borderRadius: 18, padding: "1.2rem", marginBottom: 20, background: "linear-gradient(135deg,#f0fdfa 0%,#ffffff 58%,#eff6ff 100%)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div style={{ maxWidth: 720 }}>
          <p style={{ color: "#0f766e", fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", fontSize: 12, margin: 0 }}>WhatsApp Business connection</p>
          <h2 style={{ margin: "6px 0" }}>Connect your business number</h2>
          <p style={{ margin: 0, color: "#475569" }}>Connect this laundry business’s own WhatsApp Business Account securely through Meta. Messages will be sent using this business’s number, not a shared LaundryAngel number.</p>
        </div>
        <span style={{ borderRadius: 999, padding: "7px 12px", fontSize: 12, fontWeight: 800, color: connection?.status === "CONNECTED" ? "#047857" : "#64748b", background: connection?.status === "CONNECTED" ? "#d1fae5" : "#e2e8f0" }}>
          {connection?.status === "CONNECTED" ? "CONNECTED" : "NOT CONNECTED"}
        </span>
      </div>
      {connection ? (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap", marginTop: 16, padding: 14, borderRadius: 12, background: "#ffffff", border: "1px solid #dbeafe" }}>
          <div>
            <strong>{connection.displayPhoneNumber ?? connection.phoneNumberId}</strong>
            <p style={{ margin: "3px 0", color: "#64748b", fontSize: 13 }}>{connection.verifiedName ?? "WhatsApp Business"} · WABA {connection.wabaId}</p>
            <small style={{ color: "#64748b", display: "block" }}>Connected {new Date(connection.connectedAt).toLocaleDateString("en-NG")}</small>
            <small style={{ color: "#64748b", display: "block" }}>
              Last Meta verification: {connection.lastVerifiedAt ? new Date(connection.lastVerifiedAt).toLocaleString("en-NG") : "Not yet verified"}
            </small>
            {connection.tokenExpiresAt ? (
              <small style={{ color: new Date(connection.tokenExpiresAt).getTime() <= Date.now() ? "#b91c1c" : "#64748b", display: "block" }}>
                Access token {new Date(connection.tokenExpiresAt).getTime() <= Date.now() ? "expired" : "expires"} {new Date(connection.tokenExpiresAt).toLocaleString("en-NG")}
              </small>
            ) : null}
            {connection.lastError ? (
              <p role="alert" style={{ color: "#b91c1c", margin: "8px 0 0", fontSize: 13 }}>
                Last connection error: {connection.lastError}
              </p>
            ) : null}
          </div>
          <button type="button" onClick={() => disconnectMutation.mutate()} disabled={disconnectMutation.isPending} style={{ border: "1px solid #fecaca", color: "#b91c1c", background: "#fff", borderRadius: 10, padding: "9px 13px", fontWeight: 700 }}>
            {disconnectMutation.isPending ? "Disconnecting…" : "Disconnect number"}
          </button>
        </div>
      ) : (
        <div style={{ marginTop: 16 }}>
          <button type="button" onClick={launchSignup} disabled={!signupConfig?.configured || !sdkReady || connectMutation.isPending} style={{ border: 0, borderRadius: 11, padding: "11px 17px", background: "#0f766e", color: "#fff", fontWeight: 800, cursor: "pointer", opacity: !signupConfig?.configured || !sdkReady ? .6 : 1 }}>
            {connectMutation.isPending ? "Connecting…" : !signupConfig?.configured ? "Platform setup required" : sdkReady ? "Connect with Meta" : "Loading secure connection…"}
          </button>
          {!signupConfig?.configured && (
            <div role="status" style={{ marginTop: 12, padding: 14, borderRadius: 11, background: "#fff7ed", border: "1px solid #fed7aa", color: "#7c2d12" }}>
              <strong>WhatsApp connection is waiting for platform setup.</strong>
              <p style={{ margin: "6px 0", fontSize: 13 }}>A platform administrator must configure these server-side settings before a business can connect its own WhatsApp number:</p>
              <ul style={{ margin: "6px 0 0", paddingLeft: 20, fontSize: 13 }}>
                {(signupConfig?.missingConfiguration ?? ["WHATSAPP_API_VERSION", "WHATSAPP_APP_ID", "WHATSAPP_APP_SECRET", "WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID", "WHATSAPP_TOKEN_ENCRYPTION_KEY", "WHATSAPP_VERIFY_TOKEN"]).map((setting) => <li key={setting}><code>{setting}</code></li>)}
              </ul>
              <p style={{ margin: "8px 0 0", fontSize: 12 }}>Secret values remain on the API server and are never shown here. This is a platform configuration requirement, not a setting the laundry business can fix from this screen.</p>
            </div>
          )}
        </div>
      )}
      {connection ? (
        <div style={{ marginTop: 14, padding: 14, border: "1px solid #dbeafe", borderRadius: 12, background: "#fff" }}>
          <h3 style={{ margin: "0 0 6px" }}>Receipt delivery outside the 24-hour reply window</h3>
          <p style={{ margin: "0 0 10px", color: "#64748b", fontSize: 13 }}>
            Choose an approved UTILITY template with an IMAGE header and four body variables. LaundryAngel will attach the actual receipt image and fill the variables in this order: customer name, invoice number, total amount, and balance due.
          </p>
          <label style={{ display: "block" }}>
            Approved receipt template
            <select
              value={receiptTemplateSelection}
              onChange={(event) => setReceiptTemplateSelection(event.target.value)}
              style={{ display: "block", width: "100%", marginTop: 6, padding: 9 }}
            >
              <option value="">Choose a receipt template</option>
              {(approvedTemplatesQuery.data?.data ?? [])
                .filter((template) => template.category === "UTILITY" && template.headerFormat === "IMAGE" && template.bodyVariableCount === 4)
                .map((template) => (
                  <option key={template.id} value={`${template.name}|${template.language}`}>
                    {template.name} · {template.language}
                  </option>
                ))}
            </select>
          </label>
          {approvedTemplatesQuery.isLoading && <small>Loading approved templates…</small>}
          {approvedTemplatesQuery.isError && <p role="alert">Unable to load approved templates from Meta. Check the business connection and try again.</p>}
          {!receiptTemplateSelection && <small style={{ display: "block", color: "#b45309", marginTop: 6 }}>No receipt template is configured. WhatsApp receipts can only be sent within the 24-hour reply window until one is selected.</small>}
          <button
            type="button"
            disabled={receiptTemplateMutation.isPending || approvedTemplatesQuery.isLoading || !receiptTemplateSelection}
            onClick={() => receiptTemplateMutation.mutate()}
            style={{ marginTop: 10, border: 0, borderRadius: 9, padding: "9px 14px", background: "#0f766e", color: "#fff", fontWeight: 700 }}
          >
            {receiptTemplateMutation.isPending ? "Saving…" : "Save receipt template"}
          </button>
        </div>
      ) : null}
      {feedback && <p role="status" style={{ marginBottom: 0, marginTop: 12, color: "#334155", fontSize: 13 }}>{feedback}</p>}
    </section>
  );
}
