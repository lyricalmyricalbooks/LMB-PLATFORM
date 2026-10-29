import { useEffect, useState, type ReactNode } from "react";
import toast from "react-hot-toast";
import { Checkbox, ErrorState, GhostButton, LoadingState, PrimaryButton, SecondaryButton, SectionCard, StatusBadge, useConfirm } from "./riso/components";
import { friendlyError } from "./settingsLayout";
import { GOOGLE_PARTS, googleConnectApi, stepTone, stepWord, takeGoogleOutcome, useGoogleConnect, type GoogleExtra, type GoogleStatus, type ShoppingProblems, type StockSheet } from "./googleConnect";

// Connect Google (plan 6.17): one sign-in links Analytics, search, Google Shopping and the shop's email. `variant`
// "full" (Settings › General › Visitors & Google) shows every part and its state, the extras and Disconnect;
// "prompt" (the Overview, and its Marketing & traffic) shows one line and the button until Google is connected.
// A shop not run by Colophon shows `fallback` (the older cards) instead.

// Google sends the press back with ?google=…; read it once per page load, whichever card shows first.
let outcome: ReturnType<typeof takeGoogleOutcome> | undefined;
const outcomeOnce = () => (outcome === undefined ? (outcome = takeGoogleOutcome()) : outcome);

const OUTCOME_WORDS = {
  connected: { tone: "success", text: "✓ Google is connected. Each part below shows how it went." },
  denied: { tone: "neutral", text: "Nothing was changed. You can connect Google any time." },
  failed: { tone: "danger", text: "✕ Google didn't finish connecting. Press Connect Google to try again." },
} as const;

function useConnect() {
  const [busy, setBusy] = useState(false);
  const go = async (extras: GoogleExtra[]) => {
    setBusy(true);
    try {
      const url = await googleConnectApi.connectLink(extras);
      window.location.assign(url);
    } catch (err: any) {
      toast.error(friendlyError(err, "open Google's sign-in"));
      setBusy(false);
    }
  };
  return { busy, go };
}

export function ConnectGoogleCard({ variant = "full", fallback = null }: { variant?: "full" | "prompt"; fallback?: ReactNode }) {
  const google = useGoogleConnect();
  if (google.mode === "own") return <>{fallback}</>;
  if (variant === "prompt") return <GooglePrompt status={google.status} />;
  return (
    <SectionCard title="Google" description="Analytics, search, Google Shopping and your emails, with one sign-in."
      actions={google.status?.connected ? <StatusBadge tone="success">Connected</StatusBadge> : google.status?.enabled ? <StatusBadge tone="neutral">Not connected</StatusBadge> : undefined}>
      {google.mode === "loading" ? <LoadingState label="Reading your Google connection…" />
        : google.mode === "error" ? <ErrorState title="Couldn't read your Google connection" description={google.error || undefined} onRetry={google.reload} />
        : !google.status?.enabled ? (
          <p className="rp-hint" style={{ margin: 0 }}>Connecting Google is on its way. Until then, your Overview counts visits with your shop's own counter, and your books are already set up for Google search.</p>
        ) : <GoogleDetails status={google.status} />}
    </SectionCard>
  );
}

function OutcomeLine() {
  const found = outcomeOnce();
  if (!found) return null;
  const { tone, text } = OUTCOME_WORDS[found];
  const colour = tone === "neutral" ? "--rp-text" : tone === "success" ? "--rp-success" : "--rp-danger";
  return <p role="status" className="rp-hint" style={{ margin: 0, color: `var(${colour})` }}>{text}</p>;
}

function GoogleDetails({ status }: { status: GoogleStatus }) {
  const offered = status.extrasOffered ?? [];
  const [extras, setExtras] = useState<GoogleExtra[]>(status.extrasChosen ?? []);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [confirm, confirmNode] = useConfirm();
  const connect = useConnect();
  const extrasChanged = [...extras].sort().join() !== [...(status.extrasChosen ?? [])].sort().join();

  const tryAgain = async (part: string) => {
    setRetrying(part);
    try { await googleConnectApi.tryAgain(part); } catch (err: any) { toast.error(friendlyError(err, "try that again")); } finally { setRetrying(null); }
  };
  const disconnect = async () => {
    const ok = await confirm({
      title: "Disconnect Google?",
      message: "Your shop stops sending visits and books to Google, and Colophon gives back its access to your Google account. Your Analytics, Search Console and Merchant Center accounts stay yours, with their history.",
      confirmLabel: "Disconnect",
    });
    if (!ok) return;
    setLeaving(true);
    try { await googleConnectApi.disconnect(); toast.success("Google is disconnected"); } catch (err: any) { toast.error(friendlyError(err, "disconnect Google")); } finally { setLeaving(false); }
  };

  return (
    <div className="rp-stack" style={{ gap: 16 }}>
      <OutcomeLine />
      {status.connected ? (
        <>
          <p className="rp-hint" style={{ margin: 0 }}>Signed in as <strong style={{ overflowWrap: "anywhere" }}>{status.accountEmail}</strong>.</p>
          {(status.steps ?? []).length === 0 ? <p className="rp-hint" style={{ margin: 0 }}>Linking each part now. This page shows how it went in a minute.</p> : (
            <ul className="rp-list" aria-label="What Google is linked to" style={{ margin: 0 }}>
              {(status.steps ?? []).map((s) => (
                <li key={s.step} style={{ display: "flex", gap: 12, alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", padding: "10px 0" }}>
                  <div style={{ minWidth: 0, flex: "1 1 220px" }}>
                    <strong>{GOOGLE_PARTS[s.step]?.label ?? s.step}</strong>
                    <p className="rp-hint" style={{ margin: "2px 0 0" }}>{s.detail}</p>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <StatusBadge tone={stepTone(s.state)}>{stepWord(s.state)}</StatusBadge>
                    {s.state !== "done" && s.step !== "domain" && (
                      <SecondaryButton size="sm" disabled={retrying !== null} onClick={() => tryAgain(s.step)}>{retrying === s.step ? "Trying…" : "Try again"}</SecondaryButton>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <ul className="rp-hint" style={{ margin: 0, paddingLeft: 20, lineHeight: 1.6, listStyle: "disc" }}>
          {["analytics", "searchConsole", "merchantCenter", "email"].map((part) => <li key={part}><strong>{GOOGLE_PARTS[part].label}:</strong> {GOOGLE_PARTS[part].about}</li>)}
        </ul>
      )}
      {status.connected && (status.steps ?? []).some((s) => s.step === "merchantCenter" && s.state === "done") && <ShoppingProblemsList />}
      {status.connected && (status.extrasChosen ?? []).includes("drive") && <StockSheetRow />}
      {offered.length > 0 && (
        <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
          <legend style={{ fontWeight: 800, marginBottom: 6 }}>Extras <span className="rp-hint" style={{ fontWeight: 400 }}>· optional</span></legend>
          <div className="rp-stack" style={{ gap: 8 }}>
            {offered.map((extra) => (
              <div key={extra}>
                <Checkbox label={GOOGLE_PARTS[extra].label} checked={extras.includes(extra)}
                  onChange={(e) => setExtras((list) => (e.target.checked ? [...list, extra] : list.filter((x) => x !== extra)))} />
                <p className="rp-hint" style={{ margin: "2px 0 0 28px" }}>{GOOGLE_PARTS[extra].about}</p>
              </div>
            ))}
          </div>
        </fieldset>
      )}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {!status.connected && <PrimaryButton disabled={connect.busy} onClick={() => connect.go(extras)}>{connect.busy ? "Opening Google…" : "Connect Google"}</PrimaryButton>}
        {status.connected && extrasChanged && <PrimaryButton disabled={connect.busy} onClick={() => connect.go(extras)}>{connect.busy ? "Opening Google…" : "Save extras with Google"}</PrimaryButton>}
        {status.connected && <GhostButton disabled={leaving} onClick={disconnect}>{leaving ? "Disconnecting…" : "Disconnect Google"}</GhostButton>}
      </div>
      {!status.connected && <p className="rp-hint" style={{ margin: 0 }}>Google asks you to allow Colophon once. You can untick any part on Google's page, and disconnect here any time.</p>}
      {confirmNode}
    </div>
  );
}

function GooglePrompt({ status }: { status: GoogleStatus | null }) {
  const connect = useConnect();
  if (!status?.enabled || status.connected) return null;
  return (
    <SectionCard title="Connect Google" description="See where visitors come from, put your shop on Google search and your books on Google Shopping, with one sign-in."
      actions={<PrimaryButton size="sm" disabled={connect.busy} onClick={() => connect.go([])}>{connect.busy ? "Opening Google…" : "Connect Google"}</PrimaryButton>}>
      <OutcomeLine />
      <p className="rp-hint" style={{ margin: 0 }}>Until then, visit figures come from your shop's own counter. Extras like backups to your Google Drive are in Settings › General › Visitors & Google.</p>
    </SectionCard>
  );
}

/** Google Shopping's "not shown" list, in plain words. Nothing is shown while it loads or when it can't be read. */
function ShoppingProblemsList() {
  const [found, setFound] = useState<ShoppingProblems | null>(null);
  useEffect(() => {
    let live = true;
    googleConnectApi.shoppingProblems().then((p) => { if (live) setFound(p); }, () => { if (live) setFound(null); });
    return () => { live = false; };
  }, []);
  if (!found?.available) return null;
  if (found.problems.length === 0) return <p className="rp-hint" style={{ margin: 0 }}>Google Shopping has no problems with your books.</p>;
  return (
    <div className="rp-stack" style={{ gap: 8 }}>
      <strong>{found.problems.length === 1 ? "1 book" : `${found.problems.length} books`} Google Shopping isn't showing</strong>
      <ul className="rp-list" aria-label="Books Google Shopping isn't showing" style={{ margin: 0 }}>
        {found.problems.map((p) => (
          <li key={p.offerId || p.title} style={{ padding: "8px 0" }}>
            <strong>{p.title || p.offerId}</strong>
            {p.issues.map((i, n) => <p key={n} className="rp-hint" style={{ margin: "2px 0 0" }}>{i.description}{i.resolution ? ` ${i.resolution}` : ""}</p>)}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "Send my stock list to my Google Sheet": the sheet is made in the press's own Drive the first time. */
function StockSheetRow() {
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<StockSheet | null>(null);
  const send = async () => {
    setBusy(true);
    try {
      const next = await googleConnectApi.sendStockSheet();
      setSheet(next);
      if (!next.available) toast.error("Google didn't allow your Drive. Tick Your Google Drive below and save it with Google.");
      else if (next.gone) toast("That sheet was deleted in your Drive. Press the button again to make a new one.");
      else toast.success("Your stock list is in your Google Sheet");
    } catch (err: any) {
      toast.error(friendlyError(err, "send your stock list"));
    } finally { setBusy(false); }
  };
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
      <div style={{ minWidth: 0, flex: "1 1 220px" }}>
        <strong>Stock list in Google Sheets</strong>
        <p className="rp-hint" style={{ margin: "2px 0 0" }}>
          A sheet in your own Google Drive with each product's title, author, code, price and how many you have.
          {sheet?.url ? <> <a href={sheet.url} target="_blank" rel="noreferrer noopener">Open your sheet</a>{sheet.rows !== undefined ? ` (${sheet.rows} products)` : ""}.</> : " It only goes one way: change your stock in the stockroom, not in the sheet."}
        </p>
      </div>
      <SecondaryButton size="sm" disabled={busy} onClick={send}>{busy ? "Sending…" : sheet?.url ? "Update my sheet" : "Send my stock list"}</SecondaryButton>
    </div>
  );
}
