import { useEffect, useState, type ReactNode } from "react";
import { adminApi } from "./api";
import { DestructiveButton, ErrorState, LoadingState, PrimaryButton, SecondaryButton, SectionCard, StatusBadge, TextField, useConfirm } from "./riso/components";
import { friendlyError } from "./settingsLayout";
import { describeDomain, domainActions, recordHostLabel, type DomainCheck, type DomainEntry, type DomainList } from "./customDomains";

// Settings › General › Your web address (plan 2.9): put the shop on the press's own address through Colophon. A shop
// without the platform's domain service shows `fallback` (the older "for your records" field) instead. Plan 5.9: each
// address can be removed (never the main one), and a live one made the main address emails, links and Google use.
export function CustomDomainCard({ fallback }: { fallback: ReactNode }) {
  const [domains, setDomains] = useState<DomainEntry[] | null>(null);
  const [max, setMax] = useState(3);
  const [checks, setChecks] = useState<Record<string, DomainCheck>>({});
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<string | null>("list");
  const [own, setOwn] = useState("");
  const [main, setMain] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [confirm, confirmNode] = useConfirm();

  const takeList = (answer: DomainList) => {
    setDomains(answer.domains || []);
    setMax(answer.max || 3);
    setOwn(answer.own || "");
    setMain(answer.main || answer.own || "");
  };

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
      takeList(answer);
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

  const makeMain = async (name: string) => {
    if (busy) return;
    const back = name === own;
    const ok = await confirm({
      title: back ? `Go back to ${name}?` : `Make ${name} your main address?`,
      message: back
        ? "Emails, links and Google will use the address your shop came with again. Your other addresses keep working."
        : "Emails, links in them and Google will use this address from now on. Your other addresses keep working.",
      confirmLabel: back ? "Use this address" : "Make main",
    });
    if (!ok) return;
    setBusy(`main:${name}`);
    setError(null);
    setNotice(null);
    try {
      takeList(await adminApi.customDomains("makeMain", name));
      setNotice(`${name} is now your main address. It can take a few minutes to show everywhere.`);
    } catch (err: any) {
      setError(friendlyError(err, `make ${name} your main address`));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (name: string) => {
    if (busy) return;
    const ok = await confirm({
      title: `Remove ${name}?`,
      message: "Your shop stops opening at this address, and links to it stop working. Your main address isn't affected. You can add it again later.",
      confirmLabel: "Remove address",
    });
    if (!ok) return;
    setBusy(`remove:${name}`);
    setError(null);
    setNotice(null);
    try {
      takeList(await adminApi.customDomains("remove", name));
      setChecks((c) => { const next = { ...c }; delete next[name]; return next; });
      setNotice(`${name} was removed from your shop.`);
    } catch (err: any) {
      setError(friendlyError(err, `remove ${name}`));
    } finally {
      setBusy(null);
    }
  };

  if (unavailable) return <>{fallback}</>;

  return (
    <SectionCard title="Your web address" description="Open your shop at an address you own. The current one keeps working.">
      <div className="rp-stack" style={{ gap: 16 }}>
        {domains === null && busy === "list" ? (
          <LoadingState label="Loading your web addresses…" />
        ) : domains === null ? (
          <ErrorState title="Couldn't load your web addresses" description={error || undefined} onRetry={load} />
        ) : (
          <>
            {main && (
              <div className="rp-stack" style={{ gap: 4 }} data-domain-main>
                <p style={{ margin: 0 }}>Your main address: <strong style={{ overflowWrap: "anywhere" }}>{main}</strong></p>
                <p className="rp-hint" style={{ margin: 0 }}>Emails, the links in them and Google use your main address.</p>
                {own && main !== own && (
                  <div className="rp-card-actions">
                    <SecondaryButton size="sm" disabled={!!busy} busy={busy === `main:${own}`} onClick={() => makeMain(own)}>Go back to {own}</SecondaryButton>
                  </div>
                )}
              </div>
            )}
            {domains.length === 0 && <p className="rp-hint" style={{ margin: 0 }}>No address of your own yet. Buy one from any domain seller, then add it here.</p>}
            {domains.map((d) => {
              const found = checks[d.name];
              const state = found?.state ?? d.state;
              const info = describeDomain(state);
              const records = found?.records ?? [];
              const actions = domainActions({ ...d, state }, main);
              return (
                <div key={d.name} className="rp-card" style={{ padding: 16, boxShadow: "none" }} data-domain={d.name}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
                    <strong style={{ overflowWrap: "anywhere" }}>{d.name}</strong>
                    <span style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {d.name === main && <StatusBadge tone="info">Main address</StatusBadge>}
                      <StatusBadge tone={info.tone}>{info.label}</StatusBadge>
                    </span>
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
                  {actions.note && <p className="rp-hint" style={{ margin: "8px 0 0" }}>{actions.note}</p>}
                  {(state !== "live" || actions.canMakeMain || actions.canRemove) && <div className="rp-card-actions">
                    {state !== "live" && (
                      <SecondaryButton size="sm" disabled={!!busy} onClick={() => check(d.name)}>{busy === d.name ? "Checking…" : "Check again"}</SecondaryButton>
                    )}
                    {actions.canMakeMain && (
                      <SecondaryButton size="sm" disabled={!!busy} busy={busy === `main:${d.name}`} onClick={() => makeMain(d.name)}>Make main</SecondaryButton>
                    )}
                    {actions.canRemove && (
                      <DestructiveButton size="sm" disabled={!!busy} busy={busy === `remove:${d.name}`} onClick={() => remove(d.name)}>Remove</DestructiveButton>
                    )}
                  </div>}
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
            {notice && <p role="status" style={{ margin: 0 }}>{notice}</p>}
            {error && <p role="alert" style={{ margin: 0, color: "var(--rp-danger)" }}>{error}</p>}
          </>
        )}
      </div>
      {confirmNode}
    </SectionCard>
  );
}
