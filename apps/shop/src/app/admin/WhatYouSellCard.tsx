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
import { SectionCard, SelectField, PrimaryButton } from "./riso/components";
import { FormField } from "./riso/FormKit";

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
    setBusy(true);
    try {
      await adminApi.updateFirstWeek({ sells: value });
      setSaved(value);
      setJustSaved(true);
      window.dispatchEvent(new CustomEvent(SELLS_CHANGED_EVENT, { detail: value }));
      toast.success("Saved. The admin now uses the words for what you sell.");
    } catch {
      toast.error("Couldn't save that. Check your connection and try again.");
    } finally { setBusy(false); }
  };
  const choices = sellsChoicesFor(servicesShop);
  const question = servicesShop ? "What do you do?" : "What do you sell?";
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
        <SelectField label={question} value={value} onChange={(e) => setValue(e.target.value)}>
          {choices.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </SelectField>
        <PrimaryButton onClick={save} busy={busy} disabled={!changed || busy}>Save</PrimaryButton>
      </div>
      <p className="rp-hint" role="status" style={{ margin: "12px 0 0" }}>{stockroomWordsNote(saved, heard, justSaved)}</p>
      {productsSwitch}
  </>);
  return (
    bare ? (<>
      <FormField label={servicesShop ? "What you do" : "What you sell"} hint={stockroomWordsNote(saved, heard, justSaved)}>
        {(a) => <span style={{ display: "flex", gap: 10, width: "100%" }}>
          <select {...a} style={{ flex: 1, minWidth: 0 }} value={value} onChange={(e) => setValue(e.target.value)}>
            {choices.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <PrimaryButton onClick={save} busy={busy} disabled={!changed || busy}>Save</PrimaryButton>
        </span>}
      </FormField>
      {productsSwitch}
    </>) : <SectionCard title="What you sell" description="Sets the words in your admin and emails. Products you already have stay as they are.">{body}</SectionCard>
  );
}
