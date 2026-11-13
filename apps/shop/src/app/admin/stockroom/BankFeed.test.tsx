// @vitest-environment jsdom
// Bank feed (beta): "Opening soon" until the platform opens it, the add-on before a bank, a bank through Plaid, then
// each bank line confirmed with one tap. A bookkeeper sees the list and changes nothing.
import { createRoot } from "react-dom/client";
import { act, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/firebase", () => ({ auth: { currentUser: null }, app: {}, db: {} }));
import { BankFeed } from "./BankFeed";
import { EMPTY_BANK_VIEW, type BankFeedApi, type BankMatch, type BankView } from "./bankFeedApi";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
async function mount(node: ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(node));
  for (let i = 0; i < 4; i += 1) await act(async () => { await Promise.resolve(); });
  return { container, root };
}
const click = async (el: Element | null | undefined) => { expect(el).toBeTruthy(); await act(async () => { (el as HTMLElement).click(); for (let i = 0; i < 6; i += 1) await Promise.resolve(); }); };
const button = (c: Element, words: string) => [...c.querySelectorAll("button")].find((b) => (b.getAttribute("aria-label") || b.textContent || "").includes(words));

const addOn = { on: true, price: "CA$4", extraPrice: "CA$1.50", included: 2 };
const bank = { id: "bank01", name: "First Platypus Bank", accounts: ["Chequing ••1234"], connectedAt: "2026-11-13T15:00:00.000Z" };
const on: BankView = {
  available: true, addOn, banks: [bank], checkedAt: "", matches: [],
  waiting: [
    { id: "tx-paper", bankId: "bank01", date: "2026-11-10", cents: -1200, currency: "CAD", name: "PAPER SUPPLY CO", account: "Chequing ••1234" },
    { id: "tx-new", bankId: "bank01", date: "2026-11-09", cents: -1699, currency: "CAD", name: "CANVA* 02913", account: "Chequing ••1234" },
    { id: "tx-in", bankId: "bank01", date: "2026-11-08", cents: 4400, currency: "CAD", name: "E-TRANSFER", account: "Chequing ••1234" },
  ],
};
const taxCenter = { businessExpenses: [{ id: 7, desc: "Paper", amount: 12, currency: "CAD", date: "2026-11-10" }], expenseRules: [{ id: "r1", match: "canva", cat: "Software & Subscriptions" }] };

function fakeApi(start: BankView): BankFeedApi & { calls: string[]; decided: BankMatch[] } {
  let view = start;
  const calls: string[] = [];
  const decided: BankMatch[] = [];
  return {
    calls, decided,
    status: async () => { calls.push("status"); return view; },
    check: async () => { calls.push("check"); return view; },
    connect: async (bankId) => { calls.push(`connect:${bankId ?? ""}`); view = { ...view, banks: [...view.banks.filter((b) => b.id !== bankId), bankId ? { ...bank, id: bankId } : bank] }; return view; },
    disconnect: async (bankId) => { calls.push(`disconnect:${bankId}`); view = { ...view, banks: view.banks.filter((b) => b.id !== bankId) }; return view; },
    decide: async (matches) => { calls.push("decide"); decided.push(...matches); view = { ...view, waiting: view.waiting.filter((l) => !matches.some((m) => m.lineId === l.id)), matches: [...view.matches, ...matches] }; return view; },
  };
}
const render = (view: BankView, props: { owner?: boolean; save?: any } = {}) => {
  const api = fakeApi(view);
  const onTaxCenter = vi.fn();
  return mount(<BankFeed orders={[]} taxCenter={taxCenter} api={api} onTaxCenter={props.owner === false ? undefined : onTaxCenter} save={props.save} />).then((m) => ({ ...m, api, onTaxCenter }));
};

describe("Bank feed card", () => {
  it("says Opening soon until the platform has opened it, and names Plaid with its logo", async () => {
    const { container, api } = await render(EMPTY_BANK_VIEW);
    expect(container.textContent).toContain("Opening soon");
    expect(container.querySelector('svg[aria-label="Plaid"]')).toBeTruthy();
    expect(container.querySelector("button")).toBeNull();
    expect(api.calls).toEqual(["status"]);
  });

  it("before the add-on: the price and a link to Settings › Plan for the owner only", async () => {
    const off = { ...EMPTY_BANK_VIEW, available: true, addOn: { ...addOn, on: false } };
    const owner = await render(off);
    expect(owner.container.textContent).toContain("CA$4 a month for up to two banks, then CA$1.50 for each extra bank.");
    expect(owner.container.querySelector('a[href="#settings/plan"]')?.textContent).toBe("Add bank feed");
    const keeper = await render(off, { owner: false });
    expect(keeper.container.querySelector('a[href="#settings/plan"]')).toBeNull();
  });

  it("with the add-on and no bank: Connect your bank with Plaid opens the window and the bank shows", async () => {
    const { container, api } = await render({ ...on, banks: [], waiting: [] });
    expect(container.textContent).toContain("no money can move");
    await click(button(container, "Connect your bank with Plaid"));
    expect(api.calls).toContain("connect:");
    expect(container.textContent).toContain("First Platypus Bank");
    expect(container.textContent).toContain("Bank connected.");
  });

  it("each line shows what it most likely is, and one tap confirms a match", async () => {
    const { container, api } = await render(on);
    expect(api.calls).toEqual(["status", "check"]);
    expect(container.textContent).toContain("3 to review");
    const lines = [...container.querySelectorAll(".rp-bf-line")];
    expect(lines.map((l) => l.getAttribute("data-kind"))).toEqual(["expense", "new", "none"]);
    expect(lines[0].textContent).toContain("Paper");
    expect((lines[1].querySelector("select") as HTMLSelectElement).value).toBe("Software & Subscriptions");
    await click(button(container, "Confirm PAPER SUPPLY CO is Paper"));
    expect(api.decided).toEqual([{ lineId: "tx-paper", kind: "expense", ref: "7" }]);
    expect(container.textContent).toContain("2 to review");
    await click(button(container, "Skip E-TRANSFER"));
    expect(api.decided[1]).toEqual({ lineId: "tx-in", kind: "skipped", ref: "" });
  });

  it("Add expense saves it to the books under the rule's category, then marks the line added with that expense", async () => {
    const save = vi.fn(async (change: (current: any) => any) => {
      const next = change(structuredClone(taxCenter));
      return { ok: true, taxCenter: next, note: { tone: "ok", text: "Added to Software & Subscriptions." } };
    });
    const { container, api, onTaxCenter } = await render(on, { save });
    await click(button(container, "Add CANVA* 02913 as an expense"));
    expect(save).toHaveBeenCalledTimes(1);
    const added = onTaxCenter.mock.calls[0][0].businessExpenses.find((e: { desc: string }) => e.desc === "CANVA* 02913");
    expect(added).toMatchObject({ desc: "CANVA* 02913", cat: "Software & Subscriptions", date: "2026-11-09", amount: 16.99 });
    expect(api.decided).toEqual([{ lineId: "tx-new", kind: "added", ref: String(added.id) }]);
    expect(container.textContent).toContain("Added to Software & Subscriptions.");
  });

  it("a save that fails adds nothing and leaves the line waiting", async () => {
    const save = vi.fn(async () => ({ ok: false, note: { tone: "error", text: "Couldn't save. Try again." } }));
    const { container, api } = await render(on, { save });
    await click(button(container, "Add CANVA* 02913 as an expense"));
    expect(api.decided).toEqual([]);
    expect(container.textContent).toContain("Couldn't save. Try again.");
    expect(container.textContent).toContain("3 to review");
  });

  it("a bank that wants a new sign-in says so and signs in again for that bank", async () => {
    const { container, api } = await render({ ...on, banks: [{ ...bank, needsSignIn: true }] });
    expect(container.textContent).toContain("Your bank wants you to sign in again");
    await click(button(container, "Sign in again"));
    expect(api.calls).toContain("connect:bank01");
  });

  it("the bookkeeper sees the banks and the lines, with nothing to press but Check now", async () => {
    const { container } = await render(on, { owner: false });
    expect(container.textContent).toContain("3 to review");
    expect([...container.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Check now"]);
    expect(container.querySelector("select")).toBeNull();
  });
});
