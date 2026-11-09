// @vitest-environment jsdom
// Admin › Gift cards › Bring gift cards over (plan 23.5): the file is previewed, sent to the server, and the result shown.
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  giftCardAdmin: vi.fn(async (_op: string, body: any) => ({
    added: body.cards.length - 1, newCodes: 1, emailed: body.sendEmail ? 1 : 0, emailFailed: 0,
    skipped: [{ oldRef: body.cards[body.cards.length - 1].oldRef, reason: "already brought over" }],
  })),
}));
vi.mock("./api", () => ({ adminApi: api }));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const { ImportDialog } = await import("./GiftCards");

let root: Root | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; vi.clearAllMocks(); });
const flush = async () => { for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); }); };
const button = (text: RegExp) => [...document.querySelectorAll("button")].find((b) => text.test(b.textContent || "")) as HTMLButtonElement;

const FILE = [
  "Id,Last Characters,Customer Name,Email,Expires On,Balance,Currency",
  "101,a1b2,Ada,ada@example.com,2099-12-31,25.00,CAD",
  "102,,Ben,,,10.00,CAD",
  "103,c3d4,Cy,cy@example.com,,0,CAD",
].join("\n");

describe("Bring gift cards over", () => {
  it("previews the file, sends the cards with the email choice, and reports what came over", async () => {
    const onDone = vi.fn();
    const host = document.body.appendChild(document.createElement("div"));
    root = createRoot(host);
    act(() => root!.render(h(ImportDialog, { onClose: () => {}, onDone })));
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([FILE], "gift_cards.csv", { type: "text/csv" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
    await flush();

    expect(document.body.textContent).toContain("2 gift cards");
    expect(document.body.textContent).toContain("CA$35.00");
    expect(document.body.textContent).toMatch(/hides the full code of 2 cards/);
    expect(document.body.textContent).toMatch(/1 card with a new code has no email address/);
    expect(document.body.textContent).toContain("1 line left out");

    await act(async () => { button(/Bring 2 gift cards over/).click(); });
    await flush();
    expect(api.giftCardAdmin).toHaveBeenCalledTimes(1);
    const [op, body] = api.giftCardAdmin.mock.calls[0] as [string, any];
    expect(op).toBe("import");
    expect(body.sendEmail).toBe(true);
    expect(body.cards).toEqual([
      { oldRef: "id:101", balanceMinor: 2500, expiresOn: "2099-12-31", recipientEmail: "ada@example.com", recipientName: "Ada" },
      { oldRef: "id:102", balanceMinor: 1000, recipientName: "Ben" },
    ]);
    expect(document.body.textContent).toContain("1 gift card added");
    expect(document.body.textContent).toContain("1 holder was emailed a new code.");
    expect(document.body.textContent).toContain("Line 3: already brought over");
    expect(onDone).toHaveBeenCalled();
  });

  it("says plainly when the chosen file isn't a gift card list", async () => {
    const host = document.body.appendChild(document.createElement("div"));
    root = createRoot(host);
    act(() => root!.render(h(ImportDialog, { onClose: () => {}, onDone: () => {} })));
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [new File(["Title,Price\nBook,10"], "products.csv")], configurable: true });
    await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
    await flush();
    expect(document.querySelector('[role="alert"]')?.textContent).toMatch(/each card's balance/);
    expect(button(/Nothing to bring over/).disabled).toBe(true);
  });
});
