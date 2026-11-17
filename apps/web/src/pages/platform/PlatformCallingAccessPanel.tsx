import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { getPlatformCallingAccess, updatePlatformCallingGlobal, updatePlatformCallingGrants } from "../../lib/platform-api.js";

export function PlatformCallingAccessPanel({ accessToken }: { accessToken: string | null }) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const query = useQuery({ queryKey: ["platform", "calling-access"], queryFn: () => getPlatformCallingAccess(accessToken), enabled: Boolean(accessToken), refetchInterval: 30_000 });
  const globalMutation = useMutation({
    mutationFn: (input: { enabled?: boolean; grantNewBusinesses?: boolean }) => updatePlatformCallingGlobal({ enabled: input.enabled ?? query.data?.globallyEnabled ?? false, ...(input.grantNewBusinesses !== undefined ? { grantNewBusinesses: input.grantNewBusinesses } : {}) }, accessToken),
    onSuccess: async () => { setFeedback("Calling platform settings saved."); await query.refetch(); },
    onError: (error) => setFeedback(error instanceof Error ? error.message : "Unable to update calling settings."),
  });
  const grantsMutation = useMutation({
    mutationFn: updatePlatformCallingGrants.bind(null, undefined as never),
  });
  const grant = async (mode: "ALL" | "SELECTED", granted: boolean) => {
    try {
      setFeedback(null);
      const result = await updatePlatformCallingGrants({ mode, granted, ...(mode === "SELECTED" ? { businessIds: selectedIds } : {}) }, accessToken);
      setFeedback(`${granted ? "Granted" : "Revoked"} calling access for ${result.affectedCount} business(es).`);
      setSelectedIds([]);
      await query.refetch();
    } catch (error) { setFeedback(error instanceof Error ? error.message : "Unable to update business access."); }
  };
  const businesses = query.data?.businesses ?? [];
  const grantedCount = useMemo(() => businesses.filter((business) => business.callingAccess.granted).length, [businesses]);
  const toggleSelected = (id: string, checked: boolean) => setSelectedIds((current) => checked ? [...new Set([...current, id])] : current.filter((value) => value !== id));

  return <section className="platform-panel platform-control-panel platform-calling-panel" id="platform-calling-access">
    <div className="platform-panel-header"><div><div className="platform-eyebrow">COMMUNICATION INFRASTRUCTURE</div><h2>Audio & video calling access</h2><p>Prepare self-hosted LiveKit calling and control which LaundryAngel businesses may use it.</p></div><span className={`platform-status ${query.data?.globallyEnabled ? "active" : "inactive"}`}>{query.data?.globallyEnabled ? "Globally enabled" : "Globally disabled"}</span></div>
    {query.isLoading ? <p className="platform-feedback">Loading calling access...</p> : query.isError ? <p className="platform-feedback platform-error">Calling access settings could not be loaded.</p> : query.data ? <>
      <div className="platform-calling-summary">
        <article><span>Businesses with access</span><strong>{grantedCount} / {businesses.length}</strong></article>
        <article><span>Media server configuration</span><strong>{query.data.endpointConfigured ? "Configured" : "Not configured"}</strong></article>
        <article><span>Access mode</span><strong>{query.data.grantNewBusinesses ? "Auto-grant new businesses" : "Manual grants"}</strong></article>
      </div>
      {!query.data.endpointConfigured ? <div className="platform-feedback platform-calling-notice">LiveKit server credentials are not configured. You can prepare business access now, but calls remain unavailable until a dedicated self-hosted LiveKit endpoint and server credentials are configured.</div> : null}
      <div className="platform-config-list">
        <div className="platform-config-row"><div><strong>Global calling switch</strong><span>Calls are possible only when the media server is configured, this switch is on, and the business has been granted access.</span></div><button type="button" className="button button-secondary" disabled={!query.data.endpointConfigured || globalMutation.isPending} onClick={() => globalMutation.mutate({ enabled: !query.data!.globallyEnabled })}>{globalMutation.isPending ? "Saving..." : query.data.globallyEnabled ? "Disable globally" : "Enable globally"}</button></div>
        <div className="platform-config-row"><div><strong>Automatically grant new businesses</strong><span>New registrations receive calling access automatically. Existing businesses are not changed by this setting.</span></div><button type="button" className="button button-secondary" disabled={globalMutation.isPending} onClick={() => globalMutation.mutate({ grantNewBusinesses: !query.data!.grantNewBusinesses })}>{query.data.grantNewBusinesses ? "Turn off auto-grant" : "Turn on auto-grant"}</button></div>
      </div>
      <div className="platform-calling-actions"><button type="button" className="button button-secondary" disabled={!businesses.length} onClick={() => { if (window.confirm("Grant calling access to every business on LaundryAngel?")) void grant("ALL", true); }}>Grant every business access</button><button type="button" className="button button-danger" disabled={!grantedCount} onClick={() => { if (window.confirm("Revoke calling access from every business?")) void grant("ALL", false); }}>Revoke all business access</button><button type="button" className="button button-secondary" disabled={!selectedIds.length} onClick={() => void grant("SELECTED", true)}>Grant selected ({selectedIds.length})</button><button type="button" className="button button-danger" disabled={!selectedIds.length} onClick={() => void grant("SELECTED", false)}>Revoke selected ({selectedIds.length})</button></div>
      <div className="platform-calling-business-list"><div className="platform-calling-list-heading"><strong>Business access register</strong><span>{grantedCount} granted · {businesses.length - grantedCount} not granted</span></div>{businesses.map((business) => <div className="platform-config-row" key={business.id}><label className="platform-calling-business"><input type="checkbox" checked={selectedIds.includes(business.id)} onChange={(event) => toggleSelected(business.id, event.target.checked)} /><span><strong>{business.name}</strong><small>{business.slug}{!business.isActive ? " · Inactive" : ""}{business.archivedAt ? " · Archived" : ""}</small></span></label><div className="platform-config-action"><span className={`platform-status ${business.callingAccess.granted ? "active" : "inactive"}`}>{business.callingAccess.granted ? "Access granted" : "Not granted"}</span><button type="button" className="button button-secondary" onClick={() => { setSelectedIds([business.id]); void updatePlatformCallingGrants({ mode: "SELECTED", granted: !business.callingAccess.granted, businessIds: [business.id] }, accessToken).then(() => query.refetch()).then(() => setFeedback(`Calling access ${business.callingAccess.granted ? "revoked" : "granted"} for ${business.name}.`)).catch((error) => setFeedback(error instanceof Error ? error.message : "Unable to update business access.")); }}>{business.callingAccess.granted ? "Revoke" : "Grant access"}</button></div></div>)}</div>
    </> : null}
    {feedback ? <p className="platform-feedback" role="status" aria-live="polite">{feedback}</p> : null}
  </section>;
}
