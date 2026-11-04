import { useEffect, useMemo, useState, type ReactNode } from "react";
import toast from "react-hot-toast";
import { CalendarDays, ChartColumn, Clapperboard, ExternalLink, Globe, HardDrive, Mail, MapPin, Megaphone, Search, ShieldCheck, ShoppingBag, type LucideIcon } from "lucide-react";
import { ErrorState, GhostButton, LoadingState, PrimaryButton, SecondaryButton, StatusBadge, Toggle, useConfirm } from "./riso/components";
import { friendlyError } from "./settingsLayout";
import { RECONNECT_WORDS, googleConnectApi, takeGoogleOutcome, useGoogleConnect, type GoogleExtra, type GoogleStatus, type ShoppingProblems, type StockSheet } from "./googleConnect";
import { extrasChanged, googleServices, googleSummary, serviceBadge, type ServiceId, type ServiceView } from "./googleHub";
import { useShopWords } from "./shopWords";
import { hasStockroom } from "../../lib/shopProfile";
import "./google.css";

// Settings › Google: one page for every Google service, as cards (googleHub.ts). The included parts come with the one
// sign-in; the extras are toggles saved with Google in one go. Disconnect sits at the foot with what stays the press's.
// A shop not run by Colophon never lists this page (Dashboard hides it) and keeps the older cards in Visitors & Google.

export const SERVICE_ICONS: Record<ServiceId, LucideIcon> = {
  analytics: ChartColumn, searchConsole: Search, merchantCenter: ShoppingBag, email: Mail, domain: Globe,
  businessProfile: MapPin, drive: HardDrive, youtube: Clapperboard, calendar: CalendarDays, ads: Megaphone,
};
/** Each service's ink: the look's four tile colours, in turn, so every look colours the page its own way. */
const INK: Record<ServiceId, "a" | "b" | "c" | "d"> = {
  analytics: "a", searchConsole: "b", merchantCenter: "c", email: "d", domain: "a",
  businessProfile: "b", drive: "c", youtube: "d", calendar: "a", ads: "b",
};

// Google sends the press back with ?google=…; read once per page load.
let outcome: ReturnType<typeof takeGoogleOutcome> | undefined;
const outcomeOnce = () => (outcome === undefined ? (outcome = takeGoogleOutcome()) : outcome);
const OUTCOME = {
  connected: { tone: "success", text: "Google is connected. Each card below shows how its part went." },
  denied: { tone: "neutral", text: "Nothing was changed. You can connect Google any time." },
  failed: { tone: "danger", text: "Google didn't finish connecting. Press Connect Google to try again." },
  other_account: { tone: "danger", text: "That was a different Google account from your shop's, so nothing was changed. Every part of your shop uses one Google account: sign in with the one shown above." },
} as const;

/** Opens Google's Allow page with these extras; the press comes back to this page. */
export function useGoogleSignIn() {
  const [busy, setBusy] = useState(false);
  const go = async (extras: GoogleExtra[]) => {
    setBusy(true);
    try {
      window.location.assign(await googleConnectApi.connectLink(extras));
    } catch (err: any) {
      toast.error(friendlyError(err, "open Google's sign-in"));
      setBusy(false);
    }
  };
  return { busy, go };
}

export function GoogleSettings() {
  const google = useGoogleConnect();
  if (google.mode === "loading") return <LoadingState label="Reading your Google connection…" />;
  if (google.mode === "error") return <ErrorState title="Couldn't read your Google connection" description={google.error || undefined} onRetry={google.reload} />;
  return <GoogleHub status={google.status ?? { enabled: false }} />;
}

export function GoogleHub({ status }: { status: GoogleStatus }) {
  const w = useShopWords();
  const saved = status.extrasChosen ?? [];
  const [picked, setPicked] = useState<GoogleExtra[]>(saved);
  useEffect(() => { setPicked(status.extrasChosen ?? []); }, [status.extrasChosen?.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const services = useMemo(() => googleServices(status, picked), [status, picked]);
  const summary = googleSummary(status, services);
  const change = extrasChanged(saved, picked);
  const changes = change.added.length + change.removed.length;
  const signIn = useGoogleSignIn();
  const [retrying, setRetrying] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [confirm, confirmNode] = useConfirm();
  const shopReady = (status.steps ?? []).find((s) => s.step === "firebase");

  const tryAgain = async (part: string) => {
    setRetrying(part);
    try { await googleConnectApi.tryAgain(part); toast.success("Asked Google again"); }
    catch (err: any) { toast.error(friendlyError(err, "try that again")); }
    finally { setRetrying(null); }
  };
  const disconnect = async () => {
    const ok = await confirm({
      title: "Disconnect Google?",
      message: "Your shop stops sending visits and books to Google, and Colophon gives back its access to your Google account. Your Google accounts stay yours, with all their history. You can connect again any time.",
      confirmLabel: "Disconnect",
    });
    if (!ok) return;
    setLeaving(true);
    try { await googleConnectApi.disconnect(); toast.success("Google is disconnected"); }
    catch (err: any) { toast.error(friendlyError(err, "disconnect Google")); }
    finally { setLeaving(false); }
  };
  const [saving, setSaving] = useState(false);
  const saveExtras = async () => {
    if (change.added.length) return signIn.go(picked);
    setSaving(true);
    try { await googleConnectApi.turnOff(change.removed); toast.success(change.removed.length === 1 ? "That extra is off" : "Those extras are off"); }
    catch (err: any) { toast.error(friendlyError(err, "switch that off")); }
    finally { setSaving(false); }
  };
  const toggle = (id: GoogleExtra, on: boolean) => setPicked((list) => (on ? [...list, id] : list.filter((x) => x !== id)));

  const found = outcomeOnce();
  const needs = status.connected ? [...services.included, ...services.extras].filter((x) => x.state === "failed" || x.state === "waiting") : [];
  const headline = !status.enabled ? "Google is coming soon"
    : status.needsReconnect ? RECONNECT_WORDS.title
    : status.connected ? (summary.needsYou ? `${summary.needsYou} ${summary.needsYou === 1 ? "part needs" : "parts need"} a look` : summary.working === summary.total ? "Everything is working" : "Google is linking your shop")
    : "Connect Google with one sign-in";
  // One short line, only where it tells the press something the headline and cards don't.
  const lead = !status.enabled ? "Google is approving the sign-in. This page switches on by itself."
    : status.needsReconnect ? RECONNECT_WORDS.text
    : status.connected ? ""
    : w("One sign-in puts your shop on Google search, your books on Google Shopping, and shows where visitors come from.");

  return (
    <div className="gg">
      <section className="gg-hero rp-card" aria-labelledby="gg-title">
        <div className="gg-hero-main">
          <div className="gg-hero-text">
            <span className="gg-mark" aria-hidden="true"><span /><span /><span /><span /></span>
            <h2 id="gg-title" className="gg-title">{headline}</h2>
            {lead && <p className="gg-lead">{lead}</p>}
            {status.connected && status.accountEmail && (
              <p className="gg-account"><span className="gg-avatar" aria-hidden="true">{status.accountEmail[0]?.toUpperCase()}</span>
                <span><strong>{status.accountEmail}</strong> runs every part{status.connectedAt ? <> · since {shortDate(status.connectedAt)}</> : null}</span></p>
            )}
            {needs.length > 0 && (
              <ul className="gg-needs" aria-label="Parts that need a look">
                {needs.map((n) => (
                  <li key={n.id}><button type="button" className="gg-need" data-state={n.state} onClick={() => document.getElementById(`gg-card-${n.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}>
                    <span aria-hidden="true">{n.state === "failed" ? "✕" : "⚠"}</span>{n.label} · {serviceBadge(n).text}
                  </button></li>
                ))}
              </ul>
            )}
            <div className="gg-actions">
              {status.enabled && (!status.connected || status.needsReconnect) && (
                <PrimaryButton disabled={signIn.busy} onClick={() => signIn.go(picked)}>{signIn.busy ? "Opening Google…" : status.needsReconnect ? RECONNECT_WORDS.button : "Connect Google"}</PrimaryButton>
              )}
            </div>
          </div>
        </div>
        {status.connected && summary.total > 0 && (
          <div className="gg-meter" aria-label={`${summary.working} of ${summary.total} working`}>
            <p className="gg-meter-count"><strong>{summary.working}</strong><span>of {summary.total} working</span></p>
            <ol className="gg-meter-bar">
              {summary.segments.map((s) => <li key={s.id} data-state={s.state} title={`${s.label}: ${serviceBadge({ state: s.state }).text}`} />)}
            </ol>
          </div>
        )}
      </section>

      {found && <p role="status" className="gg-outcome" data-tone={OUTCOME[found].tone}>{OUTCOME[found].text}</p>}
      {shopReady && shopReady.state !== "done" && (
        <div className="gg-note" role="alert">
          <span><strong>Getting your shop ready for Google</strong> {shopReady.detail}</span>
          <SecondaryButton size="sm" disabled={retrying !== null} onClick={() => tryAgain("firebase")}>{retrying === "firebase" ? "Trying…" : "Try again"}</SecondaryButton>
        </div>
      )}

      <GroupHead title="Included" />
      <div className="gg-grid">
        {services.included.map((s) => (
          <ServiceCard key={s.id} view={s} w={w}
            action={s.canRetry ? <SecondaryButton size="sm" disabled={retrying !== null} onClick={() => tryAgain(s.id)}>{retrying === s.id ? "Trying…" : "Try again"}</SecondaryButton> : null}
            after={s.id === "merchantCenter" && s.state === "done" ? <ShoppingProblemsList /> : null} />
        ))}
      </div>

      <GroupHead title="Extras" sub="Optional" />
      <div className="gg-grid">
        {services.extras.map((s) => (
          <ServiceCard key={s.id} view={s} w={w}
            action={<>
              <Toggle label={s.picked ? "On" : "Off"} checked={!!s.picked} disabled={!status.enabled || signIn.busy} onChange={(on) => toggle(s.id as GoogleExtra, on)} />
              {s.canRetry && <SecondaryButton size="sm" disabled={retrying !== null} onClick={() => tryAgain(s.id)}>{retrying === s.id ? "Trying…" : "Try again"}</SecondaryButton>}
            </>}
            // The stock list is read from the stockroom, so a website-only press isn't offered it.
            after={s.id === "drive" && status.connected && hasStockroom() && saved.includes("drive") && s.state !== "failed" ? <StockSheetRow /> : null} />
        ))}
      </div>
      {changes > 0 && status.connected && (
        <div className="rp-savebar" role="region" aria-label="Extras not saved yet">
          {/* Switching off needs no new permission, so it saves here; switching on asks Google once, on the same account. */}
          <span role="status">{saveWords(change)}</span>
          <span style={{ display: "flex", gap: 8 }}>
            <SecondaryButton onClick={() => setPicked(saved)} disabled={signIn.busy || saving}>Discard</SecondaryButton>
            <PrimaryButton onClick={saveExtras} disabled={signIn.busy || saving}>{signIn.busy ? "Opening Google…" : saving ? "Saving…" : change.added.length ? "Save with Google" : "Save"}</PrimaryButton>
          </span>
        </div>
      )}

      <section className="gg-trust rp-card" aria-labelledby="gg-trust-title">
        <ShieldCheck className="gg-trust-icon" aria-hidden="true" />
        <div className="gg-trust-text">
          <h3 id="gg-trust-title" className="gg-group-title">Your Google accounts stay yours</h3>
          <p className="rp-hint">With all their history, even if you disconnect. Colophon never reads your Gmail.</p>
        </div>
        {status.connected && <GhostButton disabled={leaving} onClick={disconnect}>{leaving ? "Disconnecting…" : "Disconnect Google"}</GhostButton>}
      </section>
      {confirmNode}
    </div>
  );
}

/** What the save bar says: switching off saves here; switching on opens Google's page on the shop's account. */
export function saveWords(change: { added: GoogleExtra[]; removed: GoogleExtra[] }): string {
  const n = change.added.length + change.removed.length;
  const head = n === 1 ? "1 extra changed." : `${n} extras changed.`;
  if (!change.added.length) return `${head} Switching off saves straight away, with no new sign-in.`;
  return `${head} Google asks you once to allow ${change.added.length === 1 ? "the new one" : "the new ones"}, on the same Google account.`;
}

function GroupHead({ title, sub }: { title: string; sub?: string }) {
  return <div className="gg-group"><h3 className="gg-group-title">{title}</h3>{sub && <p className="rp-hint">{sub}</p>}</div>;
}

function ServiceCard({ view, action, after, w }: { view: ServiceView; action?: ReactNode; after?: ReactNode; w: (s: string) => string }) {
  const Icon = SERVICE_ICONS[view.id];
  const badge = serviceBadge(view);
  const live = view.state === "done";
  return (
    <article id={`gg-card-${view.id}`} className="gg-card rp-card" data-state={view.state} aria-labelledby={`gg-${view.id}`}>
      <header className="gg-card-head">
        <span className="gg-icon" data-ink={INK[view.id]} aria-hidden="true"><Icon size={20} strokeWidth={2.2} /></span>
        <h4 id={`gg-${view.id}`} className="gg-card-title">{view.label}</h4>
        {/* While Google is still coming, the page says so once, at the top, rather than on every card. */}
        {/* An extra's switch already says On or Off, so its badge shows only how a switched-on one is going. */}
        {view.state !== "coming" && !(view.picked !== undefined && (view.state === "off" || view.state === "ready")) && <StatusBadge tone={badge.tone}>{badge.text}</StatusBadge>}
      </header>
      <p className="gg-about">{w(view.gives[0])}</p>
      {view.detail && (view.state === "failed" || view.state === "waiting" || view.state === "off") && <p className="gg-detail" data-state={view.state}>{view.detail}</p>}
      {after}
      <footer className="gg-card-foot">
        {action}
        {(live || (view.id === "domain" && view.state !== "ready" && view.state !== "coming")) && view.admin && <a className="gg-link" href={view.admin.hash}>{view.admin.label}</a>}
        {live && view.googleUrl && <a className="gg-link" href={view.googleUrl} target="_blank" rel="noreferrer noopener">Open in Google<ExternalLink size={13} aria-hidden="true" /><span className="rp-sr-only"> (opens a new tab)</span></a>}
      </footer>
    </article>
  );
}

/** Get started's Google step: the included services (or the given ones) as small tiles with their state. */
export function GoogleTiles({ status, only }: { status: GoogleStatus; only?: ServiceId[] }) {
  const w = useShopWords();
  const { included } = googleServices(status);
  const list = only ? included.filter((s) => only.includes(s.id)) : included;
  return (
    <ul className="gg gg-tiles" aria-label="What Google links to your shop">
      {list.map((s) => {
        const Icon = SERVICE_ICONS[s.id];
        const badge = serviceBadge(s);
        return (
          <li key={s.id} className="gg-tile" data-state={s.state}>
            <span className="gg-icon" data-ink={INK[s.id]} aria-hidden="true"><Icon size={18} strokeWidth={2.2} /></span>
            <span className="gg-tile-text"><strong>{s.label}</strong><span>{status.connected ? badge.text : w(s.gives[0])}</span></span>
          </li>
        );
      })}
    </ul>
  );
}

const shortDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};

/** Google Shopping's "not shown" list, in plain words. Nothing is shown while it loads or when it can't be read. */
export function ShoppingProblemsList() {
  const w = useShopWords();
  const [found, setFound] = useState<ShoppingProblems | null>(null);
  useEffect(() => {
    let live = true;
    googleConnectApi.shoppingProblems().then((p) => { if (live) setFound(p); }, () => { if (live) setFound(null); });
    return () => { live = false; };
  }, []);
  if (!found?.available) return null;
  if (found.problems.length === 0) return null;
  return (
    <details className="gg-problems">
      <summary>{found.problems.length === 1 ? w("1 book") : w(`${found.problems.length} books`)} Google Shopping isn't showing</summary>
      <ul aria-label={w("Books Google Shopping isn't showing")}>
        {found.problems.map((p) => (
          <li key={p.offerId || p.title}>
            <strong>{p.title || p.offerId}</strong>
            {p.issues.map((i, n) => <p key={n} className="rp-hint" style={{ margin: "2px 0 0" }}>{i.description}{i.resolution ? ` ${i.resolution}` : ""}</p>)}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** "Send my stock list to my Google Sheet": the sheet is made in the press's own Drive the first time. */
export function StockSheetRow() {
  const w = useShopWords();
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<StockSheet | null>(null);
  const send = async () => {
    setBusy(true);
    try {
      const next = await googleConnectApi.sendStockSheet();
      setSheet(next);
      if (!next.available) toast.error("Google didn't allow your Drive. Switch Your Google Drive on and save it with Google.");
      else if (next.gone) toast("That sheet was deleted in your Drive. Press the button again to make a new one.");
      else toast.success("Your stock list is in your Google Sheet");
    } catch (err: any) {
      toast.error(friendlyError(err, "send your stock list"));
    } finally { setBusy(false); }
  };
  return (
    <div className="gg-sheet">
      <p className="gg-detail"><strong>{w("Stock list in Google Sheets")}</strong>{sheet?.url ? <> · <a href={sheet.url} target="_blank" rel="noreferrer noopener">Open it</a>{sheet.rows !== undefined ? ` (${sheet.rows} products)` : ""}</> : null}</p>
      <SecondaryButton size="sm" disabled={busy} onClick={send}>{busy ? "Sending…" : sheet?.url ? "Update my sheet" : "Send my stock list"}</SecondaryButton>
    </div>
  );
}
