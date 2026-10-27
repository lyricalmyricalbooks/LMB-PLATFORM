import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi } from "vitest";

vi.mock("./api", () => ({ adminApi: {} }));
vi.mock("./ordersCache", () => ({ getOrdersCached: async () => [] }));

import { CustomerDetail, type CustomerTab } from "./Customers";
import { buildCustomers } from "./customerInsights";

const [customer] = buildCustomers([
  { id: "o1", orderId: "LM-1001", paymentStatus: "paid", total: 30, createdAt: "2026-09-01T12:00:00Z", customer: { email: "ada@example.com", name: "Ada" }, shippingAddress: { city: "Toronto", country: "Canada" }, items: [{ quantity: 2 }] },
]);

const render = (tab: CustomerTab, draft: any = { note: "Signed copies please", tags: "author", loaded: true }) => renderToStaticMarkup(
  <CustomerDetail customer={customer} tab={tab} onTab={() => {}} draft={draft} onDraft={() => {}}
    notesState="ok" onRetryNotes={() => {}} savingNote={false} onSaveNote={() => {}} onOpenOrder={() => {}} />,
);

const panel = (html: string, id: string) => html.match(new RegExp(`<div role="tabpanel" id="rp-panel-${id}"[^>]*>`))?.[0] || "";

describe("Customer window sub tabs", () => {
  it("shows Summary · Orders · Notes & tags with prefixed tab ids", () => {
    const html = render("cust-summary");
    expect(html).toContain('id="rp-tab-cust-summary"');
    expect(html).toContain('id="rp-tab-cust-orders"');
    expect(html).toContain('id="rp-tab-cust-notes"');
    expect(html).toMatch(/id="rp-tab-cust-summary"[^>]*aria-selected="true"/);
  });

  it("keeps every panel mounted and hides the inactive ones", () => {
    const html = render("cust-orders");
    expect(panel(html, "cust-orders")).not.toContain("hidden");
    expect(panel(html, "cust-summary")).toContain("hidden");
    expect(panel(html, "cust-notes")).toContain("hidden");
    // The note is still in the page while another tab is open, so typing is never lost.
    expect(html).toContain("Signed copies please");
    expect(html).toContain("LM-1001");
  });

  it("puts the private note, tags and Save note on the Notes & tags tab", () => {
    const html = render("cust-notes");
    const notes = html.slice(html.indexOf('id="rp-panel-cust-notes"'));
    expect(notes).toContain("Private note");
    expect(notes).toContain("Save note");
    expect(notes).not.toContain("disabled");
  });

  it("keeps saving off until the stored note is read", () => {
    const html = render("cust-notes", { note: "", tags: "", loaded: false });
    expect(html).toContain("Loading the saved note");
    expect(html).toMatch(/disabled[^>]*>Save note|<button[^>]*disabled[^>]*>Save note/);
  });
});

describe("Customer notes shortcuts", () => {
  it("offers tags used on other customers that this one doesn't have yet", () => {
    const html = renderToStaticMarkup(
      <CustomerDetail customer={customer} tab="cust-notes" onTab={() => {}} draft={{ note: "", tags: "author", loaded: true }} onDraft={() => {}}
        notesState="ok" onRetryNotes={() => {}} savingNote={false} onSaveNote={() => {}} knownTags={["Author", "wholesale"]} onOpenOrder={() => {}} />,
    );
    expect(html).toContain("+ wholesale");
    expect(html).not.toContain("+ Author");
    expect(html).toContain("Ctrl (or ⌘) + Enter saves");
  });
});
