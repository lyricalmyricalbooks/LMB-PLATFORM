import { useState } from "react";
import { ArrowRight, Megaphone } from "lucide-react";
import { GhostButton, PrimaryButton, SecondaryButton } from "../riso/components";
import { MONEY_SIGN } from "../moneySign";
import { useShopWords } from "../shopWords";
import type { Order } from "./overviewInsights";
import "./setupBoard.css";

/**
 * The first order's own moment on Home (sign-up to open shop plan, move 5): who bought, what to do next, and a way to
 * tell people again. Done puts it away for good (`firstWeek/start` › `done.firstOrder`).
 */
export function FirstOrderCard({ order, onDone, onOpen }: {
  order: Order;
  onDone: () => Promise<void>;
  /** Opens an admin page (Sales channels, for a post about it). */
  onOpen?: (tab: string) => void;
}) {
  const w = useShopWords();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const first = String(order.customer?.name || "").trim().split(/\s+/)[0];
  const who = first ? `${first} just bought from you.` : "Someone just bought from you.";
  const lines = (order.items || []).map((i) => String(i.title || "").trim()).filter(Boolean);
  const what = lines.length > 1 ? `${lines[0]} and ${lines.length - 1} more` : lines[0] || "";
  const total = typeof order.total === "number" ? `${MONEY_SIGN}${order.total.toFixed(2)}` : "";
  const done = async () => {
    setBusy(true);
    setProblem("");
    try { await onDone(); }
    catch { setProblem("That didn't save. Check your connection and try again."); setBusy(false); }
  };
  return (
    <div className="rp-sb" data-first-order="">
      <div className="rp-sb-row">
        <section className="rp-sb-tile rp-sb-big rp-sb-good" aria-labelledby="first-order-title">
          <p className="rp-sb-eyebrow">Your first order</p>
          <div style={{ marginTop: "auto", display: "grid", gap: 8 }}>
            <h2 id="first-order-title" className="rp-sb-title">{who}</h2>
            {(what || total) && <p>{[w(what), total].filter(Boolean).join(" · ")}</p>}
          </div>
          <div className="rp-sb-actions" style={{ marginTop: 0 }}>
            <PrimaryButton icon={<ArrowRight size={16} aria-hidden />} onClick={() => { window.location.hash = `#orders/${encodeURIComponent(order.id)}`; }}>Open the order</PrimaryButton>
            {onOpen && <SecondaryButton icon={<Megaphone size={16} aria-hidden />} onClick={() => onOpen("channels")}>Share the news</SecondaryButton>}
            <GhostButton disabled={busy} onClick={() => void done()}>Done</GhostButton>
          </div>
          {problem && <p role="alert" className="rp-hint" style={{ margin: 0, color: "var(--rp-danger)" }}>{problem}</p>}
        </section>
        <section className="rp-sb-tile" aria-labelledby="first-order-next">
          <p className="rp-sb-eyebrow" id="first-order-next">What to do next</p>
          <ol className="rp-sb-steps">
            <li><span><strong>Check the order.</strong> Make sure the address and the items look right.</span></li>
            <li><span><strong>{w("Pack it and mark it sent.")}</strong> Your customer gets an email to say it's on its way.</span></li>
            <li><span><strong>Tell people.</strong> A first sale is good news, and it brings the next one.</span></li>
          </ol>
        </section>
      </div>
    </div>
  );
}
