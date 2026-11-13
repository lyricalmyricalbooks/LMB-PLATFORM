// @vitest-environment jsdom
// Receipts by email (beta): off until turned on, "Opening soon" before the platform opens it, and an emailed receipt
// becomes an expense only on the Log expense page, with its file kept first and the email cleared after.
import { createRoot } from "react-dom/client";
import { act, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/firebase", () => ({ auth: { currentUser: null }, app: {}, db: {} }));
vi.mock("./stockroomWrite", () => ({
  stockroomWriteApi: { updateSetting: vi.fn() },
  describeResult: () => ({ tone: "ok", text: "Saved." }),
}));
import { stockroomWriteApi } from "./stockroomWrite";
import { EmailReceipts } from "./EmailReceipts";
import { LogExpenseCard } from "./LogExpense";
import { checkedAgo, EMPTY_INBOX, formFromReceipt, receiptTitle, senderName, type InboxView, type ReceiptInboxApi, type WaitingReceipt } from "./receiptInboxApi";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
async function mount(node: ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(node));
  await act(async () => { await Promise.resolve(); });
  return { container, root };
}
const click = async (el: Element | null | undefined) => { expect(el).toBeTruthy(); await act(async () => { (el as HTMLElement).click(); await Promise.resolve(); await Promise.resolve(); }); };
const button = (c: Element, words: string) => [...c.querySelectorAll("button")].find((b) => (b.getAttribute("aria-label") || b.textContent || "").includes(words));

const receipt: WaitingReceipt = {
  id: "msg-123456", from: '"Example Print Co." <billing@print.example>', subject: "Invoice 2291", receivedAt: "2026-11-11T15:02:00.000Z",
  facts: { vendor: "Example Print Co.", what: "Print run", date: "2026-11-10", total: "412.50", tax: "47.45", currency: "CAD", number: "2291" },
  looksLike: true, hasFile: true, fileName: "invoice-2291.pdf", snippet: "Your invoice is attached",
};
const on: InboxView = { available: true, on: true, address: "receipts+yourpress.abcdefgh@colophon.example", checkedAt: "", gmailCode: null, waiting: [receipt] };
function fakeApi(start: InboxView): ReceiptInboxApi & { calls: string[] } {
  let view = start;
  const calls: string[] = [];
  const say = (name: string, next?: Partial<InboxView>) => async () => { calls.push(name); if (next) view = { ...view, ...next }; return view; };
  return {
    calls, status: say("status"), check: say("check"), start: say("start", { on: true, address: on.address }), stop: say("stop", { on: false }),
    newAddress: say("newAddress"), codeSeen: say("codeSeen", { gmailCode: null }),
    file: async (id) => { calls.push(`file:${id}`); return new File(["x"], "invoice-2291.pdf", { type: "application/pdf" }); },
    done: async (id) => { calls.push(`done:${id}`); },
  };
}

describe("receipts by email: the words", () => {
  it("names a receipt by who it is from, then the subject, then the sender", () => {
    expect(receiptTitle(receipt)).toBe("Example Print Co.");
    expect(receiptTitle({ ...receipt, facts: null })).toBe("Invoice 2291");
    expect(receiptTitle({ facts: null, subject: "", from: "billing@print.example" })).toBe("billing@print.example");
    expect(senderName('"Example Print Co." <billing@print.example>')).toBe("Example Print Co.");
  });
  it("starts the expense form from what was read, and from the email's day when nothing was", () => {
    expect(formFromReceipt(receipt, "CAD", ["CAD", "USD"], "2026-11-12")).toMatchObject({ desc: "Example Print Co.: Print run", date: "2026-11-10", amount: "412.50", currency: "CAD", ref: "2291" });
    expect(formFromReceipt({ ...receipt, facts: null }, "CAD", ["CAD"], "2026-11-12")).toMatchObject({ desc: "Invoice 2291", date: "2026-11-11", amount: "" });
  });
  it("says when it last looked", () => {
    const now = Date.parse("2026-11-12T12:00:00Z");
    expect(checkedAgo("", now)).toBe("Not checked yet");
    expect(checkedAgo("2026-11-12T11:55:00Z", now)).toBe("Checked 5 min ago");
    expect(checkedAgo("2026-11-12T09:00:00Z", now)).toBe("Checked 3 h ago");
  });
});

describe("receipts by email: the card", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("says Opening soon, with nothing to press, until the platform has opened it", async () => {
    const { container } = await mount(<EmailReceipts baseCurrency="CAD" api={fakeApi(EMPTY_INBOX)} />);
    expect(container.textContent).toContain("Beta");
    expect(container.textContent).toContain("Opening soon");
    expect(container.querySelectorAll("button").length).toBe(0);
  });

  it("is off until the owner asks for an address, then shows it with the three steps", async () => {
    const api = fakeApi({ ...EMPTY_INBOX, available: true });
    const { container } = await mount(<EmailReceipts baseCurrency="CAD" api={api} />);
    expect(api.calls).toEqual(["status"]);
    await click(button(container, "Get my receipts address"));
    expect(api.calls).toContain("start");
    expect(container.textContent).toContain(on.address);
    expect(document.body.textContent).toContain("How receipts by email works");
    expect(document.body.querySelectorAll(".rp-er-steps > li").length).toBe(3);
  });

  it("lists what is waiting, hands one to the review, and clears one that isn't a receipt without adding anything", async () => {
    const api = fakeApi({ ...on, waiting: [receipt, { ...receipt, id: "msg-news-22", looksLike: false, facts: {}, subject: "Fair news", hasFile: false }] });
    const onReview = vi.fn();
    const { container } = await mount(<EmailReceipts baseCurrency="CAD" api={api} onReview={onReview} />);
    expect(api.calls).toEqual(["status", "check"]);
    expect(container.textContent).toContain("2 waiting for you");
    expect(container.textContent).toContain("Might not be a receipt");
    await click(button(container, "Check and add Example Print Co."));
    expect(onReview).toHaveBeenCalledWith(expect.objectContaining({ id: "msg-123456" }));
    await click(button(container, "Fair news is not a receipt"));
    expect(api.calls).toContain("done:msg-news-22");
    expect(container.textContent).toContain("Nothing was added");
    expect(container.querySelectorAll(".rp-er-item").length).toBe(1);
  });

  it("shows Gmail's forwarding code until the owner says it is done", async () => {
    const api = fakeApi({ ...on, waiting: [], gmailCode: { code: "482913076", from: "owner@example.com" } });
    const { container } = await mount(<EmailReceipts baseCurrency="CAD" api={api} />);
    expect(container.textContent).toContain("482913076");
    await click(button(container, "Done"));
    expect(api.calls).toContain("codeSeen");
    expect(container.textContent).not.toContain("482913076");
  });
});

describe("receipts by email: adding the checked receipt", () => {
  beforeEach(() => { document.body.innerHTML = ""; vi.mocked(stockroomWriteApi.updateSetting).mockReset(); });

  it("keeps the email's file first, saves the expense with it attached, then clears the email", async () => {
    const order: string[] = [];
    const inbox = { file: async (id: string) => { order.push(`file:${id}`); return new File(["x"], "invoice.pdf", { type: "application/pdf" }); }, done: async (id: string) => { order.push(`done:${id}`); } };
    const upload = async () => { order.push("upload"); return "https://files.example/receipts/invoice.pdf"; };
    let saved: any = null;
    vi.mocked(stockroomWriteApi.updateSetting).mockImplementation(async (_name: any, mutate: any) => { order.push("save"); saved = mutate({ settings: { baseCurrency: "CAD" } }); return { status: "saved", value: saved } as any; });
    const onSaved = vi.fn();
    const { container } = await mount(<LogExpenseCard page taxCenter={{ settings: { baseCurrency: "CAD" } }} onSaved={onSaved} emailReceipt={receipt} inbox={inbox} upload={upload} />);
    expect((container.querySelector('input[type="number"]') as HTMLInputElement).value).toBe("412.50");
    expect(container.textContent).toContain("invoice-2291.pdf is kept as the receipt");
    await click(button(container, "Add expense"));
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(order).toEqual(["file:msg-123456", "upload", "save", "done:msg-123456"]);
    expect(saved.businessExpenses[0]).toMatchObject({ desc: "Example Print Co.: Print run", amount: 412.5, date: "2026-11-10", ref: "2291", receipt: "https://files.example/receipts/invoice.pdf" });
    expect(onSaved).toHaveBeenCalled();
  });

  it("adds nothing when the file can't be kept, and leaves the email waiting", async () => {
    const done = vi.fn();
    const inbox = { file: async () => { throw new Error("boom"); }, done };
    const { container } = await mount(<LogExpenseCard page taxCenter={{ settings: { baseCurrency: "CAD" } }} onSaved={vi.fn()} emailReceipt={receipt} inbox={inbox} upload={async () => "x"} />);
    await click(button(container, "Add expense"));
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(stockroomWriteApi.updateSetting).not.toHaveBeenCalled();
    expect(done).not.toHaveBeenCalled();
    expect(container.textContent).toContain("nothing was added");
  });
});
