// A Colophon bill as a printed page in the Colophon look, on the shared document kit (shared/documentKit.ts): Colophon
// and its tax number at the top, who the bill is to, its lines, the tax lines by name, the total and what was paid.
// Every figure is the platform's words for Stripe's own amounts (services/billing billPaper); this file only places
// them. Print or Save as PDF goes through the browser's print dialog, like the invoices. Stripe's PDF stays beside it.
import { docRaw, documentFrame, documentPage, documentTable, documentTotals, type DocTotal } from "../../shared/documentKit";
import { billCoversWords, billState, type Bill } from "./platformBilling";
import { planDate } from "./platformPlan";

const escape = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

/** One bill as a document (no page around it). Empty when the platform sent no paper for it (an older answer). */
export function billPaperHtml(bill: Bill): string {
  const p = bill.paper;
  if (!p) return "";
  const state = billState(bill.status).word;
  const totals: DocTotal[] = [{ label: "Subtotal", value: p.subtotal }];
  if (p.discount) totals.push({ label: "Discount", value: `−${p.discount}` });
  for (const t of p.taxes) totals.push({ label: t.words, value: t.amount });
  totals.push({ label: `Total (${p.currency})`, value: p.total, strong: true });
  if (bill.status === "paid") totals.push({ label: p.paidAt ? `Paid ${planDate(p.paidAt)}` : "Paid", value: p.paid });
  else if (bill.status === "open") totals.push({ label: "Still to pay", value: p.due });
  const to = [p.to.name, ...p.to.address, p.to.email, ...p.to.taxNumbers].filter(Boolean);
  const covers = billCoversWords(bill.covers);
  return documentFrame({
    press: { name: p.from.name, lines: [p.from.address, ...p.from.taxNumbers].filter(Boolean) },
    title: "Bill",
    reference: [bill.number, state].filter(Boolean).join(" · "),
    details: [
      { label: "Billed to", value: docRaw(to.map(escape).join("<br>") || "—") },
      ...(bill.date ? [{ label: "Date", value: planDate(bill.date) }] : []),
      ...(covers ? [{ label: "For", value: covers }] : []),
      { label: bill.status === "paid" ? "Paid" : "Amount", value: p.total },
    ],
    body: documentTable([{ label: "What it's for" }, { label: "Amount", align: "right" }], p.lines.map((l) => [l.words, docRaw(`<strong>${escape(l.amount)}</strong>`)]))
      + documentTotals(totals),
    footer: `Thank you for running your shop on ${p.from.name}.`,
  });
}

/** A whole printable page for one bill. */
export const billPage = (bill: Bill) => documentPage(`Bill ${bill.number || ""}`.trim(), billPaperHtml(bill));

/** Opens the print dialog (Print or Save as PDF) for one bill, the hidden-frame way invoices print. */
export function printBill(bill: Bill) {
  const frame = document.createElement("iframe");
  frame.title = `Bill ${bill.number || ""}`; frame.style.cssText = "position:fixed;width:1px;height:1px;left:-9999px";
  frame.onload = () => { frame.contentWindow?.addEventListener("afterprint", () => frame.remove(), { once: true }); frame.contentWindow?.focus(); frame.contentWindow?.print(); };
  frame.srcdoc = billPage(bill);
  document.body.appendChild(frame);
}
