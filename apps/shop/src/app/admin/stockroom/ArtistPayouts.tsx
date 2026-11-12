// Bookkeeping › Artist payouts (mockup, 12 November 2026; book shops only): what the press owes each book's artist,
// or is owed, from the stockroom's own settle-up rules (authorMoney.ts). Each book is settled on its own page (Stock ›
// the book › Author money), so a row opens that book; there is no one-click run for every artist.
import { useMemo } from "react";
import { fmt, fmtD } from "@stockroom/money.js";

import { DataTable, EmptyState, GhostButton } from "../riso/components";
import { useShopWords } from "../shopWords";
import { authorMoneyPlan, pastSettlements } from "./authorMoney";
import type { StockroomRecords } from "./stockroomData";

type Row = Record<string, any>;

export type ArtistRow = { bookId: string; artist: string; title: string; currency: string; sold: number; split: string; owed: number; direction: string; lastSettled: string };

/** One row per book with an artist share set. Pure. */
export function artistRows(records: StockroomRecords): ArtistRow[] {
  const rows: ArtistRow[] = [];
  for (const book of records.books as Row[]) {
    const state = (records.states[book.id] || {}) as Row;
    const plan = authorMoneyPlan(book, state);
    if (!plan) continue;
    const tiers = Array.isArray(book.profitTiers) ? book.profitTiers : [];
    const pct = tiers.length === 1 ? Number(tiers[0]?.artistPct) : NaN;
    const last = pastSettlements(state)[0];
    rows.push({
      bookId: book.id, artist: String(book.author || ""), title: String(book.title || book.id), currency: String(book.currency || "CAD"),
      // Copies sold since the last settle-up (the sales the plan holds), by the stockroom's own test.
      sold: ((state.hist || []) as Row[]).filter((h) => !h.voided && !h.gratuity && h.artistPending && h.qty > 0 && h.price > 0)
        .reduce((n, h) => n + Number(h.qty), 0),
      // Press / artist, as the mockup writes it; a book with several tiers says so.
      split: Number.isFinite(pct) && pct > 0 && pct < 100 ? `${100 - pct} / ${pct}` : tiers.length > 1 ? "Tiered" : "",
      owed: plan.error ? 0 : plan.balance.amount, direction: plan.error ? "settled" : plan.balance.direction,
      lastSettled: String(last?.date || ""),
    });
  }
  return rows.sort((a, b) => (a.direction === "to-artist" ? 0 : 1) - (b.direction === "to-artist" ? 0 : 1) || b.owed - a.owed);
}

export function ArtistPayouts({ records, onOpenBook }: { records: StockroomRecords; onOpenBook?: (bookId: string) => void }) {
  const w = useShopWords();
  const rows = useMemo(() => artistRows(records), [records]);
  const owing = rows.filter((r) => r.direction === "to-artist");
  const currencies = [...new Set(owing.map((r) => r.currency))];
  const owedText = currencies.length ? currencies.map((c) => fmt(owing.filter((r) => r.currency === c).reduce((s, r) => s + r.owed, 0), c)).join(" + ") : fmt(0, rows[0]?.currency || "CAD");
  const artists = new Set(owing.map((r) => r.artist || r.title)).size;
  return (
    <div className="rp-money">
      <div className="rp-bk-tiles">
        <div className="rp-tax-tile" data-tone="apricot">
          <p className="rp-tax-tile-label">{w("Owed to artists")}</p>
          <p className="rp-tax-tile-value">{owedText}</p>
          <p className="rp-tax-tile-foot">{artists ? `${artists} ${artists === 1 ? "artist" : "artists"} to pay` : "Everyone is paid"}</p>
        </div>
        <div className="rp-tax-tile">
          <p className="rp-tax-tile-label">{w("Books with an artist share")}</p>
          <p className="rp-tax-tile-value">{rows.length}</p>
          <p className="rp-tax-tile-foot">Payouts are left out of expenses</p>
        </div>
      </div>
      <div className="rp-card rp-money-list">
        <DataTable stackOnPhone caption={w("Artist payouts")} rowKey={(r) => r.bookId} rows={rows}
          empty={<EmptyState inline title="No artist shares yet" description={w("Set an artist's share in a book's details and what you owe them shows here.")} />}
          columns={[
            { key: "a", header: "Artist", lead: true, render: (r) => <>{r.artist || "No name"}<div className="rp-hint">{r.title}</div></> },
            { key: "s", header: "Sold", numeric: true, render: (r) => `${r.sold} ${r.sold === 1 ? w("book") : w("books")}` },
            { key: "p", header: "Split", render: (r) => r.split || "-" },
            { key: "o", header: "Owed", numeric: true, render: (r) => (r.direction === "to-publisher" ? `They owe ${fmt(r.owed, r.currency)}` : fmt(r.direction === "to-artist" ? r.owed : 0, r.currency)) },
            { key: "t", header: "Status", render: (r) => (r.direction === "settled" ? (r.lastSettled ? `Paid ${fmtD(r.lastSettled)}` : "Settled") : r.lastSettled ? `Last paid ${fmtD(r.lastSettled)}` : "Not paid yet") },
            ...(onOpenBook ? [{ key: "x", header: "", render: (r: ArtistRow) => <GhostButton size="sm" onClick={() => onOpenBook(r.bookId)}>{r.direction === "settled" ? "Open" : "Settle"}</GhostButton> }] : []),
          ]} />
      </div>
    </div>
  );
}
