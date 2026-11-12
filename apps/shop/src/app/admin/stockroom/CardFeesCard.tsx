// Tax centre › Card fees for the year (cardFees.ts). Reads the website orders the page already loaded.
import { useState } from "react";
import { fmt } from "@stockroom/money.js";

import { DataTable, SecondaryButton, SectionCard, StatusBadge } from "../riso/components";
import { cardFeesForYear, cardFeesLoggedMinor, logCardFeesChange, type FeeLine } from "./cardFees";
import { describeResult, stockroomWriteApi } from "./stockroomWrite";

type Row = Record<string, any>;
const todayText = () => new Date().toLocaleDateString("en-CA");

export function CardFeesCard({ orders, year, taxCenter, onSaved }: { orders: Row[]; year: string; taxCenter: Row | null; onSaved?: (taxCenter: Row) => void }) {
  const { lines, missing } = cardFeesForYear(orders, year);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  if (!lines.length && !missing) return null;

  async function log(line: FeeLine) {
    setBusy(line.currency); setNote("");
    try {
      const r = await stockroomWriteApi.updateSetting("taxCenter", (current) => logCardFeesChange(line, year, todayText())(current as Row | null));
      if (r.status === "saved" || r.status === "unchanged") { onSaved?.((r.value as Row) || {}); setNote(`Logged ${fmt(line.feeMinor / 100, line.currency)} of card fees as an expense.`); }
      else setNote(describeResult(r).text);
    } catch { setNote("That didn't save. Nothing was changed."); }
    finally { setBusy(""); }
  }

  return (
    <SectionCard title={`Card fees, ${year}`} description="What the card provider kept from your website sales. You can deduct it." flush>
      <DataTable caption="Card fees" rows={lines} rowKey={(l) => l.currency} columns={[
        { key: "cur", header: "Currency", render: (l) => l.currency },
        { key: "orders", header: "Orders", render: (l) => l.orders },
        { key: "fee", header: "Fees", render: (l) => fmt(l.feeMinor / 100, l.currency) },
        { key: "act", header: "", render: (l) => {
          const logged = cardFeesLoggedMinor(taxCenter, year, l.currency);
          if (logged === l.feeMinor) return <StatusBadge tone="success">Logged</StatusBadge>;
          if (!onSaved) return logged === null ? null : <StatusBadge tone="warning">Logged {fmt(logged / 100, l.currency)}</StatusBadge>;
          // Logged earlier in the year: later orders' fees bring the same expense up to date.
          return <SecondaryButton size="sm" busy={busy === l.currency} disabled={!!busy || l.feeMinor <= 0} onClick={() => void log(l)}>{logged === null ? "Log as expense" : `Update from ${fmt(logged / 100, l.currency)}`}</SecondaryButton>;
        } },
      ]} />
      {missing > 0 && <p className="rp-hint">{missing} paid order{missing === 1 ? "'s fee isn't" : "s' fees aren't"} known yet. They fill in once the payout arrives.</p>}
      {note && <p className="rp-hint" role="status">{note}</p>}
    </SectionCard>
  );
}
