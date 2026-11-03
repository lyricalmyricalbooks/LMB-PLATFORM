// The book page's "Stock and sales" tab in the combined admin (shop + stockroom plan; docs/combined-admin.md step 2):
// one book's copies on hand, where they are, and its sales on every channel, as the stockroom counts them. The
// stockroom stays the master count, so the figures are asked of it (stockroomBridge.ts) and changed there.
import { useEffect, useState } from "react";
import { DataTable, EmptyState, ErrorState, LoadingState, MetricCard, PrimaryButton, SecondaryButton, SectionCard } from "./riso/components";
import { inventoryLinkApi } from "./inventoryLinkApi";
import type { InventoryLinks } from "./inventoryLink";
import { stockroomBridge, type StockroomBook, type StockroomMatch } from "./stockroomBridge";


/** The stockroom's channel names, in the words the rest of the admin uses. */
export const CHANNEL_WORDS: Record<string, string> = {
  Website: "Website", "Book Fair": "Fairs and markets", "In Person": "In person", Consignment: "Stockists",
  Direct: "In person", Retail: "Shops", Other: "Other",
};
export const channelWords = (chan: string) => CHANNEL_WORDS[chan] || chan;

function Refusal({ words }: { words: (t: string) => string }) {
  return <EmptyState inline title={words("The stockroom on this device is signed in as an author")}
    description={words("Stock and sales show here for the press. Sign in to the stockroom as yourself, then open this book again.")} />;
}

export function money(amount: number, cur: string): string {
  if (!cur) return amount.toFixed(2);
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: cur }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${cur}`.trim();
  }
}

const copies = (n: number) => `${n} ${n === 1 ? "copy" : "copies"}`;

/** The stockroom books this website book (or its editions) is matched to: [edition name, stockroom id]. */
export function linkedStockroomBooks(links: InventoryLinks, bookId: string, variants: { id?: string; name?: string }[] = []): { edition: string | null; id: string }[] {
  const entry = links?.[bookId] || {};
  return Object.entries(entry).filter(([, id]) => typeof id === "string" && id).map(([variant, id]) => ({
    edition: variant === "_" ? null : variants.find((v) => v.id === variant)?.name || "An edition",
    id,
  }));
}

type Refused = { refused: true };

const askBook = (id: string) => stockroomBridge.askUntil<StockroomBook | { missing: true } | Refused>({ what: "book", book: id });
const askMatch = (isbn: string, title: string) => stockroomBridge.askUntil<{ match: StockroomMatch | null } | Refused>({ what: "find", isbn, title });

function BookFigures({ edition, id, words, onOpen }: { edition: string | null; id: string; words: (t: string) => string; onOpen: (id: string) => void }) {
  const [state, setState] = useState<{ book?: StockroomBook; missing?: boolean; failed?: boolean; refused?: boolean } | null>(null);
  const [tries, setTries] = useState(0);
  useEffect(() => {
    let alive = true;
    setState(null);
    void askBook(id).then((answer) => {
      if (!alive) return;
      if (!answer) setState({ failed: true });
      else if ("refused" in answer) setState({ refused: true });
      else if ("missing" in answer) setState({ missing: true });
      else setState({ book: answer });
    });
    return () => { alive = false; };
  }, [id, tries]);

  const title = edition ? `In the stockroom: ${edition}` : "In the stockroom";
  if (!state) return <SectionCard title={title}><LoadingState label="Asking the stockroom…" /></SectionCard>;
  if (state.failed) {
    return (
      <SectionCard title={title}>
        <ErrorState title="The stockroom didn't answer" description="It may still be opening, or this device is offline. Your stock is safe in the stockroom." onRetry={() => setTries((n) => n + 1)} />
      </SectionCard>
    );
  }
  if (state.refused) return <SectionCard title={title}><Refusal words={words} /></SectionCard>;
  if (state.missing || !state.book) {
    return (
      <SectionCard title={title}>
        <EmptyState inline title={words("This book isn't in the stockroom any more")} description="Match it again on Inventory › Inventory app link." />
      </SectionCard>
    );
  }
  const b = state.book;
  const where = [...b.places.map((p) => ({ key: `place:${p.name}`, name: p.name, kind: "Your place", qty: p.qty })),
    ...(b.author ? [{ key: "author", name: words("With the author"), kind: words("Author"), qty: b.author }] : []),
    ...b.stockists.map((p) => ({ key: `store:${p.name}`, name: p.name, kind: "Stockist", qty: p.qty }))];
  return (
    <SectionCard title={title} description={`“${b.title}” · counted in the stockroom`}
      actions={<SecondaryButton onClick={() => onOpen(id)}>Change stock in the stockroom</SecondaryButton>}>
      <div className="rp-kpi-grid">
        <MetricCard label="On hand" value={b.onHand} footer={b.author ? `${copies(b.publisher)} with you · ${copies(b.author)} with the author` : "All with you"} />
        <MetricCard label="At stockists" value={b.onConsignment} footer={b.stockists.length ? `${b.stockists.length} ${b.stockists.length === 1 ? "shop" : "shops"}` : "None out"} />
        <MetricCard label="Sold, every channel" value={b.sold} footer={b.lastSale ? `Last sale ${b.lastSale}` : "No sales yet"} />
      </div>
      {where.length > 0 && (
        <DataTable caption="Where the copies are" rowKey={(r) => r.key} rows={where} stackOnPhone
          columns={[
            { key: "name", header: "Where", lead: true, render: (r: (typeof where)[number]) => r.name },
            { key: "kind", header: "Kind", render: (r: (typeof where)[number]) => r.kind },
            { key: "qty", header: "Copies", numeric: true, render: (r: (typeof where)[number]) => r.qty },
          ]} />
      )}
      {b.channels.length > 0 ? (
        <DataTable caption="Where it sells" rowKey={(r) => `${r.chan}:${r.cur}`} rows={b.channels} stackOnPhone
          columns={[
            { key: "chan", header: "Channel", lead: true, render: (r: StockroomBook["channels"][number]) => channelWords(r.chan) },
            { key: "units", header: "Copies sold", numeric: true, render: (r: StockroomBook["channels"][number]) => r.units },
            { key: "revenue", header: "Takings", numeric: true, render: (r: StockroomBook["channels"][number]) => money(r.revenue, r.cur) },
          ]} />
      ) : (
        <EmptyState inline title="No sales yet" description="Sales from the website, the fair till, stockists and invoices all show here." />
      )}
    </SectionCard>
  );
}

/**
 * The tab itself. `links` are the matches between website books and stockroom books (Inventory › Inventory app link);
 * an unmatched book gets the stockroom's best guess and one button to match it.
 */
export function StockroomBookPanel({ book, links, linksFailed, onLinks, words, onOpen }: {
  book: { id: string; title?: string; isbn?: string; variants?: { id?: string; name?: string }[] };
  links: InventoryLinks;
  linksFailed: boolean;
  onLinks: (links: InventoryLinks) => void;
  words: (text: string) => string;
  onOpen: (stockroomBookId: string) => void;
}) {
  const linked = linkedStockroomBooks(links, book.id, book.variants);
  const [guess, setGuess] = useState<StockroomMatch | null | undefined | "refused" | "failed">(undefined);
  const [tries, setTries] = useState(0);
  // A book with editions is matched edition by edition, on Inventory › Inventory app link.
  const editions = (book.variants || []).length > 0;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (linked.length || linksFailed || editions) return;
    let alive = true;
    setGuess(undefined);
    void askMatch(book.isbn || "", book.title || "").then((answer) => {
      if (!alive) return;
      setGuess(!answer ? "failed" : "refused" in answer ? "refused" : answer.match);
    });
    return () => { alive = false; };
  }, [book.id, book.isbn, book.title, linked.length, linksFailed, editions, tries]);

  if (linksFailed) {
    return <SectionCard title="In the stockroom"><ErrorState title="Couldn't check the match with the stockroom" description={words("Close this book and open it again.")} /></SectionCard>;
  }
  if (linked.length) {
    return <>{linked.map((l) => <BookFigures key={l.id} edition={l.edition} id={l.id} words={words} onOpen={onOpen} />)}</>;
  }
  if (editions) {
    return (
      <SectionCard title="In the stockroom">
        <EmptyState inline title={words("Match each edition with the stockroom")}
          description={words("This book has editions, and each one is counted on its own. Match them on Inventory › Inventory app link, and their stock and sales show here.")} />
      </SectionCard>
    );
  }
  const match = async () => {
    if (!guess || typeof guess === "string") return;
    setBusy(true); setError("");
    try {
      const result = await inventoryLinkApi.linkNewBook(book.id, guess.id);
      onLinks(result.links);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't match them. Try again in a minute.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <SectionCard title="In the stockroom" description={words("Match this book with the stockroom's copy of it, and its stock and sales show here.")}>
      {guess === undefined && <LoadingState label="Looking in the stockroom…" />}
      {guess === "refused" && <Refusal words={words} />}
      {guess === "failed" && <ErrorState title="The stockroom didn't answer" description="It may still be opening, or this device is offline." onRetry={() => setTries((n) => n + 1)} />}
      {guess === null && (
        <EmptyState inline title={words("No matching book in the stockroom")}
          description={words("Add it in the stockroom, or match it by hand on Inventory › Inventory app link.")} />
      )}
      {guess && typeof guess !== "string" && (
        <EmptyState inline title={`This looks like “${guess.title}” in your stockroom`}
          description={guess.by === "isbn" ? "Same ISBN." : words("Same title. Check it is the same book before you match them.")}
          action={<PrimaryButton onClick={match} disabled={busy}>{busy ? "Matching…" : "Match them"}</PrimaryButton>} />
      )}
      {error && <p className="be-note" role="alert">{error}</p>}
    </SectionCard>
  );
}
