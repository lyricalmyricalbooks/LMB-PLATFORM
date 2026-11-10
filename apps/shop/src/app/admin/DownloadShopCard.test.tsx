// @vitest-environment jsdom
import { createRoot } from "react-dom/client";
import { act } from "react";
import { expect, it, vi } from "vitest";

const downloadShop = vi.fn(async (onStep: (s: any) => void) => { onStep({ label: "Copying photos…", done: 1, of: 2 }); return "2 products, 3 orders"; });
vi.mock("./takeoutRun", () => ({ downloadShop: (o: any) => downloadShop(o) }));
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
