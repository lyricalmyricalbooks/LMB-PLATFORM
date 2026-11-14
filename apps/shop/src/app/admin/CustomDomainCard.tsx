import { useEffect, useRef, useState, type ReactNode } from "react";
import { adminApi } from "./api";
import { BrandLogo, isBrandId } from "../components/brand/BrandLogo";
import { DestructiveButton, ErrorState, LoadingState, PrimaryButton, SecondaryButton, SectionCard, StatusBadge, TextField, useConfirm } from "./riso/components";
import { friendlyError } from "./settingsLayout";
import { allowLabel, BUY_DOMAIN_URL, describeEntry, domainActions, domainStages, freeNameOf, guideLineKind, guideLineTitle, guideMailto, moveWarning, RECHECK_MS, type DomainCheck, type DomainEntry, type DomainList } from "./customDomains";
import { copyText } from "./clipboard";

/** The domain seller's own logo on its Connect button, when the brand kit has it (GoDaddy today). */
function sellerLogo(seller: string | null | undefined) {
  const id = (seller || "").toLowerCase().replace(/[^a-z]/g, "");
  return isBrandId(id) ? <BrandLogo id={id} size="sm" /> : null;
}

// Settings › General › Your web address (plan 2.9): put the shop on the press's own address through Colophon. A shop
// without the platform's domain service shows `fallback` (the older "for your records" field) instead. Plan 5.9: each
// address can be removed (never the main one), and a live one made the main address emails, links and Google use.
// Plan 6.15: one Connect step. A domain seller that works with Colophon gets a button for its own sign-in window; any
// other gets a guide in plain words with a Copy button on every line and a mail for the press's web person.
/** `bare` drops the card around it, for a form kit section that already names it (Settings › General, v4). */
export function CustomDomainCard({ fallback, bare }: { fallback: ReactNode; bare?: boolean }) {
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
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
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

  // A live status: while an address isn't working yet the card looks again by itself, quietly (no spinner, no error
  // for a look that failed), only while the page is on screen and nothing else is in hand.
  const live = useRef({ domains, busy });
  live.current = { domains, busy };
  const waiting = (domains || []).some((d) => d.state !== "live");
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(async () => {
      if (live.current.busy || document.visibilityState === "hidden") return;
      for (const d of live.current.domains || []) {
        if (d.state === "live") continue;
        try {
          const found = (await adminApi.customDomains("check", d.name)) as DomainCheck;
          setChecks((c) => ({ ...c, [d.name]: found }));
          setDomains((list) => (list || []).map((e) => (e.name === d.name ? { ...e, state: found.state } : e)));
          if (found.state === "live") setNotice(`${d.name} now opens your shop.`);
        } catch { /* the next look tries again */ }
      }
    }, RECHECK_MS);
    return () => window.clearInterval(timer);
  }, [waiting]);

  const add = async () => {
    const name = draft.trim();
    if (!name || busy) return;
    setBusy("add");
    setError(null);
    try {
      const found = (await adminApi.customDomains("connect", name)) as DomainCheck;
      setChecks((c) => ({ ...c, [found.name]: found }));
      setDomains((list) => [...(list || []).filter((d) => d.name !== found.name), { name: found.name, state: found.state }]);
      setDraft("");
    } catch (err: any) {
      setError(friendlyError(err, "connect that address"));
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

  // The old site goes once the press says yes at the seller, so they're asked first (and told to close the old checkout).
  const allow = async (name: string, url: string) => {
    if (busy || !(await confirm(moveWarning(name)))) return;
    window.location.assign(url);
  };

  // A new name for the free address (after a new press name, say): the one before keeps opening the shop.
  const rename = async (current: string) => {
    const name = freeNameOf(nameDraft);
    if (!name || busy) return;
    setBusy("rename");
    setError(null);
    setNotice(null);
    try {
      takeList(await adminApi.customDomains("renameFree", name));
      setRenaming(false);
      setNameDraft("");
      setNotice(`Setting up your new address. ${current} sends visitors to it once it works.`);
    } catch (err: any) {
      setError(friendlyError(err, "change your free address"));
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
    <CardOrNot bare={bare}>
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
                
                {own && main !== own && (
                  <div className="rp-card-actions">
                    <SecondaryButton size="sm" disabled={!!busy} busy={busy === `main:${own}`} onClick={() => makeMain(own)}>Go back to {own}</SecondaryButton>
                  </div>
                )}
              </div>
            )}
            {domains.map((d) => {
              const found = checks[d.name];
              const state = found?.state ?? d.state;
              const info = describeEntry(d, state);
              // A free address is the platform's to set up: no seller, no lines to copy.
              const guide = state !== "live" && !d.free ? found?.guide : undefined;
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
                  {!d.free && !d.sendsTo && state !== "conflict" && (
                    <ol aria-label={`Progress for ${d.name}`} data-domain-stages style={{ display: "flex", flexWrap: "wrap", gap: 8, listStyle: "none", margin: "12px 0 0", padding: 0 }}>
                      {domainStages(state).map((s, i) => (
                        <li key={s.label} aria-current={s.current ? "step" : undefined} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, border: "1px solid var(--rp-border)", background: s.current ? "var(--rp-surface-2)" : "transparent", fontWeight: s.current ? 600 : 400, opacity: s.done || s.current ? 1 : 0.6 }}>
                          <span aria-hidden="true">{s.done ? "✓" : i + 1}</span>{s.label}{s.done && <span className="rp-sr-only"> (done)</span>}
                        </li>
                      ))}
                    </ol>
                  )}
                  {!d.sendsTo && !(d.free && state === "live") && <p className="rp-hint" style={{ margin: "8px 0 0" }}>{info.text}</p>}
                  {state !== "live" && !d.free && found?.allowUrl && (
                    <div className="rp-stack" style={{ gap: 8, marginTop: 12 }} data-allow>
                      <p style={{ margin: 0 }}>{found.seller ? `${found.seller} will ask you to sign in and say yes. That is all it takes.` : "Your domain seller will ask you to sign in and say yes. That is all it takes."}</p>
                      <div className="rp-card-actions">
                        <PrimaryButton size="sm" disabled={!!busy} onClick={() => void allow(d.name, found.allowUrl!)}>{sellerLogo(found.seller)}{allowLabel(found.seller)}</PrimaryButton>
                      </div>
                    </div>
                  )}
                  {guide && (
                    <details style={{ marginTop: 12 }} open={!found?.allowUrl && !d.sendsTo} data-guide>
                      <summary style={{ cursor: "pointer", fontWeight: 600 }}>{d.sendsTo ? `Lines for ${d.name}, so it works too` : found?.allowUrl ? "Prefer to do it yourself?" : `Connect ${d.name} yourself`}</summary>
                      {/* The partner address is added in the same place as the one above: only its lines are new. */}
                      {!d.sendsTo && <>
                        <p className="rp-hint" style={{ margin: "8px 0 0" }}>Your old site stops showing here once these are in. Your shop's own address keeps working.</p>
                        <ol style={{ margin: "8px 0", paddingLeft: 22, listStyle: "decimal" }}>
                          {guide.steps.map((step, i) => <li key={i} style={{ marginBottom: 4 }}>{step}</li>)}
                        </ol>
                      </>}
                      <div className="rp-stack" style={{ gap: 8, marginTop: 8 }}>
                        {guide.lines.map((line, i) => (
                          <div key={i} className="rp-card" style={{ padding: "10px 12px", boxShadow: "none", display: "grid", gap: 6 }} data-guide-line>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                              <StatusBadge glyph={false} tone={line.action === "add" ? "success" : "warning"}>{guideLineTitle(line)}</StatusBadge>
                              <span className="rp-hint">{guideLineKind(line)}</span>
                            </div>
                            {([["Name", line.name], ["Value", line.value]] as const).map(([label, value]) => (
                              <div key={label} style={{ display: "grid", gridTemplateColumns: "56px minmax(0, 1fr) auto", gap: 8, alignItems: "center" }}>
                                <span className="rp-hint">{label}</span>
                                <span style={{ fontFamily: "var(--rp-font-mono)", overflowWrap: "anywhere" }}>{value}</span>
                                <SecondaryButton size="sm" aria-label={`Copy ${label.toLowerCase()}`} onClick={() => copyText(value, label)}>Copy</SecondaryButton>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                      <div className="rp-card-actions" style={{ marginTop: 8 }}>
                        {guide.openUrl && guide.seller && !d.sendsTo && (
                          <a className="rp-btn rp-btn-primary rp-btn-sm" href={guide.openUrl} target="_blank" rel="noopener noreferrer" data-open-seller style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>{sellerLogo(guide.seller)}Open {guide.seller}</a>
                        )}
                        <a className="rp-btn rp-btn-secondary rp-btn-sm" href={guideMailto(guide)}>Send these to my web person</a>
                      </div>
                    </details>
                  )}
                  {(found?.state ?? d.state) === "live" && !d.free && !d.sendsTo && (
                    <p className="rp-hint" style={{ margin: "8px 0 0" }}>
                      {found?.paymentDomain === "failed" ? "Apple Pay and Google Pay will be turned on here at the next check." : "Apple Pay and Google Pay work on this address."}
                    </p>
                  )}
                  {actions.note && <p className="rp-hint" style={{ margin: "8px 0 0" }}>{actions.note}</p>}
                  {d.free && !d.former && renaming && (
                    <form className="rp-stack" style={{ gap: 8, marginTop: 12 }} data-rename onSubmit={(e) => { e.preventDefault(); void rename(d.name); }}>
                      <TextField label="New name" placeholder="moth-books" spellCheck={false} autoCapitalize="none" value={nameDraft}
                        hint={freeNameOf(nameDraft) ? `${freeNameOf(nameDraft)}.${d.name.slice(d.name.indexOf(".") + 1)}` : "Letters, numbers and dashes."}
                        onChange={(e) => setNameDraft(e.target.value)} />
                      <div className="rp-card-actions">
                        <PrimaryButton type="submit" size="sm" disabled={!freeNameOf(nameDraft) || !!busy} busy={busy === "rename"}>Use this name</PrimaryButton>
                        <SecondaryButton size="sm" disabled={!!busy} onClick={() => { setRenaming(false); setNameDraft(""); }}>Cancel</SecondaryButton>
                      </div>
                    </form>
                  )}
                  {(state === "live" || actions.canMakeMain || actions.canRemove || (d.free && !d.former && !renaming)) && <div className="rp-card-actions">
                    {state === "live" && !d.sendsTo && (
                      <SecondaryButton size="sm" onClick={() => copyText(`https://${d.name}`, "Link")}>Copy link</SecondaryButton>
                    )}
                    {d.free && !d.former && !renaming && (
                      <SecondaryButton size="sm" disabled={!!busy} onClick={() => { setRenaming(true); setError(null); }}>Change name</SecondaryButton>
                    )}
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
            {domains.filter((d) => !d.free).length < max && (
              <div className="rp-stack" style={{ gap: 8 }}>
                <TextField label="Use a domain you own" placeholder="shop.yourpress.com" spellCheck={false} autoCapitalize="none" value={draft}
                  hint="It stays where you bought it, and your email there keeps working."
                  onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
                <div className="rp-card-actions" style={{ alignItems: "center" }}>
                  <PrimaryButton disabled={!draft.trim() || !!busy} onClick={add}>{busy === "add" ? "Connecting…" : "Connect"}</PrimaryButton>
                  {domains.filter((d) => !d.free).length === 0 && (
                    <a href={BUY_DOMAIN_URL} target="_blank" rel="noopener noreferrer" data-buy-domain style={{ display: "inline-flex", gap: 6, alignItems: "center", color: "var(--rp-text)", textDecoration: "underline" }}>No domain yet? Find one at GoDaddy</a>
                  )}
                </div>
              </div>
            )}
            {notice && <p role="status" style={{ margin: 0 }}>{notice}</p>}
            {error && <p role="alert" style={{ margin: 0, color: "var(--rp-danger)" }}>{error}</p>}
          </>
        )}
      </div>
      {confirmNode}
    </CardOrNot>
  );
}

function CardOrNot({ bare, children }: { bare?: boolean; children: ReactNode }) {
  if (bare) return <>{children}</>;
  return <SectionCard title="Your web address" description="Open your shop at an address you own. The current one keeps working.">{children}</SectionCard>;
}
