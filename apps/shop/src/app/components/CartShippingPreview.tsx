import { useEffect, useId, useRef, useState } from "react";
import { functionFetch } from "../lib/functionsBase";
import { getCopy } from "../features/site/storeCopy";
import { COUNTRIES } from "../features/site/shippingZones";
import { guessCountryName } from "../features/site/countryPicker";
import { readCartDestination, saveCartDestination } from "../features/site/cartDestination";
import type { ShippingQuote } from "../features/site/shippingEngine";

export function CartShippingPreview({ cart, design, formatPrice, onEstimate }: { cart: any[]; design: any; formatPrice: (price: number) => string; onEstimate: (price: number | null) => void }) {
  const id = useId();
  const [saved] = useState(readCartDestination);
  // Same first guess checkout makes (browser language), not a fixed country.
  const [country, setCountry] = useState(() => saved?.country || [guessCountryName()].find(name => name && COUNTRIES.some(value => value.name === name)) || "Canada");
  const [postalCode, setPostalCode] = useState(saved?.postalCode || "");
  const [quotes, setQuotes] = useState<ShippingQuote[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error" | "digital">("idle");
  const [selected, setSelected] = useState("");
  const request = useRef(0);
  const signature = JSON.stringify(cart.map(item => ({ id: item.id, variantId: item.variantId || null, quantity: item.quantity })));
  useEffect(() => { request.current++; setQuotes([]); setSelected(""); setStatus("idle"); onEstimate(null); return () => { request.current++; }; }, [signature, country, postalCode]);
  // The destination is handed to checkout only when the shopper asks for an estimate: a half-typed
  // postcode, or one typed against the default country, must not override checkout's own address.
  const estimate = async () => {
    const id = ++request.current;
    setStatus("loading"); onEstimate(null);
    saveCartDestination({ country, postalCode });
    try {
      const response = await functionFetch("cartShippingPreview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: JSON.parse(signature), country, postalCode: postalCode.trim() }) });
      const body = await response.json();
      if (id !== request.current) return;
      if (!response.ok) throw new Error();
      setQuotes(body.quotes || []);
      setStatus(body.digitalOnly ? "digital" : "ready");
      setSelected(body.quotes?.[0]?.id || "");
      onEstimate(body.digitalOnly ? 0 : body.quotes?.[0]?.price ?? null);
    } catch { if (id === request.current) { setStatus("error"); setQuotes([]); onEstimate(null); } }
  };
  const c = (key: string) => getCopy(design, key);
  return <section data-studio-target="style:cartDrawer|copy:Cart" data-studio-label="Cart shipping preview" className="fm-bag-pad fm-bag-rule border-t py-5 space-y-3">
    <h3 className="fm-bag-name">{c("cartEstimateHeading")}</h3>
    <form className="space-y-3" data-clarity-mask="true" onSubmit={event => { event.preventDefault(); estimate(); }}>
      <div><label className="block fm-bag-meta" htmlFor={`${id}-country`}>{c("cartEstimateCountry")}</label><select id={`${id}-country`} className="fm-bag-input w-full mt-2" value={country} onChange={event => setCountry(event.target.value)} autoComplete="country-name">{COUNTRIES.map(value => <option key={value.code} value={value.name}>{value.name}</option>)}</select></div>
      <div><label className="block fm-bag-meta" htmlFor={`${id}-postal`}>{c("cartEstimatePostal")}</label><input id={`${id}-postal`} className="fm-bag-input w-full mt-2" autoComplete="postal-code" maxLength={20} required value={postalCode} onChange={event => setPostalCode(event.target.value)} /></div>
      <button type="submit" className="fm-bag-upsell-btn min-h-[44px] px-4" disabled={status === "loading" || !postalCode.trim()}>{c(status === "loading" ? "cartEstimateLoading" : "cartEstimateButton")}</button>
    </form>
    {status === "ready" && <fieldset className="space-y-2"><legend className="fm-bag-meta">{c("cartEstimateOptions")}</legend>{quotes.map(quote => <label key={quote.id} className="fm-bag-row fm-bag-meta min-h-[44px]"><span><input type="radio" name="cart-shipping-preview" checked={selected === quote.id} onChange={() => { setSelected(quote.id); onEstimate(quote.price); }} /> {quote.name}</span><span>{formatPrice(quote.price)}</span></label>)}{!quotes.length && <p role="status" className="fm-bag-meta">{c("cartEstimateNone")}</p>}</fieldset>}
    {status === "digital" && <p role="status" className="fm-bag-meta">{c("cartEstimateDigital")}</p>}
    {status === "error" && <p role="alert" className="fm-bag-meta fm-bag-warn">{c("cartEstimateError")}</p>}
    <p className="fm-bag-meta" style={{ textTransform: "none", letterSpacing: "0.02em" }}>{c("cartEstimateNotice")}</p>
  </section>;
}
