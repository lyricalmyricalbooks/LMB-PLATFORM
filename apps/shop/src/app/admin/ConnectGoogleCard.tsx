import { useState, type ReactNode } from "react";
import toast from "react-hot-toast";
import { PrimaryButton, SecondaryButton, SectionCard, StatusBadge } from "./riso/components";
import { friendlyError } from "./settingsLayout";
import { RECONNECT_WORDS, googleConnectApi, takeGoogleOutcome, useGoogleConnect, type GoogleExtra, type GoogleStatus } from "./googleConnect";
import { useShopWords } from "./shopWords";

// Connect Google (plan 6.17): one sign-in links Analytics, search, Google Shopping and the shop's email. Every part, the
// extras and Disconnect live on Settings › Google (GoogleSettings.tsx). `variant` "full" (Settings › General › Visitors &
// Google) points there; "prompt" (the Overview, and its Marketing & traffic) shows one line and the button until Google
// is connected.
// A shop not run by Colophon shows `fallback` (the older cards) instead.

// Google sends the press back with ?google=…; read it once per page load, whichever card shows first.
let outcome: ReturnType<typeof takeGoogleOutcome> | undefined;
const outcomeOnce = () => (outcome === undefined ? (outcome = takeGoogleOutcome()) : outcome);

const OUTCOME_WORDS = {
  connected: { tone: "success", text: "✓ Google is connected. Settings › Google shows how each part went." },
  denied: { tone: "neutral", text: "Nothing was changed. You can connect Google any time." },
  failed: { tone: "danger", text: "✕ Google didn't finish connecting. Press Connect Google to try again." },
  other_account: { tone: "danger", text: "✕ That was a different Google account from your shop's. Nothing was changed. Sign in with the one your shop already uses." },
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
  // Every Google service now has its own page, Settings › Google; Visitors & Google keeps one line and the way there.
  const s = google.status;
  return (
    <SectionCard title="Google"
      actions={s?.needsReconnect ? <StatusBadge tone="warning">Needs you</StatusBadge> : s?.connected ? <StatusBadge tone="success">Connected</StatusBadge> : s?.enabled ? <StatusBadge tone="neutral">Not connected</StatusBadge> : undefined}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
        <p className="rp-hint" style={{ margin: 0, flex: "1 1 260px" }}>Every Google service now has its own page.</p>
        <SecondaryButton size="sm" onClick={() => { window.location.hash = "#settings/google"; }}>Open Google settings</SecondaryButton>
      </div>
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

function GooglePrompt({ status }: { status: GoogleStatus | null }) {
  const w = useShopWords();
  const connect = useConnect();
  if (!status?.enabled || (status.connected && !status.needsReconnect)) return null;
  const again = !!status.needsReconnect;
  return (
    <SectionCard title={again ? RECONNECT_WORDS.title : "Connect Google"} description={again ? RECONNECT_WORDS.text : w("See where visitors come from, put your shop on Google search and your books on Google Shopping, with one sign-in.")}
      actions={<PrimaryButton size="sm" disabled={connect.busy} onClick={() => connect.go(status.extrasChosen ?? [])}>{connect.busy ? "Opening Google…" : again ? RECONNECT_WORDS.button : "Connect Google"}</PrimaryButton>}>
      <OutcomeLine />
      {!again && <p className="rp-hint" style={{ margin: 0 }}>Until then, visit figures come from your shop's own counter. Extras like backups to your Google Drive are in Settings › Google.</p>}
    </SectionCard>
  );
}

