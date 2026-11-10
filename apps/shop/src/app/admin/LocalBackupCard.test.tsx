// @vitest-environment jsdom
import { createRoot } from "react-dom/client";
import { act } from "react";
import { expect, it, vi } from "vitest";

const state = { supported: true, folder: null as any };
const backUpNow = vi.fn(async () => "2 products, 3 orders");
vi.mock("./localBackup", () => ({
  supported: () => state.supported, savedFolder: async () => state.folder, readMeta: () => ({ auto: true, lastAt: null, lastSummary: null, folder: null }),
  writeMeta: vi.fn(), chooseFolder: vi.fn(), forgetFolder: vi.fn(), canWrite: async () => true, backUpNow: (...a: any[]) => (backUpNow as any)(...a), dueForBackup: () => false,
}));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));
import { LocalBackupCard } from "./LocalBackupCard";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

async function show() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(<LocalBackupCard />));
  await act(async () => {});
  return { container, root };
}

it("tells a browser that can't save to a folder what to do instead", async () => {
  state.supported = false;
  const { container, root } = await show();
  expect(container.textContent).toContain("can't save to a folder");
  await act(async () => root.unmount());
});

it("offers Choose a folder, and says the shop is also in the cloud", async () => {
  state.supported = true; state.folder = null;
  const { container, root } = await show();
  expect(container.textContent).toContain("backed up in the cloud every night");
  expect(Array.from(container.querySelectorAll("button")).some((b) => b.textContent === "Choose a folder")).toBe(true);
  await act(async () => root.unmount());
});

it("with a folder chosen, Back up now writes to it", async () => {
  state.supported = true; state.folder = { name: "Shop copies" };
  const { container, root } = await show();
  expect(container.textContent).toContain("Shop copies");
  await act(async () => (Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Back up now") as HTMLButtonElement).click());
  expect(backUpNow).toHaveBeenCalledTimes(1);
  await act(async () => root.unmount());
});
