import { useEffect, useState, type ReactNode } from "react";
import { adminApi } from "./api";
import { ErrorState, LoadingState, PrimaryButton, SecondaryButton, SectionCard, StatusBadge, TextField } from "./riso/components";
import { friendlyError } from "./settingsLayout";
import { describeDomain, recordHostLabel, type DomainCheck, type DomainEntry } from "./customDomains";

// Settings › General › Your web address (plan 2.9): put the shop on the press's own address through Colophon. A shop
// without the platform's domain service shows `fallback` (the older "for your records" field) instead.
export function CustomDomainCard({ fallback }: { fallback: ReactNode }) {
  const [domains, setDomains] = useState<DomainEntry[] | null>(null);
  const [max, setMax] = useState(3);
  const [checks, setChecks] = useState<Record<string, DomainCheck>>({});
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<string | null>("list");

  const check = async (name: string) => {
    setBusy(name);
    setError(null);
    try {
      const found = (await adminApi.customDomains("check", name)) as DomainCheck;
      setChecks((c) => ({ ...c, [name]: found }));
      setDomains((list) => (list || []).map((d) => (d.name === name ? { ...d, state: found.state } : d)));
    } catch (err: any) {
      setError(friendlyError(err, `check ${name}`));
    } finally {
      setBusy(null);
    }
  };

  const load = async () => {
    setBusy("list");
    setError(null);
    try {
      const answer = await adminApi.customDomains("list");
      setDomains(answer.domains || []);
      setMax(answer.max || 3);
      setBusy(null);
      // Fresh DNS records for every address that isn't live yet.
      for (const d of answer.domains || []) if (d.state !== "live") await check(d.name);
    } catch (err: any) {
      if (err?.code === "not_available") setUnavailable(true);
      else setError(friendlyError(err, "load your web addresses"));
      setBusy(null);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const add = async () => {
    const name = draft.trim();
    if (!name || busy) return;
    setBusy("add");
    setError(null);
    try {
      const found = (await adminApi.customDomains("add", name)) as DomainCheck;
      setChecks((c) => ({ ...c, [found.name]: found }));
      setDomains((list) => [...(list || []).filter((d) => d.name !== found.name), { name: found.name, state: found.state }]);
      setDraft("");
    } catch (err: any) {
      setError(friendlyError(err, "add that address"));
    } finally {
      setBusy(null);
    }
  };

  if (unavailable) return <>{fallback}</>;

  return (
    <SectionCard title="Your web address" description="Open your shop at an address you own, like shop.yourpress.com. Your current address keeps working.">
      <div className="rp-stack" style={{ gap: 16 }}>
        {domains === null && busy === "list" ? (
          <LoadingState label="Loading your web addresses…" />
        ) : domains === null ? (
          <ErrorState title="Couldn't load your web addresses" description={error || undefined} onRetry={load} />
        ) : (
          <>
            {domains.length === 0 && <p className="rp-hint" style={{ margin: 0 }}>No address of your own yet. Buy one from any domain seller, then add it here.</p>}
            {domains.map((d) => {
              const found = checks[d.name];
              const info = describeDomain(found?.state ?? d.state);
              const records = found?.records ?? [];
              return (
                <div key={d.name} className="rp-card" style={{ padding: 16, boxShadow: "none" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
                    <strong style={{ overflowWrap: "anywhere" }}>{d.name}</strong>
                    <StatusBadge tone={info.tone}>{info.label}</StatusBadge>
                  </div>
                  <p className="rp-hint" style={{ margin: "8px 0 0" }}>{info.text}</p>
                  {records.length > 0 && (
                    <div style={{ overflowX: "auto", marginTop: 12 }}>
                      <table className="rp-table" aria-label={`DNS records for ${d.name}`}>
                        <thead><tr><th scope="col">Do this</th><th scope="col">Type</th><th scope="col">Name / host</th><th scope="col">Value</th></tr></thead>
                        <tbody>
                          {records.map((r, i) => (
                            <tr key={i}>
                              <td>{r.action === "add" ? "Add" : "Remove"}</td>
                              <td>{r.type}</td>
                              <td style={{ fontFamily: "var(--rp-font-mono)" }}>{recordHostLabel(r.host, d.name)}</td>
                              <td style={{ fontFamily: "var(--rp-font-mono)", overflowWrap: "anywhere" }}>{r.value}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {(found?.state ?? d.state) === "live" && (
                    <p className="rp-hint" style={{ margin: "8px 0 0" }}>
                      {found?.paymentDomain === "failed" ? "Apple Pay and Google Pay will be turned on here at the next check." : "Apple Pay and Google Pay work on this address."}
                    </p>
                  )}
                  {(found?.state ?? d.state) !== "live" && (
                    <div className="rp-card-actions">
                      <SecondaryButton size="sm" disabled={!!busy} onClick={() => check(d.name)}>{busy === d.name ? "Checking…" : "Check again"}</SecondaryButton>
                    </div>
                  )}
                </div>
              );
            })}
            {domains.length < max && (
              <div className="rp-stack" style={{ gap: 8 }}>
                <TextField label="Add an address" placeholder="shop.yourpress.com" spellCheck={false} autoCapitalize="none" value={draft}
                  hint="Use an address you own. You'll add a few records where you bought it."
                  onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
                <div className="rp-card-actions">
                  <PrimaryButton disabled={!draft.trim() || !!busy} onClick={add}>{busy === "add" ? "Adding…" : "Add address"}</PrimaryButton>
                </div>
              </div>
            )}
            {error && <p role="alert" style={{ margin: 0, color: "var(--rp-danger)" }}>{error}</p>}
          </>
        )}
      </div>
    </SectionCard>
  );
}
