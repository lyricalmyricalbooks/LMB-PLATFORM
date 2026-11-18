// The book page's "Stock and sales" tab in the combined admin (shop + stockroom plan; docs/combined-admin.md step 2):
// one book's copies on hand, where they are, and its sales on every channel, as the stockroom counts them. The
// stockroom stays the master count, so the figures are asked of it (stockroomBridge.ts) and changed there.
import { useEffect, useState } from "react";
import { DataTable, EmptyState, ErrorState, LoadingState, MetricCard, PrimaryButton, SecondaryButton, SectionCard, SelectField } from "./riso/components";
import { inventoryLinkApi } from "./inventoryLinkApi";
import { linkedTo, type InventoryAppBook, type InventoryLinks } from "./inventoryLink";
import { stockroomBridge, type StockroomBook, type StockroomMatch } from "./stockroomBridge";
import { applyShelfCount, shelfCountPlan, shelfCountWords } from "./shelfCount";
import { describeResult, stockroomWriteApi } from "./stockroom/stockroomWrite";
import { localDay } from "@stockroom/calendar-day.js";


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
        <EmptyState inline title={words("This book isn't in the stockroom any more")} description="Add it in the stockroom again, and its stock and sales show here." />
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
      <ShelfCount book={b} id={id} words={words} onSaved={() => { stockroomBridge.forget(); setTries((n) => n + 1); }} onOpen={() => onOpen(id)} />
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
 * Fix stock from the product page (simpler admin, change 11): count your own copies and the stockroom's records follow,
 * written the stockroom's way (a write-off, or a plain count moved), so the stockroom stays the one true count.
 */
function ShelfCount({ book, id, words, onSaved, onOpen }: { book: StockroomBook; id: string; words: (t: string) => string; onSaved: () => void; onOpen: () => void }) {
  const [count, setCount] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: string; text: string } | null>(null);
  const typed = count.trim() === "" ? null : Number(count);
  const valid = typed !== null && Number.isInteger(typed) && typed >= 0;
  const plan = valid ? shelfCountPlan(book, typed) : null;
  const copiesOf = (n: number) => words(`${n} ${n === 1 ? "copy" : "copies"}`);
  const save = async () => {
    const change = plan && applyShelfCount(plan, localDay(), `count-${Date.now()}`);
    if (!change || busy) return;
    setBusy(true); setMsg(null);
    try {
      const result = await stockroomWriteApi.saveBookState(id, change);
      const said = describeResult(result);
      if (result.status === "saved" || result.status === "unchanged") { setCount(""); setMsg({ tone: "ok", text: "Saved. The stockroom shows your count now." }); onSaved(); }
      else setMsg(said);
    } catch {
      setMsg({ tone: "error", text: "Nothing was saved. Try again." });
    }
    setBusy(false);
  };
  return (
    <div className="be-shelf-count">
      <div className="be-shelf-row">
        <label className="be-shelf-field">
          <span>{words("Copies on your shelf")}</span>
          <input type="number" min={0} step={1} inputMode="numeric" value={count} placeholder={String(book.publisher)}
            onChange={(e) => { setCount(e.target.value); setMsg(null); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void save(); } }} />
        </label>
        <PrimaryButton disabled={!plan || plan.kind === "same" || plan.kind === "more"} busy={busy} onClick={() => void save()}>Fix the count</PrimaryButton>
      </div>
      <p className="rp-hint" role="status" style={{ margin: 0 }}>
        {msg ? msg.text : plan ? shelfCountWords(plan, copiesOf) : words(`The stockroom says ${copiesOf(book.publisher)} with you. Counted something different? Type what's there.`)}
        {plan?.kind === "more" && <> <button type="button" className="rp-link" onClick={onOpen}>Open it in the stockroom</button></>}
      </p>
    </div>
  );
}

type Edition = { id?: string; name?: string; isbn?: string; format?: string; digital?: boolean };
type PanelBook = { id: string; title?: string; isbn?: string; format?: string; digital?: boolean; variants?: Edition[] };

// Same test as the server's isDigitalEdition (functions/inventoryLink.js): e-books aren't counted in the stockroom.
const DIGITAL_RE = /e-?book|epub|pdf|audiobook|digital/i;
const isDigital = (book: PanelBook, v: Edition) => v.digital === true
  || (v.format ? DIGITAL_RE.test(String(v.format)) : book.digital === true || DIGITAL_RE.test(String(book.format || "")));

/** The editions the stockroom can count: every edition with an id that isn't an e-book. */
export function printedEditions(book: PanelBook): (Edition & { id: string })[] {
  return (book.variants || []).filter((v): v is Edition & { id: string } => !!v?.id && !isDigital(book, v));
}

const digits = (v: unknown) => String(v || "").replace(/[^0-9Xx]/g, "").toUpperCase();
const plain = (v: unknown) => String(v || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * The stockroom book an edition most likely is: the one with its ISBN, else the one called "Title Edition",
 * else the only one with the book's title. `taken` holds stockroom books other products already use.
 */
export function guessEdition(edition: Edition, title: string, catalog: InventoryAppBook[], taken: Set<string>): string {
  const free = catalog.filter((b) => !taken.has(b.id));
  const isbn = digits(edition.isbn);
  if (isbn.length >= 10) {
    const hits = free.filter((b) => digits(b.isbn) === isbn);
    if (hits.length === 1) return hits[0].id;
  }
  const full = plain(`${title} ${edition.name || ""}`);
  const named = free.filter((b) => plain(b.title) === full);
  if (named.length === 1) return named[0].id;
  const same = free.filter((b) => plain(b.title) === plain(title));
  return same.length === 1 ? same[0].id : "";
}

/** Stockroom books matched to other products (editions of this one may share a pile, other products may not). */
export function takenElsewhere(links: InventoryLinks, bookId: string): Set<string> {
  const out = new Set<string>();
  for (const [id, entry] of Object.entries(links || {})) {
    if (id === bookId) continue;
    for (const inv of Object.values(entry || {})) if (typeof inv === "string" && inv) out.add(inv);
  }
  return out;
}

/** The unmatched printed editions of one product, each with a stockroom book to pick and a Match button. */
function EditionMatches({ book, editions, links, onLinks, words }: {
  book: PanelBook; editions: (Edition & { id: string })[]; links: InventoryLinks;
  onLinks: (links: InventoryLinks) => void; words: (t: string) => string;
}) {
  const [catalog, setCatalog] = useState<InventoryAppBook[] | null | "failed">(null);
  const [tries, setTries] = useState(0);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    setCatalog(null);
    inventoryLinkApi.catalog().then((r) => { if (alive) setCatalog(r.books || []); }, () => { if (alive) setCatalog("failed"); });
    return () => { alive = false; };
  }, [tries]);

  const title = words("Match each edition with the stockroom");
  const description = words("Each edition is counted on its own in the stockroom. Editions may share one pile of copies.");
  if (catalog === null) return <SectionCard title={title}><LoadingState label="Looking in the stockroom…" /></SectionCard>;
  if (catalog === "failed") {
    return (
      <SectionCard title={title}>
        <ErrorState title="The stockroom didn't answer" description="It may still be opening, or this device is offline." onRetry={() => setTries((n) => n + 1)} />
      </SectionCard>
    );
  }
  const taken = takenElsewhere(links, book.id);
  const choices = catalog.filter((b) => !taken.has(b.id)).sort((a, b) => a.title.localeCompare(b.title));
  if (!choices.length) {
    return (
      <SectionCard title={title}>
        <EmptyState inline title={words("No free books in the stockroom")} description={words("Add this book in the stockroom, then match its editions here.")} />
      </SectionCard>
    );
  }
  const chosen = (e: Edition & { id: string }) => picked[e.id] ?? guessEdition(e, book.title || "", catalog, taken);
  const match = async (e: Edition & { id: string }) => {
    const inv = chosen(e);
    if (!inv) return;
    setBusy(e.id); setError("");
    try {
      const result = await inventoryLinkApi.linkNewBook(book.id, inv, e.id);
      onLinks(result.links);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't match them. Try again in a minute.");
    } finally {
      setBusy("");
    }
  };
  const label = (b: InventoryAppBook) => `${b.title}${b.isbn ? ` · ${b.isbn}` : ""}${b.onHand != null ? ` · ${words(copies(b.onHand))}` : ""}`;
  return (
    <SectionCard title={title} description={description}>
      <div className="be-edition-matches">
      <DataTable caption={words("Editions to match")} rowKey={(e) => e.id} rows={editions} stackOnPhone
        columns={[
          { key: "edition", header: words("Edition"), lead: true, render: (e: Edition & { id: string }) => e.name || words("Edition") },
          { key: "book", header: words("Stockroom book"), render: (e: Edition & { id: string }) => (
            <div className="be-edition-pick">
              <SelectField label={`${words("Stockroom book")}: ${e.name || words("this edition")}`} hideLabel value={chosen(e)}
                onChange={(ev) => setPicked((p) => ({ ...p, [e.id]: ev.target.value }))}>
                <option value="">Choose…</option>
                {choices.map((b) => <option key={b.id} value={b.id}>{label(b)}</option>)}
              </SelectField>
              <PrimaryButton onClick={() => match(e)} disabled={!!busy || !chosen(e)}>{busy === e.id ? "Matching…" : "Match"}</PrimaryButton>
            </div>
          ) },
        ]} />
      </div>
      {error && <p className="be-note" role="alert">{error}</p>}
    </SectionCard>
  );
}

/**
 * The tab itself. `links` are the matches between website books and stockroom books (kept by the server);
 * an unmatched book gets the stockroom's best guess and one button to match it.
 */
export function StockroomBookPanel({ book, links, linksFailed, onLinks, words, onOpen }: {
  book: PanelBook;
  links: InventoryLinks;
  linksFailed: boolean;
  onLinks: (links: InventoryLinks) => void;
  words: (text: string) => string;
  onOpen: (stockroomBookId: string) => void;
}) {
  const linked = linkedStockroomBooks(links, book.id, book.variants);
  const [guess, setGuess] = useState<StockroomMatch | null | undefined | "refused" | "failed">(undefined);
  const [tries, setTries] = useState(0);
  // A book with editions is matched edition by edition (EditionMatches), not as a whole.
  const editions = (book.variants || []).length > 0;
  const printed = editions ? printedEditions(book) : [];
  const unmatched = printed.filter((e) => !linkedTo(links, book.id, e.id));
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
  if (editions) {
    return (
      <>
        {unmatched.length > 0 && <EditionMatches book={book} editions={unmatched} links={links} onLinks={onLinks} words={words} />}
        {linked.map((l) => <BookFigures key={`${l.edition}:${l.id}`} edition={l.edition} id={l.id} words={words} onOpen={onOpen} />)}
        {!printed.length && (
          <SectionCard title="In the stockroom">
            <EmptyState inline title={words("Nothing to count")} description={words("E-books aren't counted in the stockroom.")} />
          </SectionCard>
        )}
      </>
    );
  }
  if (linked.length) {
    return <>{linked.map((l) => <BookFigures key={l.id} edition={l.edition} id={l.id} words={words} onOpen={onOpen} />)}</>;
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
          description={words("Add it in the stockroom, and its stock and sales show here.")} />
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
