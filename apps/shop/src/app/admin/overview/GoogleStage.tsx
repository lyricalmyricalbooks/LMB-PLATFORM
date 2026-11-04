import { useEffect, useState } from "react";
import { googleConnectApi, takeGoogleOutcome, useGoogleConnect } from "../googleConnect";
import { type GoogleMarker } from "../googleStage";
import { GoogleTiles } from "../GoogleSettings";
import { friendlyError } from "../studio/friendlyError";
import { LoadingState, PrimaryButton, SecondaryButton, SectionCard, StatusBadge } from "../riso/components";

/**
 * Get started, step 4 (plan 17.9): one Connect Google button, then a plain list of what Google linked (plan 6.17). Until
 * Google approves the sign-in for Colophon shops the step says it is coming and the run goes on (decision 2). "Connect
 * later" is always there, so the step never holds the press up.
 */
export function GoogleStage({ onDone }: { onDone: (google: GoogleMarker) => Promise<void> }) {
  const google = useGoogleConnect();
  // Set when the press comes back from Google's page with ?google=… (read once, then taken out of the address).
  const [outcome] = useState(() => takeGoogleOutcome());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if (outcome === "connected") google.reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const title = "Get started · Step 4 of 8: Google in one sign-in";
  const finish = async (marker: Omit<GoogleMarker, "at">) => {
    if (busy) return;
    setBusy(true); setError("");
    try {
      await onDone({ at: new Date().toISOString(), ...marker });
    } catch (e) {
      setError(friendlyError(e, "your Google connection"));
      setBusy(false);
    }
  };

  if (google.mode === "loading") return <SectionCard title={title} collapsible={false}><LoadingState label="Checking Google…" /></SectionCard>;
  if (google.mode === "error") {
    return (
      <SectionCard title={title} collapsible={false}>
        <p role="alert" className="rp-hint" style={{ margin: 0, color: "var(--rp-danger)" }}>{google.error || "Your Google connection couldn't be read."}</p>
        <SecondaryButton size="sm" style={{ marginTop: 12 }} onClick={google.reload}>Try again</SecondaryButton>
      </SectionCard>
    );
  }

  const status = google.status;
  // A shop Colophon runs with Google not yet switched on, or not run by Colophon at all: the step waits, the run goes on.
  if (google.mode === "own" || !status || !status.enabled) {
    return (
      <SectionCard title={title} description="Optional for now." collapsible={false}>
        <p style={{ margin: 0 }}>Connecting Google is coming soon. Google is still approving the sign-in for Colophon shops. Carry on with your setup, and we'll remind you once it's ready.</p>
        <div style={{ marginTop: 14 }}><GoogleTiles status={{ enabled: false }} /></div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
          <PrimaryButton disabled={busy} onClick={() => finish({ coming: true })}>{busy ? "Saving…" : "Carry on"}</PrimaryButton>
        </div>
        {error && <p role="alert" className="rp-hint" style={{ margin: "12px 0 0", color: "var(--rp-danger)" }}>{error}</p>}
      </SectionCard>
    );
  }

  // A grant Google ended still reads as connected: it must offer a new sign-in, not a green badge.
  if (status.connected && !status.needsReconnect) {
    return (
      <SectionCard title={title} description="Your Google account is linked to your shop." collapsible={false}>
        <StatusBadge tone="success">Google is connected</StatusBadge>
        <div style={{ marginTop: 14 }}><GoogleTiles status={status} /></div>
        <p className="rp-hint" style={{ margin: "10px 0 0" }}>Extras like Google Maps and backups to your Drive are in Settings › Google, any time.</p>
        {error && <p role="alert" className="rp-hint" style={{ margin: "12px 0 0", color: "var(--rp-danger)" }}>{error}</p>}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
          <PrimaryButton disabled={busy} onClick={() => finish({ connected: true })}>{busy ? "Saving…" : "Continue"}</PrimaryButton>
        </div>
      </SectionCard>
    );
  }

  const connect = async () => {
    setError("");
    try {
      window.location.href = await googleConnectApi.connectLink(status.extrasChosen ?? []);
    } catch (e) {
      setError(friendlyError(e, "Google"));
    }
  };

  return (
    <SectionCard title={title} description="Optional for now. One sign-in with your Google account links search, Google Shopping listings and visitor statistics." collapsible={false}>
      {outcome === "denied" && <p role="alert" className="rp-hint" style={{ margin: "0 0 12px", color: "var(--rp-danger)" }}>Google didn't connect, because the sign-in was cancelled on Google's page. You can try again now or later.</p>}
      {outcome === "other_account" && <p role="alert" className="rp-hint" style={{ margin: "0 0 12px", color: "var(--rp-danger)" }}>That was a different Google account from your shop's, so nothing was changed. Sign in with the one your shop already uses.</p>}
      {outcome === "failed" && <p role="alert" className="rp-hint" style={{ margin: "0 0 12px", color: "var(--rp-danger)" }}>Google didn't connect this time. You can try again now or later.</p>}
      {status.needsReconnect && <p className="rp-hint" style={{ margin: "0 0 12px" }}>Google asks you to sign in again.</p>}
      {error && <p role="alert" className="rp-hint" style={{ margin: "0 0 12px", color: "var(--rp-danger)" }}>{error}</p>}
      <GoogleTiles status={status} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
        <PrimaryButton disabled={busy} onClick={connect}>{status.needsReconnect ? "Reconnect Google" : "Connect Google"}</PrimaryButton>
        <SecondaryButton disabled={busy} onClick={() => finish({ skipped: true })}>Connect later</SecondaryButton>
      </div>
    </SectionCard>
  );
}
