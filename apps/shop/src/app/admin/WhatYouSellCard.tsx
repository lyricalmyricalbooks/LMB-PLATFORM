// Settings › General › What you sell (plan 12.14): the owner's own answer to sign-up's "What do you sell?", saved as
// `firstWeek/start` › `sells` and read before the sign-up answer. It changes the admin's words, new products' starting
// kind and the emails' words; products already made are never touched. A shop of "Books and other things" speaks of
// products and makers while book products keep their book fields.
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { adminApi } from "./api";
import { currentSells } from "./sells";
import { sellsServices } from "../../shared/shopSells";
import { inventoryLinkApi } from "./inventoryLinkApi";
import { SELLS_CHANGED_EVENT, SELLS_PRODUCTS_CHANGED_EVENT } from "./shopWords";
import { SectionCard, SelectField, PrimaryButton, useConfirm } from "./riso/components";
import { useBookingsOn } from "./bookingsApi";
import { FormField } from "./riso/FormKit";
import { X } from "lucide-react";
import { typeById } from "../../shared/productTypes";
import { removeOwnType, useOwnTypes } from "./ownTypes";

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

/** `bare` drops the card around it, for a form kit section that already names it (Settings › General, v4). */
export function WhatYouSellCard({ bare }: { bare?: boolean } = {}) {
  const [saved, setSaved] = useState<string | null | undefined>(undefined);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [heard, setHeard] = useState<string | null>(null);
  // A services shop (made so at sign-up) picks what it does, and may also sell a few products.
  const [servicesShop, setServicesShop] = useState(false);
  const [products, setProducts] = useState(false);
  const [productsBusy, setProductsBusy] = useState(false);
  const bookingsOn = useBookingsOn(true);
  const [ask, confirmNode] = useConfirm();
  useEffect(() => {
    let live = true;
    Promise.resolve().then(() => adminApi.getFirstWeek()).then((doc) => {
      if (!live) return;
      const now = currentSells(doc);
      setSaved(now);
      setServicesShop(sellsServices(now) || sellsServices(doc?.publishes));
      setProducts(doc?.sellsProducts === true);
      // "A mix" from sign-up is books and other publications: show it as Books.
      setValue(now === "mix" ? "books" : now || "books");
    }).catch(() => { if (live) setSaved(null); });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    let live = true;
    Promise.resolve().then(() => inventoryLinkApi.state()).then((st) => { if (live) setHeard(typeof st?.app?.wordsSells === "string" ? st.app.wordsSells : null); }).catch(() => {});
    return () => { live = false; };
  }, []);
  if (saved === undefined) return null;
  const changed = value !== (saved === "mix" ? "books" : saved || "books");
  const save = async () => {
    const question = kindSwitchQuestion(saved, value);
    if (question && !(await ask(question))) return;
    setBusy(true);
    try {
      await adminApi.updateFirstWeek({ sells: value });
      setSaved(value);
      setServicesShop(sellsServices(value));
      setJustSaved(true);
      window.dispatchEvent(new CustomEvent(SELLS_CHANGED_EVENT, { detail: value }));
      toast.success(question ? (sellsServices(value) ? "You're a services shop now." : "You're a product shop now.") : "Saved. The admin now uses the words for what you sell.");
    } catch {
      toast.error("Couldn't save that. Check your connection and try again.");
    } finally { setBusy(false); }
  };
  const groups = sellsGroupsFor(servicesShop, servicesShop || bookingsOn);
  const options = groups.map((g) => g.label
    ? <optgroup key={g.label} label={g.label}>{g.choices.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</optgroup>
    : g.choices.map((c) => <option key={c.id} value={c.id}>{c.label}</option>));
  const question = sellsServices(value) ? "What do you do?" : "What do you sell?";
  const setSellsProducts = async (on: boolean) => {
    setProductsBusy(true);
    try {
      await adminApi.updateFirstWeek({ sellsProducts: on });
      setProducts(on);
      window.dispatchEvent(new CustomEvent(SELLS_PRODUCTS_CHANGED_EVENT, { detail: on }));
      toast.success(on ? "Products, stock and shipping are back in your menu." : "Your menu is back to bookings and clients.");
    } catch {
      toast.error("Couldn't save that. Check your connection and try again.");
    } finally { setProductsBusy(false); }
  };
  const productsSwitch = servicesShop ? (
    <label style={{ display: "flex", gap: 10, alignItems: "flex-start", margin: "14px 0 0", cursor: "pointer" }}>
      <input type="checkbox" checked={products} disabled={productsBusy} onChange={(e) => { void setSellsProducts(e.target.checked); }} style={{ marginTop: 3 }} />
      <span><strong style={{ display: "block", fontWeight: 600 }}>Sell products too</strong>
        <span className="rp-hint">Adds the Products, stock and shipping pages, for aftercare or merchandise. Gift cards work either way.</span></span>
    </label>
  ) : null;
  const body = (<>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "end" }}>
        <SelectField label={question} value={value} onChange={(e) => setValue(e.target.value)}>{options}</SelectField>
        <PrimaryButton onClick={save} busy={busy} disabled={!changed || busy}>Save</PrimaryButton>
      </div>
      <p className="rp-hint" role="status" style={{ margin: "12px 0 0" }}>{stockroomWordsNote(saved, heard, justSaved)}</p>
      {productsSwitch}
      {!sellsServices(value) && <div style={{ marginTop: 16 }}><OwnTypesList /></div>}
      {confirmNode}
  </>);
  return (
    bare ? (<>
      <FormField label={sellsServices(value) ? "What you do" : "What you sell"} hint={stockroomWordsNote(saved, heard, justSaved)}>
        {(a) => <span style={{ display: "flex", gap: 10, width: "100%" }}>
          <select {...a} className="rp-select" style={{ flex: 1, minWidth: 0, width: "auto" }} value={value} onChange={(e) => setValue(e.target.value)}>{options}</select>
          <PrimaryButton onClick={save} busy={busy} disabled={!changed || busy}>Save</PrimaryButton>
        </span>}
      </FormField>
      {productsSwitch}
      {(!servicesShop || products) && <OwnTypesList />}
      {confirmNode}
    </>) : <SectionCard title="What you sell" description="Sets the words in your admin and emails. Products you already have stay as they are.">{body}</SectionCard>
  );
}
