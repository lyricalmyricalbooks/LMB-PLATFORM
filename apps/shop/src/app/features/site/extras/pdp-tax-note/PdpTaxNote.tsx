import { Link } from "react-router";
import { policySlug } from "../../policyPages";
import { regionProps } from "../../storefrontRegions";
import { taxNoteParts, taxNoteText } from "./pdpTaxNote";

// "Taxes and shipping calculated at checkout." under the book page price (Studio › Style › Book page · photos
// & layout › showPdpTaxNote, off by default). Display only: checkout still works out tax and shipping.
// Words: Text & labels › Product page (`pdpTaxNote*`).
export default function PdpTaxNote({ design, physical, taxed, policies }: { design: any; physical: boolean; taxed: boolean; policies: any }) {
  const text = taxNoteText(design, { physical, taxed });
  const hasShippingPage = typeof policies?.shipping === "string" && policies.shipping.trim().length > 0;
  const parts = taxNoteParts(text, hasShippingPage);
  if (!parts.some((p) => p.text.trim())) return null;
  return (
    <p {...regionProps("productTaxNote")} className="fm-pdp-tax-note fm-pdp-meta w-full basis-full">
      {parts.map((p, i) => p.link
        ? <Link key={i} to={`/page/${policySlug("shipping")}`} className="underline underline-offset-2">{p.text}</Link>
        : <span key={i}>{p.text}</span>)}
    </p>
  );
}
