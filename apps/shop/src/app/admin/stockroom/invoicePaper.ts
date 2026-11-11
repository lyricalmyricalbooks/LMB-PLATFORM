// The printed invoice, on the shared document kit (shared/documentKit.ts): the press at the top, who it bills, the
// lines, the totals, then payment, notes, terms and bank details. Every figure comes from the saved invoice (the
// stockroom's own arithmetic); this file only places it. Print or Save as PDF goes through the browser's print dialog.
import { clampPercent, formatInvoiceUnitPrice, invoiceHasLineDiscounts, invoiceLineAmount } from "@stockroom/invoices.js";
import { fmt, fmtD, getSym } from "@stockroom/money.js";

import { docRaw, documentFrame, documentPage, documentTable, documentTotals, type DocCell, type DocTotal } from "../../../shared/documentKit";
import type { InvoiceSettings } from "./invoiceMake";

type Rec = Record<string, any>;
const escape = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const lines = (...parts: unknown[]) => parts.map((p) => String(p ?? "").trim()).filter(Boolean);
const block = (title: string, body: string) => (body.trim() ? `<div style="margin-top:14px;break-inside:avoid"><strong>${escape(title)}</strong><div style="white-space:pre-wrap">${escape(body.trim())}</div></div>` : "");

/** One invoice as a document (no page around it). `today` decides whether a sent invoice reads as overdue. */
export function invoicePaperHtml(inv: Rec, settings: InvoiceSettings, today: string, opts: { reminder?: boolean } = {}): string {
  const code = String(inv.currencyCode || inv.currency || "CAD");
  const money = (n: unknown) => fmt(Number(n) || 0, code);
  const items = (Array.isArray(inv.items) ? inv.items : []) as Rec[];
  const disc = invoiceHasLineDiscounts(items);
  const columns = [{ label: "Item" }, { label: "Qty", align: "right" as const }, { label: "Unit price", align: "right" as const },
    ...(disc ? [{ label: "Disc.", align: "right" as const }] : []), { label: "Amount", align: "right" as const }];
  const rows: DocCell[][] = items.map((it) => [
    it.description || "—", Number(it.qty) || 0, formatInvoiceUnitPrice(it.unitPrice, getSym(code)),
    ...(disc ? [clampPercent(it.discountPct) > 0 ? `${clampPercent(it.discountPct)}%` : "—"] : []),
    docRaw(`<strong>${escape(money(invoiceLineAmount(it)))}</strong>`),
  ]);
  const totals: DocTotal[] = [{ label: "Subtotal", value: money(inv.subtotal) }];
  if (Number(inv.discount) > 0) totals.push({ label: `Discount${inv.discountType === "percent" && inv.discountRate ? ` (${inv.discountRate}%)` : ""}`, value: `−${money(inv.discount)}` });
  if (Number(inv.taxRate) > 0) totals.push({ label: `Tax (${inv.taxRate}%)`, value: money(inv.tax) });
  totals.push({ label: "Total due", value: money(inv.total), strong: true });

  const billed = lines(inv.storeName || "—", inv.storeContact, inv.storeEmail, inv.storePhone, inv.storeAddress,
    lines(inv.storeCity, inv.storeRegion, inv.storePostal).join(", "), inv.storeCountry);
  const overdue = inv.status === "sent" && inv.dueDate && String(inv.dueDate) < today;
  const status = overdue ? "Overdue" : inv.status === "paid" ? "Paid" : inv.status === "cancelled" ? "Cancelled" : inv.status === "draft" ? "Draft" : "";
  const link = String(inv.paymentLink || "").trim();
  const pay = !link || inv.status === "paid" ? ""
    : /^https?:\/\//i.test(link) ? `<p style="margin-top:14px"><strong>Pay online:</strong> <a href="${escape(link)}">${escape(link)}</a></p>`
      : /^[^\s@]+@[^\s@]+$/.test(link) ? `<p style="margin-top:14px"><strong>Send ${escape(money(inv.total))} by Interac e-Transfer to</strong> ${escape(link)}</p>`
        : `<p style="margin-top:14px"><strong>How to pay:</strong> ${escape(link)}</p>`;

  const daysLate = overdue ? Math.round((Date.parse(today) - Date.parse(String(inv.dueDate))) / 86_400_000) : 0;
  const lead = opts.reminder && overdue
    ? `<p style="margin-bottom:14px">A friendly reminder: this invoice was due on ${escape(fmtD(inv.dueDate))}${daysLate > 0 ? `, ${daysLate} day${daysLate === 1 ? "" : "s"} ago` : ""}. If you've already paid, thank you, and please ignore this note.</p>`
    : "";

  return documentFrame({
    press: { name: settings.name, lines: [...lines(...settings.addr.split("\n")), ...lines(settings.email, settings.web), ...(settings.vat ? [`Tax number: ${settings.vat}`] : [])] },
    title: opts.reminder ? "Payment reminder" : "Invoice",
    reference: [inv.num, status].filter(Boolean).join(" · "),
    details: [
      { label: "Billed to", value: docRaw(billed.map(escape).join("<br>")) },
      { label: "Issue date", value: fmtD(inv.date) },
      ...(inv.dueDate ? [{ label: "Due", value: fmtD(inv.dueDate) }] : []),
      { label: "Amount due", value: inv.status === "paid" ? `${money(inv.total)} (paid)` : money(inv.total) },
    ],
    body: lead + documentTable(columns, rows) + documentTotals(totals) + pay
      + block("Notes", String(inv.notes || "")) + block("Terms", String(inv.terms || "")) + block("Bank transfer", settings.bank),
    footer: settings.footer,
  });
}

/** A whole printable page for one invoice. */
export const invoicePage = (inv: Rec, settings: InvoiceSettings, today: string, opts: { reminder?: boolean } = {}) =>
  documentPage(`${opts.reminder ? "Reminder" : "Invoice"} ${inv.num || ""}`.trim(), invoicePaperHtml(inv, settings, today, opts));

/** Opens the print dialog (Print or Save as PDF) for one invoice, the hidden-frame way the line sheet prints. */
export function printInvoice(inv: Rec, settings: InvoiceSettings, today: string, opts: { reminder?: boolean } = {}) {
  const frame = document.createElement("iframe");
  frame.title = `Invoice ${inv.num || ""}`; frame.style.cssText = "position:fixed;width:1px;height:1px;left:-9999px";
  frame.onload = () => { frame.contentWindow?.addEventListener("afterprint", () => frame.remove(), { once: true }); frame.contentWindow?.focus(); frame.contentWindow?.print(); };
  frame.srcdoc = invoicePage(inv, settings, today, opts);
  document.body.appendChild(frame);
}
