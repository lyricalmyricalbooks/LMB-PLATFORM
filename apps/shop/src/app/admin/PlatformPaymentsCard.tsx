import { useEffect, useState } from "react";
import { adminApi } from "./api";
import { ErrorState, LoadingState, PrimaryButton, SecondaryButton, SectionCard, StatusBadge } from "./riso/components";
import { friendlyError } from "./settingsLayout";
import { accountConnected, feeLine, providerName, returnNotice, withoutReturnFlags, type PlatformPaymentsAnswer, type ReturnNotice } from "./platformPayments";

// Settings › Payments › Ways to pay, for a shop whose cards run through Colophon (plan 2.2b / 2.10): no keys to paste.
// The press connects its own Square or Stripe account here, sees whether it can take cards, and sees Colophon's fee
// next to its payouts.
export function PlatformPaymentsCard({ provider }: { provider: "stripe" | "square" }) {
  const name = providerName(provider);
  const [answer, setAnswer] = useState<PlatformPaymentsAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "status" | "connect">("status");
  // Read once, when Square or Stripe sends the owner back here; the flag is then taken out of the address.
  const [notice] = useState<ReturnNotice | null>(() => (typeof window === "undefined" ? null : returnNotice(window.location.search)));

  const load = async () => {
    setBusy("status");
    setError(null);
    try {
      setAnswer(await adminApi.platformPayments("status"));
    } catch (err: any) {
      setAnswer(null);
      setError(friendlyError(err, `check your ${name} account`));
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    if (notice) {
      try { window.history.replaceState(window.history.state, "", withoutReturnFlags(window.location.href)); } catch { /* the notice still shows */ }
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const connect = async () => {
    if (busy) return;
    setBusy("connect");
    try {
      const link = await adminApi.platformPayments("connect");
      if (!link.url) throw new Error(`${name} didn't give a page to open.`);
      window.location.assign(link.url);
    } catch (err: any) {
      setError(friendlyError(err, `open ${name}`));
      setBusy(null);
    }
  };

  const connected = answer ? accountConnected(answer) : false;
  const canTakeCards = connected && answer?.chargesEnabled === true;
  const buttonLabel = busy === "connect" ? "Opening…" : provider === "square" ? (connected ? "Reconnect Square" : "Connect Square") : (connected ? "Update Stripe details" : "Finish Stripe setup");
  const Button = connected ? SecondaryButton : PrimaryButton;

  return (
    <SectionCard title="Card payments" description={`Cards go to your own ${name} account, through Colophon. No keys.`}>
      <div className="rp-stack" style={{ gap: 16 }}>
        {notice && (
          <p role="status" style={{ margin: 0, padding: 12, border: `2px solid var(--rp-${notice.tone})`, background: `var(--rp-${notice.tone}-tint)` }}>{notice.text}</p>
        )}
        {busy === "status" && !answer ? (
          <LoadingState label={`Checking your ${name} account…`} />
        ) : error && !answer ? (
          <ErrorState title={`Couldn't check your ${name} account`} description={error} onRetry={load} />
        ) : answer ? (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <StatusBadge tone={connected ? "success" : "warning"}>{connected ? `${name} connected` : `${name} not connected`}</StatusBadge>
              {connected && <StatusBadge tone={canTakeCards ? "success" : "warning"}>{canTakeCards ? "Taking cards" : "Can't take cards yet"}</StatusBadge>}
              {provider === "stripe" && connected && <StatusBadge tone={answer.payoutsEnabled ? "success" : "warning"}>{answer.payoutsEnabled ? "Payouts on" : "Payouts paused"}</StatusBadge>}
            </div>
            {connected && answer.locationName && <p className="rp-hint" style={{ margin: 0 }}>Location: <strong>{answer.locationName}</strong>{answer.currency ? ` · ${answer.currency}` : ""}</p>}
            {provider === "stripe" && connected && (answer.requirementsDue ?? 0) > 0 && (
              <p className="rp-hint" style={{ margin: 0 }}>Stripe needs {answer.requirementsDue} more detail{answer.requirementsDue === 1 ? "" : "s"} from you before it pays out.</p>
            )}
            {connected && !canTakeCards && (
              <p className="rp-hint" style={{ margin: 0 }}>{name} hasn't turned on card payments for this account yet. Open your {name} dashboard to finish anything it asks for.</p>
            )}
            <div className="rp-card" style={{ padding: 16, boxShadow: "none", background: "var(--rp-surface-sunken)" }}>
              <div className="rp-sect">Payouts &amp; Colophon's fee</div>
              <p style={{ margin: 0 }}>{feeLine(answer.platformFee)}</p>
              <p className="rp-hint" style={{ margin: "8px 0 0" }}>{name} pays your sales into your own bank account on its usual schedule.</p>
            </div>
            {error && <p role="alert" className="rp-hint" style={{ margin: 0, color: "var(--rp-danger)" }}>{error}</p>}
          </>
        ) : null}
        <div className="rp-card-actions">
          <Button disabled={!!busy} onClick={connect}>{buttonLabel}</Button>
          {answer && <SecondaryButton size="sm" disabled={!!busy} onClick={load}>Check again</SecondaryButton>}
        </div>
      </div>
    </SectionCard>
  );
}
