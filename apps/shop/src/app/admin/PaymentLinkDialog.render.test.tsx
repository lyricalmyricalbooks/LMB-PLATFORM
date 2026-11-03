// @vitest-environment jsdom
// Code plan 21.4: a bulk-price request opens New order to pay with its customer, product, edition and copies filled in.
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PaymentLinkDialog } from "./PaymentLinkDialog";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; });
const flush = async () => { for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); }); };

const books = [
  { id: "tee", slug: "tee", title: "Tee", retailPrice: 40, status: "published" },
  { id: "hoodie", slug: "hoodie", title: "Hoodie", retailPrice: 60, status: "published", variants: [{ id: "s", name: "S" }, { id: "xl", name: "XL", price: 66 }] },
];
const request = { name: "Robin Reed", email: "robin@example.com", phone: "", quantity: 140, slug: "hoodie", title: "Hoodie", edition: "XL" };

async function open(start: typeof request | null, makeLink = vi.fn(async () => ({ orderId: "NEW1" })), loadBooks: () => Promise<any[] | null> = async () => books) {
  const onMade = vi.fn();
  const host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(h(PaymentLinkDialog, { open: true, onClose: () => {}, loadBooks, makeLink, onMade, start })));
  await flush();
  return { onMade, makeLink };
}
const field = (label: string) => [...document.querySelectorAll("label")].find(l => l.textContent?.trim().startsWith(label))?.control as HTMLInputElement | HTMLSelectElement;

describe("PaymentLinkDialog from a bulk-price request", () => {
  it("fills in the customer, the product and edition, and the copies (capped at a line's limit)", async () => {
    await open(request);
    expect(field("Name").value).toBe("Robin Reed");
    expect(field("Email").value).toBe("robin@example.com");
    expect(field("Product 1").value).toBe("hoodie");
    expect(field("Edition").value).toBe("xl");
    expect(field("Quantity").value).toBe("99");
    const text = document.body.textContent || "";
    expect(text).toContain("request for 140 of “Hoodie” (XL)");
    expect(text).toContain("One line holds up to 99 copies");
  });

  it("says the catalog didn't load instead of blaming the product, and can't be sent", async () => {
    await open(request, undefined, async () => null);
    const text = document.body.textContent || "";
    expect(text).toContain("The catalog didn't load");
    expect(text).not.toContain("wasn't found");
    const send = [...document.querySelectorAll("button")].find(b => /Make the payment link/.test(b.textContent || "")) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
  });

  it("says so when the product isn't found, and starts empty without a request", async () => {
    await open({ ...request, slug: "gone", title: "Gone" });
    expect(field("Product 1").value).toBe("");
    expect(document.body.textContent).toContain("wasn't found");
    act(() => root?.unmount()); root = null; document.body.innerHTML = "";
    await open(null);
    expect(field("Name").value).toBe("");
    expect(document.body.textContent).not.toContain("request for");
  });
});
