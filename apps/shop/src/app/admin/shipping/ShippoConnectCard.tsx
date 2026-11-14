import { useEffect, useState, type ReactNode } from "react";
import toast from "react-hot-toast";
import { adminApi } from "../api";
import { PrimaryButton, SecondaryButton, SectionCard, StatusBadge, useConfirm } from "../riso/components";
import { shippoReturn, shippoReturnWords } from "./shippoReturn";

type Props = {
  /** The shop's Shippo record says connected (getShippoConfig). */
  connected: boolean;
  /** Read the Shippo record again after a change. */
  onChanged: () => void;
  /** The live-rate switch and countries, shown once connected. */
  children?: ReactNode;
  openSignIn?: (url: string) => void;
};

// Settings › Shipping › Carrier on a Colophon shop: the press connects its own Shippo account (functions/shippoLink.js,
// LMB-PLATFORM services/shippo/link.js). Shippo is free; postage is paid to Shippo by the press. Opens soon until
// Colophon's Shippo sign-in is set up on the platform.
export function ShippoConnectCard({ connected, onChanged, children, openSignIn = (url) => window.location.assign(url) }: Props) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<"connect" | "finish" | "disconnect" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirm, confirmNode] = useConfirm();

  useEffect(() => {
    let live = true;
    // Back from Shippo: finish with the one-use ticket, then take both words off the address.
    const back = shippoReturn(window.location.search);
    if (back.outcome) {
      const params = new URLSearchParams(window.location.search);
      params.delete("shippo");
      params.delete("shippoTicket");
      const rest = params.toString();
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${rest ? `?${rest}` : ""}${window.location.hash}`);
      if (back.ticket) {
        setBusy("finish");
        adminApi.shippoLink("finish", { ticket: back.ticket })
          .then(() => { toast.success("Shippo is connected"); onChanged(); })
          .catch((err) => { if (live) setProblem(err?.message || "Shippo didn't finish the connection. Press Connect Shippo again."); })
          .finally(() => { if (live) setBusy(null); });
      } else {
        setProblem(shippoReturnWords(back.outcome));
      }
    }
    adminApi.shippoLink("status")
      .then((s) => { if (live) setAvailable(s.available === true); })
      .catch(() => { if (live) setAvailable(false); });
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const connect = async () => {
    setBusy("connect");
    setProblem(null);
    try {
      const { url } = await adminApi.shippoLink("connect", { returnUrl: `${window.location.origin}${window.location.pathname}${window.location.hash}` });
      if (url) openSignIn(url);
    } catch (err: any) {
      setProblem(err?.message || "Couldn't open Shippo. Try again in a minute.");
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async () => {
    const yes = await confirm({ title: "Disconnect Shippo?", message: "Checkout goes back to the prices in your profiles, and you can't buy labels here until you connect again.", confirmLabel: "Disconnect" });
    if (!yes) return;
    setBusy("disconnect");
    setProblem(null);
    try {
      await adminApi.shippoLink("disconnect");
      toast.success("Shippo is disconnected");
      onChanged();
    } catch (err: any) {
      setProblem(err?.message || "Couldn't disconnect. Try again in a minute.");
    } finally {
      setBusy(null);
    }
  };

  const soon = available === false && !connected;
  return (
    <SectionCard title="Live rates and labels"
      description={soon ? "Opens soon." : "Carriers' live prices at checkout, and labels."}
      actions={connected ? <StatusBadge tone="success">Connected</StatusBadge> : soon ? <StatusBadge>Opens soon</StatusBadge> : undefined}>
      {confirmNode}
      {busy === "finish" && <p role="status" className="rp-hint" style={{ margin: 0 }}>Finishing the connection…</p>}
      {problem && <p role="alert" style={{ margin: 0, color: "var(--rp-danger)", fontWeight: 600 }}>{problem}</p>}
      {connected ? (
        <div className="rp-stack" style={{ gap: 16 }}>
          {children}
          <div className="rp-card-actions">
            <SecondaryButton onClick={disconnect} disabled={busy !== null}>{busy === "disconnect" ? "Disconnecting…" : "Disconnect"}</SecondaryButton>
          </div>
        </div>
      ) : soon ? (
        <p className="rp-hint" style={{ margin: 0 }}>Until then, shoppers pay the prices in your profiles.</p>
      ) : (
        <div className="rp-stack" style={{ gap: 12 }}>
          <p className="rp-hint" style={{ margin: 0 }}>Connect your own free Shippo account. You pay postage to Shippo at its carrier discounts.</p>
          <div className="rp-card-actions">
            <PrimaryButton onClick={connect} disabled={busy !== null || available === null}>{busy === "connect" ? "Opening Shippo…" : "Connect Shippo"}</PrimaryButton>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
