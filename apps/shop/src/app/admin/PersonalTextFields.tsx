import { TextField, Toggle } from "./riso/components";
import { MONEY_SIGN } from "./moneySign";
import { MAX_ADD_ONS, newAddOn, personalAddOn, personalTextFor } from "./productExtras";
import type { ProductType } from "../../shared/productTypes";

/**
 * Engraving and other personal text (product types plan, round 2), on the first page of a product whose type can be
 * personalised (jewelry, wallets, notebooks, collars, custom orders). It is one text add-on, marked `personal`, so the
 * product page's box, the letter count, the extra charge, the order, packing slip and emails all work as they do for any
 * add-on; the Add-ons part lists it with the rest.
 */
export function PersonalTextFields({ form, type, set }: { form: any; type: ProductType | null; set: (name: string, value: any) => void }) {
  const addOns: any[] = Array.isArray(form.addOns) ? form.addOns : [];
  const current = personalAddOn(addOns);
  const start = personalTextFor(type);
  const full = !current && addOns.length >= MAX_ADD_ONS;
  const turn = (on: boolean) => set("addOns", on
    ? [...addOns, { ...newAddOn({ ...start, kind: "text" }), personal: true }]
    : addOns.filter((a) => a !== current));
  const update = (patch: any) => current && set("addOns", addOns.map((a) => (a === current ? { ...a, ...patch } : a)));
  return (
    <div className="be-personal">
      <Toggle label={`Shoppers can add ${start.label === "Personal text" ? "personal text" : start.label.toLowerCase()}`} checked={!!current} onChange={turn} disabled={full} />
      {full && <p className="rp-hint mt-2">{`This product already has ${MAX_ADD_ONS} add-ons. Remove one in Add-ons first.`}</p>}
      {current && (
        <div className="be-grid be-grid-3 mt-4">
          <TextField label="What shoppers see" maxLength={80} value={current.label} onChange={(e) => update({ label: e.target.value })} />
          <TextField label="Most letters" type="number" min={1} max={300} step={1} value={current.maxLength ?? start.maxLength}
            onChange={(e) => update({ maxLength: e.target.value === "" ? "" : Math.max(1, Math.min(300, Math.floor(Number(e.target.value)) || 1)) })}
            hint="Spaces count too." />
          <TextField label={`Extra charge (${MONEY_SIGN})`} type="number" min={0} step="0.01" value={current.price}
            onChange={(e) => update({ price: e.target.value === "" ? "" : Number(e.target.value) })} hint="0 to do it free." />
        </div>
      )}
      {current && <p className="rp-hint mt-2">Shoppers type it on the product page. It prints on the order, the packing slip and the emails.</p>}
    </div>
  );
}
