import { useState } from "react";
import toast from "react-hot-toast";
import { googleAnalyticsApi, type SearchConsoleAnswer } from "./googleAnalytics";
import { HowTo, friendlyError } from "./settingsLayout";
import { PrimaryButton, SecondaryButton, SectionCard, SelectField, StatusBadge } from "./riso/components";

// Settings › General › Google Search Console. The shop's server reads Search Console with its own service account
// (functions/searchConsole.js), like Google Analytics; this card checks the connection and picks the property.
export function SearchConsoleCard() {
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState<SearchConsoleAnswer | null>(null);
  const [pick, setPick] = useState("");
  const [saving, setSaving] = useState(false);

  const verify = async () => {
    setChecking(true); setCheck(null);
    try {
      const answer = await googleAnalyticsApi.searchConsoleStatus();
      setCheck(answer);
      setPick(answer.site || answer.sites?.[0]?.siteUrl || "");
    } catch (err: any) {
      setCheck({ connected: false, error: friendlyError(err, "check the connection") });
    } finally {
      setChecking(false);
    }
  };
  const save = async () => {
    setSaving(true);
    try { await googleAnalyticsApi.saveSearchConsoleSite(pick); toast.success("Search Console property saved"); await verify(); }
    catch (err: any) { toast.error(friendlyError(err, "save the Search Console property")); }
    finally { setSaving(false); }
  };

  const tone = (ok: boolean) => (ok ? "--rp-success" : "--rp-danger");
  const sites = check?.sites || [];

  return (
    <SectionCard title="Google Search Console"
      description="What people searched to find you."
      actions={check && <StatusBadge tone={check.connected ? "success" : "neutral"}>{check.connected ? "Connected" : "Not connected"}</StatusBadge>}>
      <HowTo summary="Setup steps" open={!check?.connected}>
        <ol className="rp-hint" style={{ margin: 0, paddingLeft: 20, lineHeight: 1.6, listStyle: "decimal" }}>
          <li>At <a href="https://search.google.com/search-console" target="_blank" rel="noopener noreferrer">search.google.com/search-console</a> add the shop's address as a property if it isn't there yet (a <strong>Domain</strong> property for lyricalmyricalbooks.com covers every address).</li>
          <li>Press <strong>Check connection</strong> below. It shows the one email to add in Search Console › Settings › <strong>Users and permissions</strong> › Add user, with <strong>Restricted</strong> permission, and whether Google's Search Console API needs switching on.</li>
          <li>Check again. Google's search figures run two to three days behind.</li>
        </ol>
      </HowTo>
      <SecondaryButton disabled={checking} onClick={verify}>{checking ? "Checking…" : "Check connection"}</SecondaryButton>
      {check && (
        <div role="status" className="rp-hint" style={{ margin: "12px 0 0", padding: 12, border: `1px solid var(${tone(check.connected)})`, color: `var(${tone(check.connected)})`, background: `var(${tone(check.connected)}-tint)` }}>
          {check.connected ? <>✓ Connected to <span className="rp-mono">{check.site}</span>.</> : <>✕ {check.error || "Not connected yet."}</>}
          {!check.connected && check.serviceAccount && (
            <div style={{ marginTop: 8, color: "var(--rp-text)" }}>
              Shop's service account (add as a Restricted user): <span className="rp-mono" style={{ userSelect: "all", overflowWrap: "anywhere" }}>{check.serviceAccount}</span>
            </div>
          )}
          {check.code === "api_disabled" && check.enableApiUrl && (
            <div style={{ marginTop: 8 }}><a href={check.enableApiUrl} target="_blank" rel="noopener noreferrer">Switch on the Google Search Console API</a></div>
          )}
        </div>
      )}
      {sites.length > 1 && (
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", marginTop: 12 }}>
          <div style={{ flex: "1 1 260px" }}>
            <SelectField label="Which property is the shop?" value={pick} onChange={e => setPick(e.target.value)}>
              {sites.map(s => <option key={s.siteUrl} value={s.siteUrl}>{s.siteUrl}</option>)}
            </SelectField>
          </div>
          <PrimaryButton disabled={!pick || pick === check?.site || saving} onClick={save}>{saving ? "Saving…" : "Use this property"}</PrimaryButton>
        </div>
      )}
    </SectionCard>
  );
}
