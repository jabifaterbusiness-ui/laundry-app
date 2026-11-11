import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  completeWhatsAppConnection,
  disconnectWhatsAppConnection,
  getWhatsAppConnection,
} from "../../lib/communications-api.js";
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
  const queryClient = useQueryClient();
  const [sdkReady, setSdkReady] = useState(false);
  const [feedback, setFeedback] = useState("");
  const codeRef = useRef<string | null>(null);
  const assetRef = useRef<SignupAsset | null>(null);
  const submittedRef = useRef(false);

  const connectionQuery = useQuery({
    queryKey: ["whatsapp", "connection"],
    queryFn: () => getWhatsAppConnection({ accessToken }),
    enabled: Boolean(accessToken),
  });

  const connectMutation = useMutation({
    mutationFn: (input: { code: string; wabaId: string; phoneNumberId: string }) =>
      completeWhatsAppConnection(input, { accessToken }),
    onSuccess: async ({ connection }) => {
      setFeedback(`WhatsApp connected: ${connection.displayPhoneNumber ?? connection.phoneNumberId}`);
      codeRef.current = null;
      assetRef.current = null;
      submittedRef.current = false;
      await queryClient.invalidateQueries({ queryKey: ["whatsapp", "connection"] });
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
      await queryClient.invalidateQueries({ queryKey: ["whatsapp", "connection"] });
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
  }, [signupConfig?.configured, signupConfig?.appId, signupConfig?.apiVersion]);

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
            {connectMutation.isPending ? "Connecting…" : sdkReady ? "Connect with Meta" : "Preparing secure connection…"}
          </button>
          {!signupConfig?.configured && <p style={{ color: "#b45309", fontSize: 13, marginBottom: 0 }}>Meta Embedded Signup is not fully configured on the platform yet.</p>}
        </div>
      )}
      {feedback && <p role="status" style={{ marginBottom: 0, marginTop: 12, color: "#334155", fontSize: 13 }}>{feedback}</p>}
    </section>
  );
}
