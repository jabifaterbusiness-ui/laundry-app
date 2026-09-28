import { useEffect, useRef, useState } from "react";
import { getBusinessBranding } from "../../lib/businesses-api.js";
import { apiFetch } from "../../lib/api-client.js";
import { useAuthStore } from "../../state/auth-store.js";

export function BusinessSettingsPage() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const activeBranchId = useAuthStore((state) => state.activeBranchId);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [branding, setBranding] = useState<Awaited<ReturnType<typeof getBusinessBranding>> | null>(null);
  const [primary, setPrimary] = useState("#1f7a4d");
  const [accent, setAccent] = useState("#f59e0b");
  const [background, setBackground] = useState("#ffffff");
  const [text, setText] = useState("#111827");
  const [headerStyle, setHeaderStyle] = useState("standard");
  const [agreement, setAgreement] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    if (!accessToken) return;
    const result = await getBusinessBranding({ accessToken }, activeBranchId);
    setBranding(result);
    setPrimary(result.receiptPrimaryColor ?? "#1f7a4d");
    setAccent(result.receiptAccentColor ?? "#f59e0b");
    setBackground(result.receiptBackgroundColor ?? "#ffffff");
    setText(result.receiptTextColor ?? "#111827");
    setHeaderStyle(result.receiptHeaderStyle ?? "standard");
    setAgreement("");
  }

  useEffect(() => {
    void load().catch((error) => {
      setMessage(error instanceof Error ? error.message : "Unable to load business settings.");
    });
  }, [accessToken, activeBranchId]);

  async function save() {
    if (!accessToken) return;
    setSaving(true);
    setMessage("");
    try {
      const result = await apiFetch<typeof branding>("/businesses/branding", {
        method: "PATCH",
        accessToken,
        branchId: activeBranchId,
        body: JSON.stringify({
          receiptPrimaryColor: primary,
          receiptAccentColor: accent,
          receiptBackgroundColor: background,
          receiptTextColor: text,
          receiptHeaderStyle: headerStyle,
          ...(agreement.trim() ? { defaultCustomerAgreement: agreement.trim() } : {}),
        }),
      });
      setBranding(result);
      setMessage("Business branding saved successfully.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save branding.");
    } finally {
      setSaving(false);
    }
  }

  async function uploadLogo(file: File) {
    if (!accessToken) return;

    const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
    const maxBytes = 5 * 1024 * 1024;
    const minDimension = 200;

    if (!allowedTypes.has(file.type)) {
      setMessage("Logo must be a PNG, JPG/JPEG, or WebP image.");
      return;
    }

    if (file.size > maxBytes) {
      setMessage("Logo must be 5 MB or smaller.");
      return;
    }

    const objectUrl = URL.createObjectURL(file);

    try {
      const dimensions = await new Promise<{ width: number; height: number }>(
        (resolve, reject) => {
          const image = new Image();

          image.onload = () => {
            resolve({
              width: image.naturalWidth,
              height: image.naturalHeight,
            });
          };

          image.onerror = () => {
            reject(new Error("Unable to read the selected image."));
          };

          image.src = objectUrl;
        },
      );

      if (
        dimensions.width < minDimension ||
        dimensions.height < minDimension
      ) {
        setMessage("Logo must be at least 200 × 200 pixels.");
        return;
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to validate the selected image.",
      );
      return;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }

    setUploading(true);
    setMessage("");

    try {
      const result = await apiFetch<typeof branding>("/businesses/logo", {
        method: "POST",
        accessToken,
        branchId: activeBranchId,
        headers: { "Content-Type": file.type },
        body: file,
      });
      setBranding(result);
      setMessage("Business logo uploaded successfully.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to upload logo.");
    } finally {
      setUploading(false);
    }
  }

  async function removeLogo() {
    if (!accessToken) return;
    setUploading(true);
    setMessage("");
    try {
      const result = await apiFetch<typeof branding>("/businesses/logo", {
        method: "DELETE",
        accessToken,
        branchId: activeBranchId,
      });
      setBranding(result);
      setMessage("Business logo removed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to remove logo.");
    } finally {
      setUploading(false);
    }
  }

  if (!branding) {
    return <section className="page-card"><h1>Business Settings</h1><p>{message || "Loading business settings…"}</p></section>;
  }

  return (
    <section className="page-card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <h1>Business Settings</h1>
          <p>Manage your business receipt branding and customer-facing settings.</p>
        </div>
      </div>

      {message ? <div role="status" style={{ margin: "16px 0", padding: 12, borderRadius: 8, background: "#f3f4f6" }}>{message}</div> : null}

      <div style={{ display: "grid", gap: 24, maxWidth: 900 }}>
        <div>
          <h2>Business identity</h2>
          <p><strong>{branding.name}</strong></p>
          <p>{branding.phone || "No phone configured"} · {branding.email || "No email configured"}</p>
          <p>{branding.address || "No address configured"}</p>
        </div>

        <div>
          <h2>Logo</h2>
          <p>
            PNG, JPG/JPEG, or WebP • Minimum 200 × 200 px • Recommended 500 × 500 px
            • Maximum 5 MB • Square (1:1) recommended
          </p>
          {branding.logoUrl ? (
            <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
              <img src={branding.logoUrl} alt={`${branding.name} logo`} style={{ maxWidth: 180, maxHeight: 100, objectFit: "contain" }} />
              <button type="button" onClick={() => void removeLogo()} disabled={uploading}>Remove logo</button>
            </div>
          ) : <p>No business logo uploaded.</p>}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-label="Business logo file"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadLogo(file);
              event.currentTarget.value = "";
            }}
          />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? "Uploading…" : "Upload logo"}
          </button>
        </div>

        <div>
          <h2>Receipt appearance</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 16 }}>
            {[
              ["Primary colour", primary, setPrimary],
              ["Accent colour", accent, setAccent],
              ["Background", background, setBackground],
              ["Text", text, setText],
            ].map(([label, value, setter]) => (
              <label key={label as string} style={{ display: "grid", gap: 6 }}>
                {label as string}
                <input
                  type="color"
                  value={value as string}
                  onChange={(event) => (setter as (value: string) => void)(event.target.value)}
                />
                <code>{value as string}</code>
              </label>
            ))}
          </div>

          <label style={{ display: "grid", gap: 6, marginTop: 16, maxWidth: 300 }}>
            Receipt header style
            <select value={headerStyle} onChange={(event) => setHeaderStyle(event.target.value)}>
              <option value="standard">Standard</option>
              <option value="compact">Compact</option>
              <option value="centered">Centered</option>
            </select>
          </label>
        </div>

        <div>
          <h2>Default customer agreement</h2>
          <textarea
            value={agreement}
            onChange={(event) => setAgreement(event.target.value)}
            maxLength={2000}
            rows={5}
            placeholder="Optional agreement text for customer-facing documents."
            style={{ width: "100%", maxWidth: 800 }}
          />
          <p style={{ fontSize: 13 }}>Leave unchanged to preserve the existing agreement.</p>
        </div>

        <div>
          <button type="button" onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save branding settings"}
          </button>
        </div>
      </div>
    </section>
  );
}
