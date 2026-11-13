// Stockroom › Sell in person › Till, drawn by the admin itself (mockup "Stockroom-Sell_in_person"): tiles to tap on the
// left, the cart and four payment buttons on the right. A payment button records the sale at once on this device; it is
// stored in the stockroom's records a few seconds later (time to Undo a wrong tap), and waits on the device while there
// is no connection. Rules in till.ts; saves through stockroomWrite.ts (WRITING.md).
import { useEffect, useMemo, useRef, useState } from "react";
import { FAIR_UNDO_MS, fairDaySummary, readCurrentFair, registerSalesForDay, saveCurrentFair } from "@stockroom/fair-mode.js";
import { localDay } from "@stockroom/calendar-day.js";

import { Dialog, InkButton, PageActions, PrimaryButton, SecondaryButton, TextField } from "../riso/components";
import { FormChoice, FormField } from "../riso/FormKit";
import { useShopWords } from "../shopWords";
import type { NativePageProps } from "./nativePages";
import { RecordsGate } from "./RecordsGate";
import { stockroomApi, tillOnlyItems, type StockroomRecords } from "./stockroomData";
import { TillExtrasDialog } from "./TillExtrasDialog";
import { withExtraSale } from "./tillExtras";
import { MARKET_DAY_SHOWN_KEY, marketDayCard } from "./marketDay";
import { describeResult, stockroomWriteApi } from "./stockroomWrite";
import {
  ALL_METHODS, OTHER_METHODS, QUICK_CASH, SHEET_PAYS, addTillLine, cashChange, cartLines, findItems, leftFor, money, newTillSale, readQueue, tillItems,
  totalText, totalsOf, uploadLine, waitingCopies, writeQueue, type Cart, type SheetPay, type TillSale,
} from "./till";
import "./stockroom.css";
import "./till.css";
import { SHOP_CURRENCY } from "../moneySign";

const RETRYABLE = new Set(["offline", "read-failed", "write-failed"]);
const RETRY_MS = 30_000;

export function TillPage({ load = stockroomApi.load }: Partial<NativePageProps> & { load?: () => Promise<StockroomRecords> }) {
  return <RecordsGate what="the till" load={load}>{(records) => <Till records={records} />}</RecordsGate>;
}

const online = () => (typeof navigator === "undefined" ? true : navigator.onLine !== false);

export function Till({ records, now = () => Date.now() }: { records: StockroomRecords; now?: () => number }) {
  const w = useShopWords();
  const [states, setStates] = useState(records.states);
  const [cart, setCart] = useState<Cart>({});
  const [query, setQuery] = useState("");
  const [queue, setQueueState] = useState<TillSale[]>(() => readQueue());
  const queueRef = useRef(queue);
  const [kept, setKept] = useState(true);
  const [isOnline, setOnline] = useState(online);
  const [last, setLast] = useState<{ num: string; at: number; text: string } | null>(null);
  const [problem, setProblem] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const [dayOpen, setDayOpen] = useState(false);
  const today = localDay(new Date(now()));
  // The morning after a market day: shown once, then marked seen on this device (the old app's key).
  const [marketDay, setMarketDay] = useState(() => {
    let shown = "";
    try { shown = localStorage.getItem(MARKET_DAY_SHOWN_KEY) || ""; } catch { /* storage blocked */ }
    const card = marketDayCard(records, today, shown);
    if (card) try { localStorage.setItem(MARKET_DAY_SHOWN_KEY, card.day); } catch { /* storage blocked */ }
    return card?.title ? card : null;
  });
  const [fair, setFair] = useState(() => readCurrentFair(today)?.name || "");
  const flushing = useRef(false);
  const search = useRef<HTMLInputElement>(null);

  const [extras, setExtras] = useState(records.extras || []);
  const [extrasOpen, setExtrasOpen] = useState(false);
  const items = useMemo(() => tillItems({ ...records, states, extras }), [records, states, extras]);
  const books = useMemo(() => new Map(records.books.map((b) => [b.id, b])), [records.books]);
  const shown = useMemo(() => findItems(items, query), [items, query]);
  const waiting = useMemo(() => waitingCopies(queue), [queue]);
  const lines = cartLines(cart, items);
  const totals = totalsOf(lines);
  const short = lines.filter((l) => { const item = items.find((i) => i.id === l.id)!; const left = leftFor(item, waiting, cart); return left != null && left < 0; });

  const setQueue = (next: TillSale[]) => { queueRef.current = next; setQueueState(next); setKept(writeQueue(next)); };

  /** Store every sale old enough to be past its Undo, oldest first. Stops at the first connection problem. */
  async function flush() {
    if (flushing.current) return;
    flushing.current = true;
    try {
      for (const sale of [...queueRef.current]) {
        if (sale.problem || now() - sale.at < FAIR_UNDO_MS) continue;
        for (const line of sale.lines) {
          if (line.stored) continue;
          let result;
          // Not in the catalogue: a till-only item (its tally lives in the catalogue, never in stock records).
          const extra = !books.has(line.bookId);
          try {
            result = extra
              ? await stockroomWriteApi.updateSetting("catalog", withExtraSale(line.bookId, line.rowId, line.qty, line.price))
              : await stockroomWriteApi.saveBookState(line.bookId, addTillLine(sale, line, books.get(line.bookId)));
          }
          catch (error) { console.error("Till sale not stored", error); return; }
          if (extra && (result.status === "saved" || result.status === "unchanged")) {
            line.stored = true;
            setExtras(tillOnlyItems((result as { value: unknown }).value));
            setQueue(queueRef.current.map((s) => (s.num === sale.num && s.at === sale.at ? { ...sale } : s)));
            continue;
          }
          if (result.status === "saved" || result.status === "unchanged") {
            line.stored = true;
            setStates((s) => ({ ...s, [line.bookId]: (result as { state: unknown }).state as Record<string, unknown> }));
            setQueue(queueRef.current.map((s) => (s.num === sale.num && s.at === sale.at ? { ...sale } : s)));
            continue;
          }
          if (result.status === "failed" && RETRYABLE.has(result.reason)) return;
          sale.problem = describeResult(result).text;
          setQueue(queueRef.current.map((s) => (s.num === sale.num && s.at === sale.at ? { ...sale } : s)));
          setProblem(`A sale couldn't be stored: ${sale.problem}`);
          break;
        }
        if (sale.lines.every((l) => l.stored)) setQueue(queueRef.current.filter((s) => !(s.num === sale.num && s.at === sale.at)));
      }
    } finally {
      flushing.current = false;
    }
  }

  useEffect(() => {
    const up = () => { setOnline(true); void flush(); };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    void flush();
    const t = window.setInterval(() => { if (queueRef.current.length) void flush(); }, RETRY_MS);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); window.clearInterval(t); };
  }, []);

  const add = (id: string, by = 1) => setCart((c) => { const n = Math.max(0, (c[id] || 0) + by); const next = { ...c }; if (n) next[id] = n; else delete next[id]; return next; });

  function charge(method: string) {
    if (!lines.length) return;
    const sale = newTillSale(lines, method, fair, now());
    setQueue([...queueRef.current, sale]);
    setCart({});
    setPayOpen(false);
    const label = ALL_METHODS.find((m) => m.value === method)?.label || method;
    setLast({ num: sale.num, at: sale.at, text: `Sold · ${totalText(totals)} · ${label}` });
    window.setTimeout(() => { setLast((l) => (l && l.at === sale.at ? null : l)); void flush(); }, FAIR_UNDO_MS + 100);
  }

  function undo() {
    if (!last) return;
    const sale = queueRef.current.find((s) => s.num === last.num && s.at === last.at);
    if (sale && !sale.lines.some((l) => l.stored)) {
      setQueue(queueRef.current.filter((s) => s !== sale));
      setCart(Object.fromEntries(sale.lines.map((l) => [l.bookId, l.qty])));
    }
    setLast(null);
  }

  const upload = uploadLine({ online: isOnline, waiting: queue.length, kept });
  const stuck = queue.filter((s) => s.problem);

  return (
    <div className="rp-till">
      <PageActions>
        <SecondaryButton onClick={() => setExtrasOpen(true)}>Till-only items</SecondaryButton>
        <SecondaryButton onClick={() => setEventOpen(true)}>Event settings</SecondaryButton>
        <PrimaryButton onClick={() => setDayOpen(true)}>End of day</PrimaryButton>
      </PageActions>

      {marketDay && (
        <div className="rp-card rp-till-morning" role="status">
          <div><strong>{marketDay.title}</strong><p>{marketDay.detail}</p></div>
          <SecondaryButton size="sm" onClick={() => setMarketDay(null)}>Got it</SecondaryButton>
        </div>
      )}

      <section className="rp-till-shelf" aria-label={w("Books")}>
        <input ref={search} type="search" className="rp-till-search" placeholder="Search or scan a barcode…" aria-label="Search or scan a barcode"
          value={query} onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            const hit = findItems(items, query);
            if (hit.length === 1) { add(hit[0].id); setQuery(""); }
          }} />
        {shown.length === 0
          ? <p className="rp-till-none">{items.length ? `Nothing matches “${query}”.` : w("No books in the stockroom yet.")}</p>
          : <ul className="rp-till-grid">
            {shown.map((item) => {
              const left = leftFor(item, waiting, cart);
              const inCart = cart[item.id] || 0;
              return (
                <li key={item.id}>
                  <button type="button" className="rp-till-tile" data-in-cart={inCart ? "" : undefined} onClick={() => add(item.id)}
                    aria-label={`Add ${item.title}, ${money(item.price, item.cur)}${left != null ? `, ${Math.max(0, left)} left` : ""}${inCart ? `, ${inCart} in the cart` : ""}`}>
                    <span className="rp-till-cover" data-tone={item.tone} data-photo={item.photo ? "" : undefined} aria-hidden="true">{item.photo ? <img src={item.photo} alt="" loading="lazy" /> : item.initials}{inCart > 0 && <span className="rp-till-count">{inCart}</span>}</span>
                    <span className="rp-till-title">{item.title}</span>
                    <span className="rp-till-meta">
                      <span>{money(item.price, item.cur)}</span>
                      {left != null && <span data-out={left <= 0 ? "" : undefined}>{Math.max(0, left)} left</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>}
      </section>

      {lines.length > 0 && (
        <button type="button" className="rp-till-jump" onClick={() => setPayOpen(true)}>
          <span>{lines.reduce((n, l) => n + l.qty, 0)} in the cart · {totalText(totals)}</span><span>Charge</span>
        </button>
      )}

      <aside className="rp-till-side">
        <section className="rp-till-cart" aria-label="Cart">
          <h2 className="rp-till-cart-title">Cart</h2>
          {lines.length === 0
            ? <p className="rp-till-none">{w("Tap a book to add it.")}</p>
            : <ul className="rp-till-lines">
              {lines.map((l) => (
                <li key={l.id}>
                  <span className="rp-till-line-name">{l.title} × {l.qty}</span>
                  <span className="rp-till-step">
                    <button type="button" onClick={() => add(l.id, -1)} aria-label={`One less ${l.title}`}>−</button>
                    <button type="button" onClick={() => add(l.id, 1)} aria-label={`One more ${l.title}`}>+</button>
                  </span>
                  <span className="rp-till-line-amt">{money(l.amount, l.cur)}</span>
                </li>
              ))}
            </ul>}
          {short.length > 0 && <p className="rp-till-warn" role="status">{w(`More copies than on hand: ${short.map((l) => l.title).join(", ")}. The sale still records.`)}</p>}
          <p className="rp-till-total"><span>Total</span><strong>{totalText(totals)}</strong></p>
        </section>

        <section className="rp-till-pay" id="rp-till-pay" aria-label="Take payment">
          <InkButton size="lg" disabled={!lines.length} onClick={() => setPayOpen(true)}>Charge {totalText(totals)}</InkButton>
        </section>

        {last && (
          <p className="rp-till-sold" role="status">
            <span>{last.text}</span>
            <SecondaryButton size="sm" onClick={undo}>Undo</SecondaryButton>
          </p>
        )}
        <p className="rp-till-upload" data-tone={upload.tone} role="status"><i aria-hidden="true" />{upload.text}</p>
        {stuck.length > 0 && (
          <div className="rp-till-stuck" role="alert">
            <p>{problem || "A sale couldn't be stored."} It stays on this device until it is stored.</p>
            <SecondaryButton size="sm" onClick={() => { setQueue(queueRef.current.map((s) => ({ ...s, problem: undefined }))); setProblem(""); void flush(); }}>Try again</SecondaryButton>
          </div>
        )}
      </aside>

      <PaySheet open={payOpen && lines.length > 0} totals={totals} onClose={() => setPayOpen(false)} onCharge={charge} />

      <TillExtrasDialog open={extrasOpen} onClose={() => setExtrasOpen(false)} extras={extras} onSaved={setExtras}
        currency={String(records.books[0]?.currency || SHOP_CURRENCY)} />

      <EventDialog open={eventOpen} fair={fair} onClose={() => setEventOpen(false)}
        onSave={(name) => { setFair(saveCurrentFair(name, today) || ""); setEventOpen(false); }} />

      <EndOfDay open={dayOpen} onClose={() => setDayOpen(false)} records={records} states={states} day={today} fair={fair} waiting={queue.length} />
    </div>
  );
}

const OTHER_NOTES: Record<string, string> = {
  "Bank Transfer": "Check the transfer has arrived, then charge.",
  "Comp/Gift": "A free copy: no money is taken. It still comes off your stock.",
};

/**
 * The payment sheet (v4 mockup 1j): the total, How they pay, and for cash the quick amounts, Cash given and a Change due
 * (mint) or Still to pay (apricot) tile. Charge records the sale through the till's own `charge`; it waits while the cash
 * typed is short. A cart in two currencies has no cash maths: the cash is counted by hand.
 */
export function PaySheet({ open, totals, onClose, onCharge }: {
  open: boolean; totals: Array<{ cur: string; amount: number }>; onClose: () => void; onCharge: (method: string) => void;
}) {
  const [pay, setPay] = useState<SheetPay>("Cash");
  const [other, setOther] = useState<string>(OTHER_METHODS[0].value);
  const [given, setGiven] = useState("");
  const [warn, setWarn] = useState("");
  const givenRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setGiven(""); setWarn(""); } }, [open]);
  const single = totals.length === 1 ? totals[0] : null;
  const cash = pay === "Cash" && !!single;
  const change = cash && single ? cashChange(single.amount, given) : null;
  const short = !!change && !change.covered;
  const total = totalText(totals);
  const go = () => {
    if (short && single && change) {
      setWarn(`${money(change.amount, single.cur)} still to pay`);
      givenRef.current?.focus();
      return;
    }
    onCharge(pay === "Other" ? other : pay);
  };
  const quick = (amount: number) => { setGiven(amount.toFixed(2)); setWarn(""); };
  return (
    <Dialog open={open} onClose={onClose} title="Take payment"
      footer={<><SecondaryButton onClick={onClose}>Back to till</SecondaryButton>
        <PrimaryButton onClick={go} aria-disabled={short || undefined}>Charge {total}</PrimaryButton></>}>
      <div className="rp-till-sheet">
        <p className="rp-till-sheet-total" aria-hidden="true">{total}</p>
        <FormChoice label="How they pay" options={SHEET_PAYS.map((p) => ({ value: p.value, label: p.label }))} value={pay}
          onChange={(v) => { setPay(v); setWarn(""); }} />
        {pay === "Cash" && !single && <p className="rp-till-sheet-note">The cart is in two currencies: count the cash by hand, then charge.</p>}
        {cash && single && (
          <div className="rp-till-cash">
            <div className="rp-fk-choice" role="group" aria-label="Quick amounts">
              <button type="button" onClick={() => quick(single.amount)}>Exact</button>
              {QUICK_CASH.map((n) => <button key={n} type="button" onClick={() => quick(n)}>{money(n, single.cur).replace(/\.00$/, "")}</button>)}
            </div>
            <div className="rp-till-cash-row">
              <FormField label="Cash given">
                {(p) => <input {...p} ref={givenRef} type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" value={given}
                  onChange={(e) => { setGiven(e.target.value); setWarn(""); }} />}
              </FormField>
              <div className="rp-till-change" data-tone={change ? (change.covered ? "covered" : "short") : undefined} role="status" aria-live="polite">
                <span>{change && !change.covered ? "Still to pay" : "Change due"}</span>
                <strong>{change ? money(change.amount, single.cur) : "—"}</strong>
              </div>
            </div>
          </div>
        )}
        {pay === "Card" && <p className="rp-till-sheet-note"><strong>Take the card on your reader.</strong> Charge once it is paid.</p>}
        {pay === "Stripe QR" && <p className="rp-till-sheet-note"><strong>Ask them to scan your QR code.</strong> Charge once the payment arrives.</p>}
        {pay === "Other" && (
          <>
            <FormChoice label="Paid by" options={OTHER_METHODS.map((m) => ({ value: m.value as string, label: m.label }))} value={other} onChange={setOther} />
            <p className="rp-till-sheet-note">{OTHER_NOTES[other]}</p>
          </>
        )}
        {warn && <p className="rp-till-sheet-warn" role="alert">{warn}</p>}
      </div>
    </Dialog>
  );
}

function EventDialog({ open, fair, onClose, onSave }: { open: boolean; fair: string; onClose: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState(fair);
  useEffect(() => { if (open) setName(fair); }, [open]);
  return (
    <Dialog open={open} onClose={onClose} title="Event settings"
      footer={<><SecondaryButton onClick={onClose}>Cancel</SecondaryButton><PrimaryButton onClick={() => onSave(name)}>Save</PrimaryButton></>}>
      <form onSubmit={(e) => { e.preventDefault(); onSave(name); }}>
        <TextField label="Where you're selling today" hint="Shown with each sale. Forgotten tomorrow." maxLength={80} value={name}
          placeholder="Harbour Fair" onChange={(e) => setName(e.target.value)} />
      </form>
    </Dialog>
  );
}

const totalsLine = (totals: Record<string, number>) => totalText(Object.entries(totals).map(([cur, amount]) => ({ cur, amount })));

function EndOfDay({ open, onClose, records, states, day, fair, waiting }: {
  open: boolean; onClose: () => void; records: StockroomRecords; states: StockroomRecords["states"]; day: string; fair: string; waiting: number;
}) {
  const w = useShopWords();
  const sum = useMemo(() => {
    if (!open) return null;
    const books = records.books.map((b) => ({ id: b.id, title: b.title, currency: String(b.currency || ""), hist: (states[b.id]?.hist as unknown[]) || [] }));
    const left = Object.fromEntries(records.books.map((b) => { const n = Number(states[b.id]?.stock); return [b.id, Number.isFinite(n) ? n : null]; }));
    return fairDaySummary(registerSalesForDay(books, day), left);
  }, [open, records, states, day]);
  return (
    <Dialog open={open} onClose={onClose} title="End of day" description={fair ? `${fair} · today` : "Today at the till"}
      footer={<PrimaryButton onClick={onClose}>Done</PrimaryButton>}>
      {sum && (sum.sales === 0
        ? <p className="rp-till-none">No till sales stored today yet.</p>
        : <div className="rp-till-day">
          <p className="rp-till-day-total"><strong>{totalsLine(sum.totals)}</strong> · {sum.sales} {sum.sales === 1 ? "sale" : "sales"} · {w(`${sum.units} ${sum.units === 1 ? "copy" : "copies"}`)}</p>
          <h3>By payment</h3>
          <ul>{sum.methods.map((m) => <li key={m.method}><span>{ALL_METHODS.find((x) => x.value === m.method)?.label || m.label} · {m.sales}</span><span>{totalsLine(m.totals)}</span></li>)}</ul>
          <h3>{w("By book")}</h3>
          <ul>{sum.titles.map((t) => <li key={t.bookId}><span>{t.title} × {t.units}{t.left != null ? ` · ${t.left} left` : ""}</span><span>{totalsLine(t.totals)}</span></li>)}</ul>
        </div>)}
      {waiting > 0 && <p className="rp-till-warn">{waiting} {waiting === 1 ? "sale is" : "sales are"} still waiting to upload and not counted here yet.</p>}
    </Dialog>
  );
}
