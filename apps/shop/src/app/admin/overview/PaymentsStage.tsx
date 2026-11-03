import { useEffect, useState } from "react";
import { adminApi } from "../api";
import { feeLine, accountConnected, CONTINUE_WITH_STRIPE, needsLine, paymentsReady, providerName, returnNotice, withoutReturnFlags, type PlatformPaymentsAnswer, type ReturnNotice } from "../platformPayments";
import { friendlyError } from "../studio/friendlyError";
import { LoadingState, PrimaryButton, SecondaryButton, SectionCard } from "../riso/components";
import { paymentsMarker, type PaymentsMarker } from "../paymentsStage";

/**
 * Get started, step 5 (plan 17.10): Get paid. The press's own Stripe or Square account, connected through the platform
 * (plan 7.9): one button sends the press to that company's own secure page and back. The step ticks itself on through
 * "Continue" once cards and payouts work. "Set up later" is always there; the final check keeps the card blocker until
 * they work. No key or account ID is ever shown.
 */
export function PaymentsStage({ provider, onDone }: {
  provider: "stripe" | "square";
  onDone: (payments: PaymentsMarker) => Promise<void>;
}) {
  const name = providerName(provider);
  const [answer, setAnswer] = useState<PlatformPaymentsAnswer | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState<null | "status" | "connect" | "save">("status");
  const [error, setError] = useState("");
  // Read once: the company sends the press back here after its page. The flag is then taken out of the address.
  const [notice] = useState<ReturnNotice | null>(() => (typeof window === "undefined" ? null : returnNotice(window.location.search)));

  const load = async () => {
    setBusy("status");
    setLoadError(false);
    try {
      setAnswer(await adminApi.platformPayments("status"));
    } catch {
      setAnswer(null);
      setLoadError(true);
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    if (notice) {
      try { window.history.replaceState(window.history.state, "", withoutReturnFlags(window.location.href)); } catch { /* the notice still shows */ }
    }
    load();
  }, []);

  const finish = async (outcome: "ready" | "skipped") => {
    if (busy) return;
    setBusy("save");
    setError("");
    try {
      await onDone(paymentsMarker(new Date().toISOString(), outcome));
    } catch (e) {
      setError(friendlyError(e, "save your payments"));
      setBusy(null);
    }
  };

  // Each press asks for a fresh page: the company's links work once, for a few minutes, and are never emailed.
  const connect = async () => {
    if (busy) return;
    setBusy("connect");
    setError("");
    try {
      const link = await adminApi.platformPayments("connect");
      if (!link.url) throw new Error(`${name} didn't give a page to open.`);
      window.location.assign(link.url);
    } catch (e) {
      setError(friendlyError(e, `open ${name}`));
      setBusy(null);
    }
  };

  const title = "Get started · Step 5 of 8: get paid";
  const description = "Shoppers pay by card, and the money goes to your own bank account, not to Colophon. Set this up before your first real order.";

  if (loadError) {
    return (
      <SectionCard title={title} description={description} collapsible={false}>
        <p role="alert" className="rp-hint" style={{ margin: 0, color: "var(--rp-danger)" }}>Your {name} account couldn't be checked. Check your connection.</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
          <SecondaryButton size="sm" disabled={!!busy} onClick={load}>Try again</SecondaryButton>
          <SecondaryButton disabled={!!busy} onClick={() => finish("skipped")}>Set up later</SecondaryButton>
        </div>
        {error && <p role="alert" className="rp-hint" style={{ margin: "12px 0 0", color: "var(--rp-danger)" }}>{error}</p>}
      </SectionCard>
    );
  }
  if (!answer) return <SectionCard title={title} collapsible={false}><LoadingState label={`Checking your ${name} account…`} /></SectionCard>;

  const ready = paymentsReady(answer);
  const connected = accountConnected(answer);
  const needs = needsLine(answer);
  const pastDue = answer.pastDue === true;
  const connectLabel = provider === "square" ? (connected ? "Reconnect Square" : "Connect Square") : CONTINUE_WITH_STRIPE;

  return (
    <SectionCard title={title} description={description} collapsible={false}>
      <div style={{ display: "grid", gap: 14 }}>
        {notice && <p role="status" style={{ margin: 0, padding: 12, border: `2px solid var(--rp-${notice.tone})`, background: `var(--rp-${notice.tone}-tint)` }}>{notice.text}</p>}

        {ready ? (
          <p style={{ margin: 0 }}>{provider === "square" ? "Square is connected and taking cards." : `${name} is connected. Cards and payouts are working.`}</p>
        ) : needs ? (
          <p role={pastDue ? "alert" : undefined} style={{ margin: 0, padding: 12, border: `2px solid var(--rp-${pastDue ? "danger" : "warning"})`, background: `var(--rp-${pastDue ? "danger" : "warning"}-tint)` }}>
            {needs} Press <strong>{connectLabel}</strong>; it takes a few minutes.
          </p>
        ) : connected ? (
          <p className="rp-hint" style={{ margin: 0 }}>{name} hasn't turned on card payments for this account yet. Press {connectLabel} to finish anything it asks for.</p>
        ) : (
          <p className="rp-hint" style={{ margin: 0 }}>{name} isn't connected yet. Press {connectLabel}. {name}'s own secure page asks for what it needs, and you come straight back here.</p>
        )}

        <div className="rp-card" style={{ padding: 16, boxShadow: "none", background: "var(--rp-surface-sunken)" }}>
          <div className="rp-sect">Payouts &amp; Colophon's fee</div>
          <p style={{ margin: 0 }}>{feeLine(answer.platformFee)}</p>
        </div>

        {error && <p role="alert" className="rp-hint" style={{ margin: 0, color: "var(--rp-danger)" }}>{error}</p>}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
        {ready ? (
          <PrimaryButton disabled={!!busy} onClick={() => finish("ready")}>{busy === "save" ? "Saving…" : "Continue"}</PrimaryButton>
        ) : (
          <PrimaryButton disabled={!!busy} onClick={connect}>{busy === "connect" ? "Opening…" : connectLabel}</PrimaryButton>
        )}
        <SecondaryButton size="sm" disabled={!!busy} onClick={load}>Check again</SecondaryButton>
        {!ready && <SecondaryButton disabled={!!busy} onClick={() => finish("skipped")}>Set up later</SecondaryButton>}
      </div>
    </SectionCard>
  );
}
