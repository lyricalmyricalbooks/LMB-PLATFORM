// @vitest-environment jsdom
import { createRoot } from "react-dom/client";
import { act } from "react";
import { expect, it, vi } from "vitest";

const downloadShop = vi.fn(async (onStep: (s: any) => void, _choice?: any) => { onStep({ label: "Copying photos…", done: 1, of: 2 }); return "2 products, 3 orders"; });
vi.mock("./takeoutRun", () => ({ downloadShop: (o: any, c?: any) => downloadShop(o, c) }));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import { DownloadShopCard } from "./DownloadShopCard";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

it("one button downloads the shop and says what was saved", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(<DownloadShopCard />));
  const button = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Download your shop") as HTMLButtonElement;
  expect(button).toBeTruthy();
  await act(async () => button.click());
  expect(downloadShop).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain("Saved: 2 products, 3 orders.");
  await act(async () => root.unmount());
});

it("Choose what to download sends only the picked parts", async () => {
  downloadShop.mockClear();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(<DownloadShopCard />));
  const choose = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Choose what to download") as HTMLButtonElement;
  await act(async () => choose.click());
  const photos = Array.from(document.querySelectorAll("[data-download-choices] label")).find((l) => l.textContent === "Product photos")!.querySelector("input") as HTMLInputElement;
  await act(async () => photos.click());
  const go = Array.from(document.querySelectorAll(".rp-dialog button")).find((b) => b.textContent === "Download") as HTMLButtonElement;
  await act(async () => go.click());
  expect(downloadShop).toHaveBeenCalledTimes(1);
  const choice = (downloadShop.mock.calls[0] as any[])[1];
  expect(choice.parts).toContain("products");
  expect(choice.parts).not.toContain("photos");
  await act(async () => root.unmount());
});
