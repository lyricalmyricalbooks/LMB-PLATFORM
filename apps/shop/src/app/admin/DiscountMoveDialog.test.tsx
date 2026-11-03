// @vitest-environment jsdom
// Discounts › Bring codes over (plan 23.30): the file is previewed, each code saved like one made by hand.
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const api: any = vi.hoisted(() => ({ saveDiscount: vi.fn(async (d: any) => ({ id: d.code, ...d })) }));
vi.mock("./api", () => ({ adminApi: api }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const { DiscountMoveDialog } = await import("./DiscountMoveDialog");

let root: Root | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; vi.clearAllMocks(); });
const flush = async () => { for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); }); };
const button = (text: RegExp) => [...document.querySelectorAll("button")].find((b) => text.test(b.textContent || "")) as HTMLButtonElement;

const FILE = [
  "Name,Value,Value Type,Type,Minimum Purchase Requirements,Times Used,Usage Limit Per Code,Starts,Ends,Status",
  "WELCOME10,-10.0,percentage,Amount off order,,3,,2025-01-01,,Active",
  "FIVEOFF,-5.00,fixed_amount,Amount off order,Minimum purchase of $50.00,2,10,2025-01-01,2099-01-01,Active",
  "OLD,-5.00,fixed_amount,Amount off order,,0,,2024-01-01,2025-01-01,Expired",
  "HERE10,-10.0,percentage,Amount off order,,0,,,,Active",
].join("\n");

describe("Bring discount codes over", () => {
  it("previews the codes, saves each like one made by hand and reports what came over", async () => {
    const onDone = vi.fn();
    root = createRoot(document.body.appendChild(document.createElement("div")));
    act(() => root!.render(h(DiscountMoveDialog, { existing: ["here10"], onClose: () => {}, onDone })));
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [new File([FILE], "discounts_export.csv", { type: "text/csv" })], configurable: true });
    await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
    await flush();
    expect(document.body.textContent).toContain("WELCOME10: 10% off");
    expect(document.body.textContent).toContain("FIVEOFF: CA$5.00 off, on orders of CA$50.00 or more, 8 uses left, until 2099-01-01");
    expect(document.body.textContent).toContain("2 codes left out");
    await act(async () => { button(/Bring 2 codes over/).click(); });
    await flush();
    expect(api.saveDiscount).toHaveBeenCalledTimes(2);
    expect(api.saveDiscount.mock.calls[1][0]).toMatchObject({
      code: "FIVEOFF", type: "fixed", value: 5, method: "code", appliesTo: "all", isActive: true, minOrderAmount: 50, usageLimit: 8,
      startDate: "2025-01-01", expiryDate: "2099-01-01", description: "Brought over from your old shop",
    });
    expect(document.body.textContent).toContain("2 codes added");
    expect(onDone).toHaveBeenCalled();
  });

  it("says which codes couldn't be saved", async () => {
    api.saveDiscount.mockRejectedValueOnce(new Error("offline"));
    root = createRoot(document.body.appendChild(document.createElement("div")));
    act(() => root!.render(h(DiscountMoveDialog, { existing: [], onClose: () => {}, onDone: () => {} })));
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [new File([FILE], "d.csv", { type: "text/csv" })], configurable: true });
    await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
    await flush();
    await act(async () => { button(/Bring 3 codes over/).click(); });
    await flush();
    expect(document.body.textContent).toContain("1 code couldn't be saved (WELCOME10)");
    expect(document.body.textContent).toContain("2 codes added");
  });
});
