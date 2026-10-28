// Settings › Taxes › Start from a preset (plan 2.10). A preset fills in the rates a new press most often needs, in the
// draft only (nothing applies until Save), and never changes a rate the press already has. Rates as of October 2026;
// the press checks them, and the page says so. Each added rate gets its name in the books (GST, HST ON…, plan 7.11).
//
// Plan 5.10 adds the provincial sales taxes (PST in British Columbia 7% and Saskatchewan 6%, RST in Manitoba 7%, QST in
// Quebec 9.975%) on top of GST. A shop charges one rate per place on everything in the order, so each preset is for one
// kind of goods, and a rate is GST and the provincial tax added together. How each tax treats books (checked October
// 2026; not tax advice):
// - GST/HST: the five HST provinces (ON, NS, NB, NL, PE) give back their part of HST at the till on printed books only;
//   "electronic and digital books" don't qualify, so e-books pay the full HST. CRA GI-065, Point-of-Sale Rebate on
//   Books: https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/gi-065/point-sale-rebate-on-books.html
// - British Columbia PST: "Printed bound books are exempt from PST" and "Electronic books or e-books are not subject to
//   PST" (literary, cultural, educational or technical books with no advertising). Bulletin PST 205, revised March 2016:
//   https://www2.gov.bc.ca/assets/gov/taxes/sales-taxes/publications/pst-205-books-magazines-newspapers-other-publications.pdf
// - Saskatchewan PST: printed and bound books are exempt, and so are their "digital equivalents formatted for viewing on
//   an electronic device". Information Bulletin PST-9, revised August 2010 (saskatchewan.ca, Saskatchewan eTax Services:
//   https://sets.saskatchewan.ca/rptp/portal/footer/taxinformation/provincial-sales-tax).
// - Manitoba RST: books for the general public published for educational, technical, cultural or literary purposes
//   with no advertising are exempt, including "books on audio or electronic media". Information Bulletin RST 030,
//   Summary of Taxable and Exempt Goods and Services: https://www.gov.mb.ca/finance/taxation/pubs/bulletins/030.pdf
// - Quebec QST: "The sale of a printed book that has an International Standard Book Number (ISBN) is a zero-rated sale
//   under the QST system"; the zero rating is for printed books only, so e-books pay QST. Revenu Québec, Printed Books:
//   https://www.revenuquebec.ca/en/businesses/consumption-taxes/gsthst-and-qst/special-cases-gsthst-and-qst/printed-books/
// So a printed book pays 5% GST everywhere; an e-book pays HST in full in the HST provinces and GST + QST (14.975%) in
// Quebec, and 5% in British Columbia, Saskatchewan and Manitoba; other goods pay GST/HST plus the provincial tax.
import { regionsFor } from "../features/site/postalRegion";
import { suggestedTaxBookName } from "../../shared/taxBooks";
import type { TaxRate } from "./taxRatesEdit";

export type TaxPreset = { id: string; label: string; description: string; country: string; rates: Record<string, string> };

const HST_RATES = { ON: "13", NS: "14", NB: "15", NL: "15", PE: "15" };
/** GST and the provincial sales tax added together: BC 5 + 7, SK 5 + 6, MB 5 + 7, QC 5 + 9.975. */
const GST_PLUS_PROVINCIAL = { BC: "12", SK: "11", MB: "12", QC: "14.975" };

const CANADA_PROVINCES = ["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"] as const;
const everywhere = (rate: string) => Object.fromEntries(CANADA_PROVINCES.map((code) => [code, rate]));

export const TAX_PRESETS: TaxPreset[] = [
  {
    id: "ca-books",
    label: "Canada: printed books",
    description: "5% GST in every province and territory. Provinces with HST give back their share at the till on printed books, so books pay GST only. Printed books also pay no provincial sales tax: they are exempt from PST in British Columbia and Saskatchewan and from RST in Manitoba, and have no QST in Quebec when they have an ISBN.",
    country: "Canada",
    rates: everywhere("5"),
  },
  {
    id: "ca-ebooks",
    label: "Canada: e-books",
    description: "E-books don't get the HST give-back that printed books do, so they pay 13% HST in Ontario, 14% in Nova Scotia and 15% in New Brunswick, Newfoundland and Labrador and Prince Edward Island. In Quebec they pay 5% GST plus 9.975% QST (14.975%) if you are registered for QST. British Columbia, Saskatchewan and Manitoba don't charge their provincial tax on e-books, so they pay 5% GST like everywhere else.",
    country: "Canada",
    rates: { ...everywhere("5"), ...HST_RATES, QC: GST_PLUS_PROVINCIAL.QC },
  },
  {
    id: "ca-goods",
    label: "Canada: GST/HST on other goods",
    description: "13% HST in Ontario, 14% in Nova Scotia, 15% in New Brunswick, Newfoundland and Labrador and Prince Edward Island, and 5% GST everywhere else. Provincial sales tax (PST or QST) isn't included: add it where you are registered.",
    country: "Canada",
    rates: { ...everywhere("5"), ...HST_RATES },
  },
  {
    id: "ca-goods-provincial",
    label: "Canada: other goods with provincial sales tax",
    description: "The GST/HST rates above, plus the provincial sales tax where there is one: 12% in British Columbia (5% GST + 7% PST), 11% in Saskatchewan (5% GST + 6% PST), 12% in Manitoba (5% GST + 7% RST) and 14.975% in Quebec (5% GST + 9.975% QST). Use it only if you are registered for those provincial taxes; otherwise use GST/HST on other goods and add the provinces you are registered in.",
    country: "Canada",
    rates: { ...everywhere("5"), ...HST_RATES, ...GST_PLUS_PROVINCIAL },
  },
];

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

/** The rates with the preset's added for every place that has none yet; `added` and `kept` count the places. */
export function applyTaxPreset(rates: TaxRate[], preset: TaxPreset): { rates: TaxRate[]; added: number; kept: number } {
  const names = new Map((regionsFor(preset.country) || []).map(([code, name]) => [code, name]));
  const next = [...rates];
  let added = 0;
  let kept = 0;
  for (const [code, rate] of Object.entries(preset.rates)) {
    const region = names.get(code);
    if (!region) continue;
    if (next.some((r) => norm(r.country) === norm(preset.country) && norm(r.region) === norm(region))) { kept += 1; continue; }
    next.push({ country: preset.country, region, rate, bookName: suggestedTaxBookName({ country: preset.country, region, rate }) });
    added += 1;
  }
  return { rates: next, added, kept };
}
