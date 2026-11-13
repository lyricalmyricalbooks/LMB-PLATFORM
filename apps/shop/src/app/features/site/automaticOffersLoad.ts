import { functionFetch } from "../../lib/functionsBase";

// The shop's no-code offers (Discounts › automatic), read once per visit for the free-shipping bar and the book page's
// free-shipping line. Display only: checkout prices every order on the server. A failed read is forgotten, so the
// next caller tries again; until then the bar uses Settings › Shipping alone.
let offersLoad: Promise<any[] | null> | null = null;

async function readOffers(): Promise<any[] | null> {
  const res = await functionFetch("validateDiscountCode", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "automaticDiscounts" }),
  });
  const data = res.ok ? await res.json() : null;
  if (!Array.isArray(data?.discounts)) throw new Error("no offers");
  return data.discounts;
}

export const loadAutomaticOffers = () => (offersLoad ||= readOffers().catch(() => { offersLoad = null; return null; }));
