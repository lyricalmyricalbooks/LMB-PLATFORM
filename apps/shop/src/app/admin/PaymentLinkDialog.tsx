// Orders › New order to pay (code plan 21.2): the owner builds an order for a customer at prices they set. The server
// makes the order and its link (functions/paymentLinks.js); the order page then shows the link to copy or email.
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Dialog, IconButton, PrimaryButton, SecondaryButton, SelectField, TextArea, TextField } from "./riso/components";
import { emptyLinkForm, LINK_DAYS, linkFormForAddOn, linkableBooks, linkFormFromQuote, MAX_LINE_QUANTITY, type QuoteRequest, linkFormProblems, linkRequest, linkSubtotal, newRow, shopPriceOf, type LinkForm, type LinkRow } from "./paymentLinks";
import { useShopWords } from "./shopWords";

const grid = { display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" } as const;
const cad = (n: number) => `$${n.toFixed(2)}`;

export function PaymentLinkDialog({ open, onClose, loadBooks, makeLink, onMade, start = null, addTo = null }: {
  open: boolean;
  onClose: () => void;
  /** The catalog (public fields are enough). */
  loadBooks: () => Promise<any[] | null>;
  /** Sends the request; resolves with the new order's id or throws with the owner's words. */
  makeLink: (link: ReturnType<typeof linkRequest>) => Promise<{ orderId: string }>;
  onMade: (orderId: string) => void;
  /** A bulk-price request from Messages (code plan 21.4): the form starts with its customer, product and copies. */
  start?: QuoteRequest | null;
  /** A paid order to add items to (code plan 24.6): the form starts with its customer and address, and the new order ships with it. */
  addTo?: any;
}) {
  const w = useShopWords();
  const [books, setBooks] = useState<any[] | null>(null);
  const [form, setForm] = useState<LinkForm>(() => emptyLinkForm());
  const [find, setFind] = useState("");
  const [shown, setShown] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState("");
  const [catalogFailed, setCatalogFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(addTo ? linkFormForAddOn(addTo) : emptyLinkForm());
    setShown(false);
    setFailure("");
    setFind("");
    let alive = true;
    setBooks(null);
    setCatalogFailed(false);
    loadBooks().then(list => list, () => null).then(list => {
      if (!alive) return;
      setCatalogFailed(list === null);
      const usable = linkableBooks(list || []);
      setBooks(usable);
      // The customer fields work while the catalog loads: keep anything typed there.
      if (start && list !== null) {
        const started = linkFormFromQuote(start, usable);
        setForm(f => ({ ...f, name: f.name || started.name, email: f.email || started.email, phone: f.phone || started.phone, rows: started.rows }));
      }
    });
    return () => { alive = false; };
  }, [open]);

  const problems = useMemo(() => linkFormProblems(form, books || []), [form, books]);
  const show = (key: string) => (shown ? problems[key] : undefined);
  const set = <K extends keyof LinkForm>(key: K, value: LinkForm[K]) => setForm(f => ({ ...f, [key]: value }));
  const setRow = (key: string, patch: Partial<LinkRow>) => setForm(f => ({ ...f, rows: f.rows.map(row => (row.key === key ? { ...row, ...patch } : row)) }));
  const byId = useMemo(() => new Map((books || []).map(book => [book.id, book])), [books]);
  const sorted = useMemo(() => [...(books || [])].sort((a, b) => String(a.title || "").localeCompare(String(b.title || ""))), [books]);
  const matches = (book: any) => String(book.title || "").toLowerCase().includes(find.trim().toLowerCase());

  const submit = async () => {
    setShown(true);
    setFailure("");
    if (Object.keys(problems).length) return;
    setSaving(true);
    try {
      const made = await makeLink(linkRequest(form, addTo?.id || ""));
      onMade(made.orderId);
    } catch (err: any) {
      setFailure(String(err?.message || "We couldn't make this payment link. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={addTo ? `Add items to order ${addTo.orderId || addTo.id}` : "New order to pay"}
      description={addTo
        ? "Choose what the customer is adding. They pay for just these items from a private link, and you pack them with the order they already paid for."
        : "Build an order for a customer at the prices you agreed. You get a private link they open to pay by card."}
      footer={
        <>
          <SecondaryButton onClick={onClose} disabled={saving}>Cancel</SecondaryButton>
          <PrimaryButton onClick={submit} disabled={saving || books === null || catalogFailed}>{saving ? "Making the link…" : "Make the payment link"}</PrimaryButton>
        </>
      }
    >
      <div className="rp-stack">
        {catalogFailed && <p role="alert" className="rp-error-text">{w("The catalog didn't load. Close this and try again.")}</p>}
        {start && books !== null && !catalogFailed && (
          <p className="rp-hint" role="status">
            {`From ${start.name || "a customer"}'s request for ${start.quantity} of “${start.title}”${start.edition ? ` (${start.edition})` : ""}. Set the price you're offering.`}
            {!form.rows[0]?.bookId && w(" That product wasn't found, so choose it below.")}
            {start.quantity > MAX_LINE_QUANTITY && ` One line holds up to ${MAX_LINE_QUANTITY} copies, so the quantity starts at ${MAX_LINE_QUANTITY}.`}
          </p>
        )}
        <div className="rp-sect">{w("Products")}</div>
        {books === null ? <p className="rp-hint">Loading the catalog…</p> : (
          <>
            {books.length > 8 && <TextField label={w("Find a product")} value={find} onChange={e => setFind(e.target.value)} placeholder="Type part of the name" />}
            {form.rows.map((row, index) => {
              const book = byId.get(row.bookId);
              const variants = Array.isArray(book?.variants) ? book.variants : [];
              const shopPrice = shopPriceOf(book, row.variantId);
              return (
                <div key={row.key} className="rp-card" style={{ padding: 12, boxShadow: "none" }}>
                  <div style={grid}>
                    <SelectField label={w(`Product ${index + 1}`)} value={row.bookId} onChange={e => setRow(row.key, { bookId: e.target.value, variantId: "", price: "" })}>
                      <option value="">{w("Choose a product")}</option>
                      {book && <option value={book.id}>{book.title}</option>}
                      {sorted.filter(b => b.id !== row.bookId && matches(b)).map(b => <option key={b.id} value={b.id}>{b.title}{b.status !== "published" ? " (not published)" : ""}</option>)}
                    </SelectField>
                    {variants.length > 0 && (
                      <SelectField label="Edition" value={row.variantId} onChange={e => setRow(row.key, { variantId: e.target.value })}>
                        <option value="">Choose an edition</option>
                        {variants.map((v: any) => <option key={v.id} value={v.id}>{v.name || "Edition"}</option>)}
                      </SelectField>
                    )}
                    <TextField label="Quantity" inputMode="numeric" value={row.quantity} onChange={e => setRow(row.key, { quantity: e.target.value })} />
                    <TextField label="Price each" inputMode="decimal" value={row.price} onChange={e => setRow(row.key, { price: e.target.value })}
                      placeholder={shopPrice != null ? cad(shopPrice) : ""} hint={shopPrice != null ? `Blank charges the shop's price, ${cad(shopPrice)}.` : undefined} />
                  </div>
                  {show(`row-${row.key}`) && <p role="alert" className="rp-error-text">{show(`row-${row.key}`)}</p>}
                  {form.rows.length > 1 && (
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                      <IconButton label={`Remove line ${index + 1}`} onClick={() => set("rows", form.rows.filter(r => r.key !== row.key))}><Trash2 size={16} aria-hidden /></IconButton>
                    </div>
                  )}
                </div>
              );
            })}
            {show("rows") && <p role="alert" className="rp-error-text">{show("rows")}</p>}
            <div><SecondaryButton size="sm" icon={<Plus size={14} aria-hidden />} onClick={() => set("rows", [...form.rows, newRow()])}>Add another line</SecondaryButton></div>
          </>
        )}

        <div className="rp-sect">Customer</div>
        <div style={grid}>
          <TextField label="Name" autoComplete="off" value={form.name} onChange={e => set("name", e.target.value)} error={show("name")} />
          <TextField label="Email" type="email" autoComplete="off" value={form.email} onChange={e => set("email", e.target.value)} error={show("email")} />
          <TextField label="Phone (optional)" autoComplete="off" value={form.phone} onChange={e => set("phone", e.target.value)} />
        </div>

        <div className="rp-sect">Delivery</div>
        <div role="radiogroup" aria-label="Delivery" style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
          <label className="rp-check"><input type="radio" name="link-delivery" checked={form.ship} onChange={() => set("ship", true)} /> Ship it</label>
          <label className="rp-check"><input type="radio" name="link-delivery" checked={!form.ship} onChange={() => set("ship", false)} /> Nothing to ship (picked up, handed over or digital)</label>
        </div>
        <div style={grid}>
          {form.ship && <TextField label="Shipping charge" inputMode="decimal" value={form.shipping} onChange={e => set("shipping", e.target.value)} error={show("shipping")} hint="Enter 0 for free shipping." />}
          {form.ship && <TextField label="Street address" value={form.street} onChange={e => set("street", e.target.value)} error={show("street")} />}
          {form.ship && <TextField label="Apartment or unit (optional)" value={form.unit} onChange={e => set("unit", e.target.value)} />}
          {form.ship && <TextField label="City" value={form.city} onChange={e => set("city", e.target.value)} error={show("city")} />}
          <TextField label="Province or state" value={form.state} onChange={e => set("state", e.target.value)} error={show("state")} hint={form.ship ? undefined : "Tax follows where the customer is."} />
          {form.ship && <TextField label="Postal code" value={form.zip} onChange={e => set("zip", e.target.value)} error={show("zip")} />}
          <TextField label="Country" value={form.country} onChange={e => set("country", e.target.value)} error={show("country")} />
        </div>

        <div className="rp-sect">The link</div>
        <div style={grid}>
          <SelectField label="Open for" value={form.days} onChange={e => set("days", e.target.value)} error={show("days")}>
            {LINK_DAYS.map(days => <option key={days} value={String(days)}>{days} days</option>)}
          </SelectField>
        </div>
        <TextArea label="Note to the customer (optional)" rows={2} maxLength={500} value={form.note} onChange={e => set("note", e.target.value)} hint="Shown on the page they pay from." />

        <p className="rp-hint" role="status">
          {`Before tax: ${cad(linkSubtotal(form, books || []))}. Tax is added as at checkout; no discount codes apply on top.`}
        </p>
        {failure && <p role="alert" className="rp-error-text">{failure}</p>}
      </div>
    </Dialog>
  );
}
