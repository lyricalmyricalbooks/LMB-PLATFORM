import { useEffect, useState } from "react";
import { adminApi } from "./api";
import { ConfirmButton, GhostButton, PrimaryButton, SecondaryButton, StatusBadge } from "./riso/components";
import { friendlyError } from "./settingsLayout";
import { needsLine, otherProvider, providerName, switchStage, type SwitchAnswer } from "./platformPayments";

// Settings › Payments › Card payments: moving the shop from Stripe to Square or back after it opens (code plan 27.6c).
// Connect the other account, press Switch, and Colophon moves the shop over. Older orders keep refunding through the
// account that took them, and both accounts take sales until the move is done, so no sale is lost.
export function SwitchProviderSection({ current }: { current: "stripe" | "square" }) {
  const other = otherProvider(current);
  const name = providerName(other);
  const from = providerName(current);
  const [answer, setAnswer] = useState<SwitchAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "status" | "connect" | "switch">("status");
  const [confirming, setConfirming] = useState(false);

  const load = async () => {
    setBusy("status");
    try {
      setAnswer(await adminApi.platformPayments("nextStatus"));
      setError(null);
    } catch (err: any) {
      setError(friendlyError(err, `check your ${name} account`));
    } finally {
      setBusy(null);
    }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const connect = async () => {
    if (busy) return;
    setBusy("connect");
    try {
      const link = await adminApi.platformPayments("connectNext");
      if (!link.url) throw new Error(`${name} didn't give a page to open.`);
      window.location.assign(link.url);
    } catch (err: any) {
      setError(friendlyError(err, `open ${name}`));
      setBusy(null);
    }
  };

  const switchNow = async () => {
    if (busy) return;
    setBusy("switch");
    try {
      await adminApi.platformPayments("switch");
      setConfirming(false);
      await load();
    } catch (err: any) {
      setError(friendlyError(err, `switch to ${name}`));
      setBusy(null);
    }
  };

  // Nothing shows until the platform has answered, so a press never sees a button that turns into another.
  if (!answer && busy === "status") return null;
  const stage = switchStage(answer);
  const needs = answer && stage === "connecting" ? needsLine(answer) : null;

  return (
    <div className="rp-card" data-testid="switch-provider" style={{ padding: 16, boxShadow: "none", background: "var(--rp-surface-sunken)" }}>
      <div className="rp-sect">Switch to {name}</div>
      <div className="rp-stack" style={{ gap: 12 }}>
        {stage === "switching" ? (
          <>
            <StatusBadge tone="warning">Switching to {name}…</StatusBadge>
            <p className="rp-hint" style={{ margin: 0 }}>New sales go to {from} until it's done.</p>
          </>
        ) : stage === "ready" ? (
          <p style={{ margin: 0 }}>{name} is ready. Older orders stay with {from} for refunds.</p>
        ) : stage === "connecting" ? (
          <p style={{ margin: 0 }}>{needs ?? `${name} can't take cards yet.`}</p>
        ) : (
          <p className="rp-hint" style={{ margin: 0 }}>Older orders stay with {from} for refunds.</p>
        )}
        {error && <p role="alert" className="rp-hint" style={{ margin: 0, color: "var(--rp-danger)" }}>{error}</p>}
        {stage !== "switching" && (
          <div className="rp-card-actions">
            {stage === "ready" ? (
              confirming ? (
                <>
                  <ConfirmButton busy={busy === "switch"} disabled={!!busy} onClick={switchNow}>Yes, switch to {name}</ConfirmButton>
                  <GhostButton disabled={!!busy} onClick={() => setConfirming(false)}>Cancel</GhostButton>
                </>
              ) : (
                <PrimaryButton disabled={!!busy} onClick={() => setConfirming(true)}>Switch to {name}</PrimaryButton>
              )
            ) : (
              <SecondaryButton busy={busy === "connect"} disabled={!!busy} onClick={connect}>
                {stage !== "connecting" ? `Connect ${name}` : other === "square" ? `Reconnect ${name}` : `Continue with ${name}`}
              </SecondaryButton>
            )}
            {stage === "connecting" && <GhostButton size="sm" disabled={!!busy} onClick={load}>Check again</GhostButton>}
          </div>
        )}
      </div>
    </div>
  );
}
