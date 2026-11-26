// Settings › General › What you sell (plan 12.14): the owner's own answer to sign-up's "What do you sell?", saved as
// `firstWeek/start` › `sells` and read before the sign-up answer. It changes the admin's words, new products' starting
// kind and the emails' words; products already made are never touched. A shop of "Books and other things" speaks of
// products and makers while book products keep their book fields.
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { adminApi } from "./api";
import { currentSells } from "./sells";
import { hasPublisherTools, sellsServices } from "../../shared/shopSells";
import { inventoryLinkApi } from "./inventoryLinkApi";
import { SELLS_CHANGED_EVENT, SELLS_PRODUCTS_CHANGED_EVENT } from "./shopWords";
import { SectionCard, TextField, Toggle, useConfirm } from "./riso/components";
import { FormField } from "./riso/FormKit";
import { BookOpen, Check, X } from "lucide-react";
import { TYPE_GROUPS, sellsGroups, typeById, type TypeGroupId } from "../../shared/productTypes";
import { groupsFor, saveProductGroups, useProductGroups } from "./productGroups";
import { LEAD_SIDE_CHANGED_EVENT, leadSideOf, shopKindOf } from "./servicesSetup";
import { OTHER_LABEL, OTHER_MAX, OTHER_SERVICE, goodsSellsFor, otherWords } from "./offerStage";
import type { FirstWeekDoc } from "./firstWeek";
import { removeOwnType, useOwnTypes } from "./ownTypes";

/** The kinds of things you sell (product types plan, change 12): tap a group on or off; "What is it?" offers its types first. */
export function ProductGroupsPicker({ sells, other = "", onOther }: {
  sells: string | null;
  /** The owner's own words for Something else ("" when it isn't picked), and how to save them ("" takes it off). */
  other?: string; onOther?: (words: string) => Promise<void>;
}) {
  const fallback = useMemo(() => sellsGroups(sells), [sells]);
  const groups = useProductGroups(fallback);
  const [busy, setBusy] = useState(false);
  const [otherOn, setOtherOn] = useState(!!other);
  const toggle = async (id: TypeGroupId) => {
    const next = TYPE_GROUPS.map((g) => g.id).filter((g) => (g === id ? !groups.includes(id) : groups.includes(g)));
    if (!next.length && !other) { toast.error("Keep at least one kind of thing."); return; }
    setBusy(true);
    try { await saveProductGroups(next); }
    catch { toast.error("Couldn't save that. Check your connection and try again."); }
    finally { setBusy(false); }
  };
  return (
    <section className="rp-fk-field" aria-labelledby="product-groups-label">
      <div className="rp-fk-label-row"><h3 id="product-groups-label" className="rp-fk-label" style={{ margin: 0 }}>Kinds of things you sell</h3></div>
      <div className="rp-group-chips" role="group" aria-labelledby="product-groups-label" aria-busy={busy || undefined}>
        {TYPE_GROUPS.map((g) => {
          const on = groups.includes(g.id);
          return <button key={g.id} type="button" aria-pressed={on} disabled={busy} className="rp-group-chip" onClick={() => { void toggle(g.id); }}>{on && <Check size={14} aria-hidden />}{g.name}</button>;
        })}
        {onOther && (
          <button type="button" aria-pressed={otherOn} disabled={busy} className="rp-group-chip" data-group-other
            onClick={() => {
              if (!otherOn) { setOtherOn(true); return; }
              if (!groups.length && other) { toast.error("Keep at least one kind of thing."); return; }
              setOtherOn(false); if (other) void onOther("");
            }}>{otherOn && <Check size={14} aria-hidden />}{OTHER_LABEL}</button>
        )}
      </div>
      {onOther && otherOn && <OtherWords label="What else do you sell?" placeholder="e.g. Surfboards" saved={other} onSave={onOther} data="data-group-other-words" />}
      <span className="rp-fk-hint">Adding a product offers these kinds first. Your products stay as they are.</span>
    </section>
  );
}

/**
 * The box for the owner's own words when their answer isn't in the list (Julian, 26 November 2026: "always have the
 * other option"). Saves when the box is left or Enter is pressed, only when the words changed.
 */
export function OtherWords({ label, placeholder, saved, onSave, data }: { label: string; placeholder: string; saved: string; onSave: (words: string) => Promise<void>; data: string }) {
  const [text, setText] = useState(saved);
  const [busy, setBusy] = useState(false);
  const commit = async () => {
    const words = otherWords(text);
    if (words === saved || !words) return;
    setBusy(true);
    try { await onSave(words); } finally { setBusy(false); }
  };
  return (
    <TextField label={label} placeholder={placeholder} maxLength={OTHER_MAX} value={text} disabled={busy} {...{ [data]: "" }}
      hint={!otherWords(text) ? "A few words is plenty." : undefined}
      onChange={(e) => setText(e.target.value)} onBlur={() => { void commit(); }}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void commit(); } }} />
  );
}

/**
 * Your own types (product types plan, change 4): the names the owner gave in "What is it?", each with the type it is
 * built on. Removing one leaves the products that use it as they are.
 */
export function OwnTypesList() {
  const own = useOwnTypes();
  const [busy, setBusy] = useState<string | null>(null);
  const remove = async (id: string, name: string) => {
    setBusy(id);
    try { await removeOwnType(id); toast.success(`Removed “${name}”. Products that use it keep it.`); }
    catch { toast.error("Couldn't remove that. Check your connection and try again."); }
    finally { setBusy(null); }
  };
  const hint = own.length ? "Offered by name when you add a product. Removing one leaves your products as they are." : "None yet. When you add a product and type a kind we don't list, you can keep it as your own.";
  return (
    <section className="rp-fk-field" aria-labelledby="own-types-label">
      <div className="rp-fk-label-row"><h3 id="own-types-label" className="rp-fk-label" style={{ margin: 0 }}>Your own types</h3></div>
      {own.length > 0 && (
        <ul className="rp-tp-own-list">
          {own.map((t) => (
            <li key={t.id}>
              <span><span className="rp-tp-name">{t.name}</span> <span className="rp-tp-group">· like {typeById(t.base)?.name}</span></span>
              <button type="button" aria-label={`Remove ${t.name}`} disabled={busy === t.id} onClick={() => { void remove(t.id, t.name); }}><X size={16} aria-hidden /></button>
            </li>
          ))}
        </ul>
      )}
      <span className="rp-fk-hint">{hint}</span>
    </section>
  );
}

export const SELLS_CHOICES: { id: string; label: string }[] = [
  { id: "books", label: "Books" },
  { id: "zines", label: "Zines" },
  { id: "comics", label: "Comics" },
  { id: "prints", label: "Art and prints" },
  { id: "mixed", label: "Books and other things" },
  { id: "clothing", label: "Clothing" },
  { id: "shoes", label: "Shoes" },
  { id: "jewelry", label: "Jewelry" },
  { id: "music", label: "Music" },
  { id: "other", label: "Something else" },
];

/** What a services shop does (sign-up's "What do you do?"). Offered only in a shop that is already a services shop. */
export const SERVICE_CHOICES: { id: string; label: string }[] = [
  { id: "hair", label: "Hair and beauty" },
  { id: "wellness", label: "Health and wellness" },
  { id: "lessons", label: "Lessons and tutoring" },
  { id: "fitness", label: "Fitness and classes" },
  { id: "studio", label: "Studio and creative" },
  { id: "services", label: "Other services" },
];

/** The choices this shop is offered: a services shop picks what it does; every other shop what it sells. */
export function sellsChoicesFor(servicesShop: boolean): { id: string; label: string }[] {
  return servicesShop ? SERVICE_CHOICES : SELLS_CHOICES;
}

/**
 * The choices in groups. A shop may change kind (products ⇄ services) only when it is a services shop already or the
 * platform has turned Bookings on for it (the rules check the same), so only then are both groups offered.
 */
export function sellsGroupsFor(servicesShop: boolean, canSwitch: boolean): { label: string; choices: { id: string; label: string }[] }[] {
  if (!canSwitch) return [{ label: "", choices: sellsChoicesFor(servicesShop) }];
  return [{ label: "Services", choices: SERVICE_CHOICES }, { label: "Products", choices: SELLS_CHOICES }];
}

/** The question a switch of kind asks first, or null when the kind stays the same. */
export function kindSwitchQuestion(from: string | null | undefined, to: string): { title: string; message: string; confirmLabel: string } | null {
  const was = sellsServices(from || null), now = sellsServices(to);
  if (was === now) return null;
  return now
    ? { title: "Switch to a services shop?", message: "Your menu changes to Calendar, Clients and Money. Your products and orders stay, and come back with Sell products too.", confirmLabel: "Switch to services" }
    : { title: "Switch to a product shop?", message: "Your menu changes to Orders, Products and Settings. Your bookings, services and clients stay.", confirmLabel: "Switch to products" };
}

/** What Settings says about the stockroom's words: it is using the saved answer, or it will switch when next opened. */
export function stockroomWordsNote(saved: string | null | undefined, heardFromStockroom: string | null | undefined, justSaved = false): string {
  // Nothing to say for a shop whose answer was never changed here: the stockroom already has the sign-up words.
  if (!saved || (!heardFromStockroom && !justSaved)) return "";
  if (heardFromStockroom === saved) return "Your stockroom is using these words.";
  return "Your stockroom switches to these words the next time you open it.";
}

const TYPE_NAME = { products: "Product shop", services: "Services", both: "Products and services" } as const;

/**
 * Settings › General › What you offer (shop types plan, part 2): the shop's type on top, then what fits it. A product
 * shop picks its kinds of things, and a shop that sells books (and only one) sees the Book tools switch: authors, ISBNs
 * and royalties. A shop taking bookings picks what people book; one doing both says what most customers come for,
 * which leads its menu. Products already made are never touched. `bare` drops the card around it, for a form kit
 * section that already names it (Settings › General, v4).
 */
export function WhatYouSellCard({ bare }: { bare?: boolean } = {}) {
  const [doc, setDoc] = useState<FirstWeekDoc | null | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [heard, setHeard] = useState<string | null>(null);
  const [ask, confirmNode] = useConfirm();
  useEffect(() => {
    let live = true;
    Promise.resolve().then(() => adminApi.getFirstWeek()).then((d) => { if (live) setDoc(d ?? null); }).catch(() => { if (live) setDoc(null); });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    let live = true;
    Promise.resolve().then(() => inventoryLinkApi.state()).then((st) => { if (live) setHeard(typeof st?.app?.wordsSells === "string" ? st.app.wordsSells : null); }).catch(() => {});
    return () => { live = false; };
  }, []);
  const groups = useProductGroups(useMemo(() => groupsFor(doc), [doc]));
  if (doc === undefined) return null;
  const saved = currentSells(doc);
  const type = shopKindOf(doc);
  const lead = leadSideOf(doc);
  // The switch shows only to a shop that sells books: a book answer, "Books and other things", or the Books kind picked.
  const bookTools = type === "products" && hasPublisherTools(saved);
  const showBookTools = type === "products" && (bookTools || groups.includes("books"));

  const save = async (key: string, change: Parameters<typeof adminApi.updateFirstWeek>[0], done: string) => {
    setBusy(key);
    try {
      await adminApi.updateFirstWeek(change);
      setDoc({ ...(doc ?? {}), ...change } as FirstWeekDoc);
      if (change.sells) { setJustSaved(true); window.dispatchEvent(new CustomEvent(SELLS_CHANGED_EVENT, { detail: change.sells })); }
      if (change.sellsProducts !== undefined) window.dispatchEvent(new CustomEvent(SELLS_PRODUCTS_CHANGED_EVENT, { detail: change.sellsProducts }));
      if (change.leadSide) window.dispatchEvent(new CustomEvent(LEAD_SIDE_CHANGED_EVENT, { detail: change.leadSide }));
      toast.success(done);
    } catch {
      toast.error("Couldn't save that. Check your connection and try again.");
    } finally { setBusy(null); }
  };
  const setBookTools = async (on: boolean) => {
    if (!on && !(await ask({ title: "Turn off book tools?", message: "Authors, ISBNs and royalties leave your admin. Nothing is deleted, and turning them back on brings everything back.", confirmLabel: "Turn off" }))) return;
    const sells = on ? "books" : goodsSellsFor(groups.filter((g) => g !== "books"));
    await save("books", { sells }, on ? "Book tools are on: authors, ISBNs and royalties." : "Book tools are off.");
  };
  const setSellsProducts = (on: boolean) => save("products", { sellsProducts: on }, on ? "Products, stock and shipping are back in your menu." : "Your menu is back to bookings and clients.");

  const groupNames = [...TYPE_GROUPS.filter((g) => groups.includes(g.id)).map((g) => g.name.toLowerCase()), ...(otherWords(doc?.otherSells) ? [otherWords(doc?.otherSells).toLowerCase()] : [])];
  const summary = type === "services"
    ? SERVICE_CHOICES.find((c) => c.id === saved)?.label ?? "Services"
    : [type === "both" ? SERVICE_CHOICES.find((c) => c.id === saved)?.label : "", groupNames.length ? `${type === "both" ? "sells " : "Sells "}${groupNames.join(", ")}` : ""].filter(Boolean).join(" · ");
  const typeCard = (
    <div data-shop-type={type} style={{ display: "grid", gap: 4, padding: "16px 18px", borderRadius: "var(--rp-radius-lg)", background: "var(--rp-primary-tint)" }}>
      <span className="rp-hint" style={{ margin: 0 }}>Your shop is</span>
      <strong style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.01em" }}>{TYPE_NAME[type]}</strong>
      {summary && <span className="rp-hint" style={{ margin: 0, textTransform: "none" }}>{summary.charAt(0).toUpperCase() + summary.slice(1)}</span>}
    </div>
  );
  const pill = (on: boolean, label: string, onClick: () => void, data: Record<string, string>) => (
    <button key={label} type="button" className="rp-group-chip" role="radio" aria-checked={on} disabled={!!busy} onClick={onClick} {...data}>{on && <Check size={14} aria-hidden />}{label}</button>
  );
  const body = (<>
    {typeCard}
    {type !== "products" && (
      <FormField label="What people book" hint="Sets the words in your admin, emails and calendar.">
        {(a) => <select {...a} className="rp-select" value={saved ?? ""} disabled={!!busy}
          onChange={(e) => { void save("does", { sells: e.target.value }, "Saved."); }}>
          {SERVICE_CHOICES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>}
      </FormField>
    )}
    {type !== "products" && saved === OTHER_SERVICE && (
      <OtherWords label="What do people book with you?" placeholder="e.g. Dog grooming" saved={otherWords(doc?.otherService)} data="data-other-service"
        onSave={(words) => save("other-service", { otherService: words }, "Saved.")} />
    )}
    {type === "both" && (
      <section className="rp-fk-field" aria-labelledby="lead-side-label">
        <div className="rp-fk-label-row"><h3 id="lead-side-label" className="rp-fk-label" style={{ margin: 0 }}>What most customers come for</h3></div>
        <div className="rp-group-chips" role="radiogroup" aria-labelledby="lead-side-label">
          {pill(lead === "services", "Booking a time", () => { void save("lead", { leadSide: "services" }, "Your menu leads with Calendar."); }, { "data-lead": "services" })}
          {pill(lead === "products", "Buying things", () => { void save("lead", { leadSide: "products" }, "Your menu leads with Orders and products."); }, { "data-lead": "products" })}
        </div>
        <span className="rp-fk-hint">That side leads your menu. Both stay in.</span>
      </section>
    )}
    {type !== "products" && (
      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
        <input type="checkbox" checked={type === "both"} disabled={!!busy} onChange={(e) => { void setSellsProducts(e.target.checked); }} style={{ marginTop: 3 }} />
        <span><strong style={{ display: "block", fontWeight: 600 }}>Sell products too</strong>
          <span className="rp-hint">Adds the Products, stock and shipping pages, for aftercare or merchandise. Gift cards work either way.</span></span>
      </label>
    )}
    {type !== "services" && <ProductGroupsPicker sells={saved} other={otherWords(doc?.otherSells)} onOther={(words) => save("other", { otherSells: words }, words ? "Saved." : "Something else is off.")} />}
    {showBookTools && (
      <div data-book-tools style={{ display: "flex", gap: 16, alignItems: "center", justifyContent: "space-between", padding: "14px 16px", border: "1px solid var(--rp-border)", borderRadius: "var(--rp-radius-lg)" }}>
        <span style={{ display: "grid", gap: 2 }}>
          <strong style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}><BookOpen size={16} aria-hidden />Book tools</strong>
          <span className="rp-hint" style={{ margin: 0 }}>Authors, ISBNs and royalties. Only shops that sell books see this.</span>
        </span>
        <Toggle label={bookTools ? "On" : "Off"} checked={bookTools} disabled={!!busy} onChange={(on) => { void setBookTools(on); }} />
      </div>
    )}
    {type !== "services" && <OwnTypesList />}
    {stockroomWordsNote(saved, heard, justSaved) && <p className="rp-hint" role="status" style={{ margin: 0 }}>{stockroomWordsNote(saved, heard, justSaved)}</p>}
    {confirmNode}
  </>);
  return bare
    ? <div data-what-you-offer style={{ display: "grid", gap: 20 }}>{body}</div>
    : <SectionCard title="What you offer" description="Your shop's type, and what fits it. Products stay as they are."><div data-what-you-offer style={{ display: "grid", gap: 20 }}>{body}</div></SectionCard>;
}
