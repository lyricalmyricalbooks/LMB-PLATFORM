// What a fair helper sees instead of the admin (Team role "fairHelper"): the Fair till. The owner's price list (kept by
// the owner's admin, fairInbox.ts), a cart, the ways of paying, card payments by QR, a short Undo, and the sales they
// rang up today with the cash to hand over. A sale goes to the owner's inbox and is kept on this phone until the server
// has it, so no signal never loses one. Nothing else of the shop is read or written: the rules allow only this.
import { useEffect, useMemo, useRef, useState } from "react";
import { LogOut } from "lucide-react";
import { FAIR_UNDO_MS } from "@stockroom/fair-mode.js";
import { helperCopiesLeft, helperDay, helperSaleDoc, newSaleId, type FairMenu, type HelperSale } from "@stockroom/fair-helper.js";
import { localDay } from "@stockroom/calendar-day.js";

import { auth } from "../../lib/firebase";
import { functionFetch } from "../lib/functionsBase";
import { adminApi } from "./api";
import { Dialog, InkButton, PageHeader, SecondaryButton, TextField } from "./riso/components";
import { useShopWords } from "./shopWords";
import { fairStore } from "./stockroom/fairStore";
import {
  helperUploadLine, keepMenu, linesTotals, mySales, pruneQueue, readMenu, readQueue, saleStatus, toResend, writeQueue, type QueuedSale,
} from "./stockroom/helperTill";
import { qrPicture } from "./stockroom/qrCodesStore";
import { ALL_METHODS, OTHER_METHODS, TILE_TONES, TILL_METHODS, initials, money } from "./stockroom/till";
import "./stockroom/stockroom.css";
import "./stockroom/till.css";
import { SHOP_CURRENCY } from "./moneySign";

const FAIR_KEY = "colophon-helper-fair";
const QR_CHECK_MS = 3000;
const QR_LIFE_MS = 30 * 60 * 1000;
const RETRY_MS = 30_000;

type Qr = { id: string; lines: Array<{ bookId: string; qty: number }>; startedAt: number; status: "starting" | "waiting" | "offline" | "failed";
  url?: string; picture?: string; sessionId?: string; amount?: number; currency?: string; test?: boolean; message?: string };

type HelperApi = typeof fairStore & { cardPay: (action: string, body: Record<string, unknown>) => Promise<any> };

/** Asks the shop's server for a card payment by QR (functions/fairHelperPay.js). */
async function cardPay(action: string, body: Record<string, unknown>) {
  const token = await auth.currentUser?.getIdToken();
  const response = await functionFetch("fairHelperPayment", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ action, ...body }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { error: data?.error || "The card payment couldn't be reached. Use the card reader or cash." };
  return data;
}

const readFair = (day: string) => {
  try { const saved = JSON.parse(localStorage.getItem(FAIR_KEY) || "null"); return saved?.day === day ? String(saved.name || "") : ""; } catch { return ""; }
};
const totalsLine = (totals: Record<string, number>) => {
  const parts = Object.entries(totals).map(([cur, n]) => money(n, cur));
  return parts.length ? parts.join(" + ") : money(0, SHOP_CURRENCY);
};
const online = () => (typeof navigator === "undefined" ? true : navigator.onLine !== false);

export function FairHelperDesk({ email, appearance, api = { ...fairStore, cardPay } }: { email: string; appearance: "light" | "dark"; api?: HelperApi }) {
  const w = useShopWords();
  const me = email.toLowerCase();
  const today = localDay(new Date());
  const [menu, setMenu] = useState<FairMenu | null>(() => readMenu());
  const [menuFailed, setMenuFailed] = useState(false);
  const [server, setServer] = useState<HelperSale[]>([]);
  const [queue, setQueueState] = useState<QueuedSale[]>(() => readQueue(me));
  const queueRef = useRef(queue);
  const sent = useRef(new Set<string>());
  const [kept, setKept] = useState(true);
  const [isOnline, setOnline] = useState(online);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");
  const [fair, setFair] = useState(() => readFair(today));
  const [fairOpen, setFairOpen] = useState(false);
  const [otherOpen, setOtherOpen] = useState(false);
  const [dayOpen, setDayOpen] = useState(false);
  const [last, setLast] = useState<{ id: string; text: string } | null>(null);
  const [note, setNote] = useState("");
  const [qr, setQr] = useState<Qr | null>(null);
  const qrRef = useRef<Qr | null>(null);
  qrRef.current = qr;
  // Read through a call: the payment code can be cancelled while the server answers.
  const qrNow = (): Qr | null => qrRef.current;

  const setQueue = (next: QueuedSale[]) => { queueRef.current = next; setQueueState(next); setKept(writeQueue(me, next)); };

  const send = (q: QueuedSale) => {
    sent.current.add(q.id);
    // Not awaited: with no signal the write waits, and the list shows the sale as waiting.
    api.addSale(q.id, q.doc as Record<string, unknown>).catch((e: unknown) => {
      console.error("Fair helper sale refused", e);
      if (online()) setNote(w("A sale was refused. You may no longer be a fair helper for this shop: ask its owner."));
    });
  };

  useEffect(() => {
    const stopMenu = api.watchMenu((m) => { setMenu(m || { books: [], at: "" }); keepMenu(m); setMenuFailed(false); }, () => setMenuFailed(true));
    const stopMine = api.watchMine(me, (docs) => {
      setServer(docs);
      const left = pruneQueue(queueRef.current, docs);
      if (left.length !== queueRef.current.length) setQueue(left);
      // Sales kept on this phone from an earlier visit that the server never got: send them now.
      for (const q of toResend(left, docs)) if (!sent.current.has(q.id)) send(q);
    }, () => {});
    const up = () => { setOnline(true); for (const q of toResend(queueRef.current, [])) if (!sent.current.has(q.id)) send(q); };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    const t = window.setInterval(() => { if (online()) setOnline(true); }, RETRY_MS);
    return () => { stopMenu(); stopMine(); window.removeEventListener("online", up); window.removeEventListener("offline", down); window.clearInterval(t); };
  }, []);

  const sales = useMemo(() => mySales(server, queue), [server, queue]);
  const day = useMemo(() => helperDay(sales, today), [sales, today]);
  const left = useMemo(() => helperCopiesLeft(menu, sales), [menu, sales]);
  const books = menu?.books || [];
  const byId = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);
  const q = query.trim().toLowerCase();
  const shown = books.filter((b) => !q || b.title.toLowerCase().includes(q));
  const lines = Object.entries(cart).filter(([id, n]) => n > 0 && byId.has(id)).map(([id, qty]) => {
    const b = byId.get(id)!;
    return { id, title: b.title, qty, cur: b.cur, amount: Math.round(qty * b.price * 100) / 100 };
  });
  const totals: Record<string, number> = {};
  for (const l of lines) totals[l.cur] = Math.round(((totals[l.cur] || 0) + l.amount) * 100) / 100;
  const waiting = sales.filter((s) => s.pending && !s.cancelled).length;
  const upload = helperUploadLine(waiting, isOnline, kept);

  const add = (id: string, by = 1) => {
    if (qr) return;
    setLast(null); setNote("");
    setCart((c) => { const n = Math.max(0, (c[id] || 0) + by); const next = { ...c }; if (n) next[id] = n; else delete next[id]; return next; });
  };

  function charge(method: string, opts: { id?: string; cart?: Array<{ bookId: string; qty: number }> } = {}) {
    const items = opts.cart || lines.map((l) => ({ bookId: l.id, qty: l.qty }));
    const made = helperSaleDoc({ id: opts.id || newSaleId(), by: me, day: today, fair, method, cart: items }, menu);
    setOtherOpen(false);
    if (!made) { setNote(w("That sale couldn't be recorded. Check the books in it and try again.")); return; }
    const queued = { id: made.id, doc: made.doc };
    setQueue([...queueRef.current, queued]);
    send(queued);
    const count = items.reduce((n, l) => n + l.qty, 0);
    const label = ALL_METHODS.find((m) => m.value === method)?.label || method;
    setCart({});
    setLast({ id: made.id, text: `Sold ${count} · ${totalsLine(linesTotals(made.doc.lines))} · ${label}` });
    window.setTimeout(() => setLast((l) => (l?.id === made.id ? null : l)), FAIR_UNDO_MS);
  }

  function undo() {
    if (!last) return;
    const id = last.id;
    setLast(null);
    const sale = sales.find((s) => s.id === id);
    if (sale?.lines) setCart(Object.fromEntries(sale.lines.map((l) => [l.bookId, l.qty])));
    if (sent.current.has(id) || server.some((s) => s.id === id)) {
      api.cancelSale(id).catch(() => setNote(w("That sale is already in the records, so it can't be undone here. Tell the shop's owner: they can void it.")));
    } else {
      setQueue(queueRef.current.filter((x) => x.id !== id));
    }
    setNote("Sale undone");
  }

  // ── Card payment by QR: the server prices the sale from the menu; the sale is recorded once it is paid ──
  async function startQr() {
    const items = lines.map((l) => ({ bookId: l.id, qty: l.qty }));
    if (!items.length || qrRef.current) return;
    const id = newSaleId();
    const first: Qr = { id, lines: items, status: "starting", startedAt: Date.now() };
    qrRef.current = first;
    setQr(first);
    setLast(null); setNote("");
    let answer: any;
    try { answer = await api.cardPay("start", { saleId: id, lines: items }); }
    catch (e) { answer = { error: !online() ? "No signal, so a payment code can't be made. Use the card reader or cash." : (e as Error)?.message }; }
    const started = qrNow();
    if (started?.id !== id) return;
    if (!answer?.url) { setQr({ ...started, status: "failed", message: answer?.error || "The payment code couldn't be made. Use the card reader or cash." }); return; }
    const picture = await qrPicture(answer.url, 6).catch(() => "");
    const shown = qrNow();
    if (shown?.id !== id) return;
    const next: Qr = { ...shown, status: "waiting", url: answer.url, picture, sessionId: answer.sessionId, amount: answer.amount, currency: answer.currency, test: !!answer.test };
    qrRef.current = next;
    setQr(next);
    void checkQr(id);
  }

  async function checkQr(id: string) {
    const cur = qrNow();
    if (!cur || cur.id !== id || !cur.sessionId) return;
    let answer: any = null;
    try { answer = await api.cardPay("status", { sessionId: cur.sessionId }); } catch { answer = null; }
    const now = qrNow();
    if (!now || now.id !== id) return;
    if (answer?.paid) { setQr(null); qrRef.current = null; charge("Stripe QR", { id, cart: now.lines }); return; }
    if (answer && answer.open === false) { setQr({ ...now, status: "failed", message: "The payment code ran out before it was paid. Cancel, then try again or use another way." }); return; }
    if (Date.now() - now.startedAt > QR_LIFE_MS) { setQr({ ...now, status: "failed", message: "The payment code ran out. Cancel, then try again." }); return; }
    const status = answer ? "waiting" : "offline";
    if (now.status !== status) { const next = { ...now, status } as Qr; qrRef.current = next; setQr(next); }
    window.setTimeout(() => void checkQr(id), QR_CHECK_MS);
  }

  function cancelQr() {
    const cur = qrRef.current;
    qrRef.current = null;
    setQr(null);
    if (cur?.sessionId) api.cardPay("cancel", { sessionId: cur.sessionId }).catch(() => {});
  }

  const qrAmount = qr?.amount != null && qr.currency ? money(qr.amount / 100, qr.currency.toUpperCase()) : "";

  return (
    <div className="rp" data-rp-appearance={appearance}>
      <main className="rp-main" style={{ maxWidth: 1180, margin: "0 auto", padding: "24px 16px" }}>
        <PageHeader
          title="Fair till"
          description={`${fair ? `${fair} · ` : ""}Signed in as ${me}.`}
          actions={<>
            <SecondaryButton onClick={() => setFairOpen(true)}>Where you're selling</SecondaryButton>
            <SecondaryButton onClick={() => setDayOpen(true)}>End of day</SecondaryButton>
            <SecondaryButton icon={<LogOut size={16} aria-hidden />} onClick={() => { void adminApi.logout(); }}>Sign out</SecondaryButton>
          </>}
        />
        <div className="rp-till">
          <section className="rp-till-shelf" aria-label={w("Books")}>
            <input type="search" className="rp-till-search" placeholder={w("Find a book")} aria-label={w("Find a book")}
              value={query} onChange={(e) => setQuery(e.target.value)} />
            {!menu
              ? <p className="rp-till-none">{menuFailed ? "The till couldn't load. Check the signal and reopen this page." : "Loading the till…"}</p>
              : !books.length ? <p className="rp-till-none">{w("No books on the till yet. The shop's owner adds them by opening their admin.")}</p>
              : !shown.length ? <p className="rp-till-none">{`Nothing matches “${query}”.`}</p>
              : <ul className="rp-till-grid">
                {shown.map((b, i) => {
                  const inCart = cart[b.id] || 0;
                  const n = left[b.id];
                  const after = n == null ? null : n - inCart;
                  return (
                    <li key={b.id}>
                      <button type="button" className="rp-till-tile" data-in-cart={inCart ? "" : undefined} disabled={!!qr} onClick={() => add(b.id)}
                        aria-label={`Add ${b.title}, ${money(b.price, b.cur)}${after != null ? `, ${Math.max(0, after)} left` : ""}${inCart ? `, ${inCart} in the cart` : ""}`}>
                        <span className="rp-till-cover" data-tone={TILE_TONES[i % TILE_TONES.length]} aria-hidden="true">
                          {b.cover ? <img className="rp-till-photo" src={b.cover} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" /> : initials(b.title)}
                          {inCart > 0 && <span className="rp-till-count">{inCart}</span>}
                        </span>
                        <span className="rp-till-title">{b.title}</span>
                        <span className="rp-till-meta">
                          <span>{money(b.price, b.cur)}</span>
                          {after != null && <span data-out={after <= 0 ? "" : undefined}>{Math.max(0, after)} left</span>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>}
          </section>

          {lines.length > 0 && !qr && (
            <button type="button" className="rp-till-jump" onClick={() => document.getElementById("rp-till-pay")?.scrollIntoView({ behavior: "smooth", block: "center" })}>
              <span>{lines.reduce((n, l) => n + l.qty, 0)} in the cart · {totalsLine(totals)}</span><span>Pay</span>
            </button>
          )}

          <aside className="rp-till-side">
            {qr ? (
              <section className="rp-till-cart" aria-label="Card payment by QR">
                <h2 className="rp-till-cart-title">Card payment by QR</h2>
                {qr.status === "starting" && <p className="rp-till-none" role="status">Making the payment code…</p>}
                {qr.status === "failed" && <p className="rp-till-warn" role="alert">{qr.message}</p>}
                {(qr.status === "waiting" || qr.status === "offline") && <>
                  <p className="rp-till-total"><span>To pay</span><strong>{qrAmount}</strong></p>
                  <p className="rp-till-none">Ask the customer to scan this with their phone's camera and pay by card.</p>
                  {qr.picture
                    ? <img className="rp-till-qr" src={qr.picture} alt={`Payment code for ${qrAmount}`} width={220} height={220} />
                    : <a className="rp-btn" href={qr.url} target="_blank" rel="noopener noreferrer">Open the payment page</a>}
                  {qr.test && <p className="rp-till-none">Test mode: the shop is taking practice payments only.</p>}
                  <p className="rp-till-warn" role="status">{qr.status === "offline"
                    ? "No signal, so the till can't check the payment yet. Keep this open: it checks again when the signal is back."
                    : "Waiting for the payment. The sale is recorded by itself once it goes through."}</p>
                </>}
                <div style={{ marginTop: 12 }}><SecondaryButton size="sm" onClick={cancelQr}>Cancel and choose another way</SecondaryButton></div>
              </section>
            ) : <>
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
                <p className="rp-till-total"><span>Total</span><strong>{totalsLine(totals)}</strong></p>
              </section>
              <section className="rp-till-pay" id="rp-till-pay" aria-label="Take payment">
                {TILL_METHODS.map((m) => (
                  <InkButton key={m.value} size="lg" disabled={!lines.length} onClick={() => (m.value === "Stripe QR" ? void startQr() : charge(m.value))}>{m.label}</InkButton>
                ))}
                <InkButton size="lg" disabled={!lines.length} onClick={() => setOtherOpen(true)}>Other</InkButton>
              </section>
            </>}

            {last && (
              <p className="rp-till-sold" role="status"><span>{last.text}</span><SecondaryButton size="sm" onClick={undo}>Undo</SecondaryButton></p>
            )}
            {note && <p className="rp-till-sold" role="status"><span>{note}</span></p>}
            <p className="rp-till-upload" data-tone={upload.tone} role="status"><i aria-hidden="true" />{upload.text}</p>

            <section className="rp-till-cart" aria-label="Your sales today">
              <h2 className="rp-till-cart-title">Your sales today</h2>
              {!day.sales.length
                ? <p className="rp-till-none">None yet.</p>
                : <>
                  <p className="rp-till-none" style={{ margin: "0 0 8px" }}>{day.kept ? `${day.kept} ${day.kept === 1 ? "sale" : "sales"} · ${totalsLine(day.totals)}` : "No sales kept today"}</p>
                  <ul className="rp-till-lines">
                    {day.sales.slice(0, 30).map((s) => (
                      <li key={s.id} style={{ gridTemplateColumns: "minmax(0, 1fr) auto" }} data-undone={s.cancelled ? "" : undefined}>
                        <span className="rp-till-line-name">
                          {(s.lines || []).map((l) => `${l.title}${l.qty > 1 ? ` ×${l.qty}` : ""}`).join(", ")}
                          <span className="rp-hint" style={{ display: "block" }}>{ALL_METHODS.find((m) => m.value === s.method)?.label || s.method} · {saleStatus(s)}</span>
                        </span>
                        <span className="rp-till-line-amt" style={s.cancelled ? { textDecoration: "line-through" } : undefined}>
                          {totalsLine(linesTotals(s.lines))}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="rp-till-none">{w("Rang one up by mistake? Tap Undo straight after the sale. Later, tell the shop's owner: they can void it.")}</p>
                </>}
            </section>
          </aside>
        </div>

        <Dialog open={otherOpen} onClose={() => setOtherOpen(false)} title="Other ways to pay" description={`Total ${totalsLine(totals)}`}>
          <div className="rp-till-other">
            {OTHER_METHODS.map((m) => <InkButton key={m.value} size="lg" onClick={() => charge(m.value)}>{m.label}</InkButton>)}
          </div>
        </Dialog>

        <FairDialog open={fairOpen} fair={fair} onClose={() => setFairOpen(false)} onSave={(name) => {
          const clean = name.replace(/\s+/g, " ").trim().slice(0, 80);
          setFair(clean);
          try { localStorage.setItem(FAIR_KEY, JSON.stringify({ name: clean, day: today })); } catch { /* this visit only */ }
          setFairOpen(false);
        }} />

        <Dialog open={dayOpen} onClose={() => setDayOpen(false)} title="End of day" description={fair ? `${fair} · today` : "Today at the till"}
          footer={<SecondaryButton onClick={() => setDayOpen(false)}>Done</SecondaryButton>}>
          {!day.kept
            ? <p className="rp-till-none">No sales kept today yet.</p>
            : <div className="rp-till-day">
              <p className="rp-till-day-total"><strong>{totalsLine(day.totals)}</strong> · {day.kept} {day.kept === 1 ? "sale" : "sales"} · {w(`${day.units} ${day.units === 1 ? "copy" : "copies"}`)}</p>
              <h3>By payment</h3>
              <ul>
                {["Cash", ...ALL_METHODS.map((m) => m.value).filter((v) => v !== "Cash")].filter((m) => day.byMethod[m]).map((m) => (
                  <li key={m}><span>{m === "Cash" ? "Cash to hand over" : ALL_METHODS.find((x) => x.value === m)?.label || m}</span><span>{totalsLine(day.byMethod[m])}</span></li>
                ))}
              </ul>
              <p className="rp-till-none">Count the cash box against the first line, then hand it to the shop's owner.</p>
            </div>}
          {waiting > 0 && <p className="rp-till-warn">{waiting} {waiting === 1 ? "sale is" : "sales are"} still waiting for signal.</p>}
        </Dialog>
      </main>
    </div>
  );
}

function FairDialog({ open, fair, onClose, onSave }: { open: boolean; fair: string; onClose: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState(fair);
  useEffect(() => { if (open) setName(fair); }, [open]);
  return (
    <Dialog open={open} onClose={onClose} title="Where you're selling"
      footer={<><SecondaryButton onClick={onClose}>Cancel</SecondaryButton><InkButton onClick={() => onSave(name)}>Save</InkButton></>}>
      <form onSubmit={(e) => { e.preventDefault(); onSave(name); }}>
        <TextField label="Today's fair" hint="Shown with each sale. Forgotten tomorrow." maxLength={80} value={name}
          placeholder="Harbour Fair" onChange={(e) => setName(e.target.value)} />
      </form>
    </Dialog>
  );
}
