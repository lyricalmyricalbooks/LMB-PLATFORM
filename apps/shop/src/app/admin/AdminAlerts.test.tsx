// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";
import { AdminAlerts } from "./AdminAlerts";
import type { AdminAlert } from "./adminAlerts";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
beforeEach(() => { container = document.createElement("div"); document.body.replaceChildren(container); try { localStorage.clear(); sessionStorage.clear(); } catch {} });

const a = (id: string, tone: AdminAlert["tone"], action: AdminAlert["action"] = "orders"): AdminAlert =>
  ({ id, tone, title: `Title ${id}`, detail: `Detail ${id}`, orderIds: ["o1"], action });

it("puts urgent alerts first, folds past two and keeps every action reachable", async () => {
  const onOpenOrders = vi.fn(), onOpenWebhook = vi.fn();
  const root = createRoot(container);
  await act(async () => root.render(<AdminAlerts alerts={[a("w1", "warning"), a("i1", "info"), a("d1", "danger", "webhook")]}
    onOpenOrder={() => {}} onOpenOrders={onOpenOrders} onOpenWebhook={onOpenWebhook} onOpenNotifications={() => {}} />));
  const titles = () => Array.from(container.querySelectorAll(".rp-alert-title")).map((n) => n.textContent);
  expect(titles()).toEqual(["Title d1", "Title w1"]);
  const more = Array.from(container.querySelectorAll("button")).find((b) => /Show 1 more alert/.test(b.textContent || ""))!;
  await act(async () => more.click());
  expect(titles()).toEqual(["Title d1", "Title w1", "Title i1"]);
  const open = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Open webhook health")!;
  await act(async () => open.click());
  expect(onOpenWebhook).toHaveBeenCalled();
  // Hiding one keeps it hidden for the session.
  await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Hide “Title d1” for now"]')!.click());
  expect(titles()).not.toContain("Title d1");
  expect(localStorage.getItem("admin-dismissed-alerts")).toContain("d1");
  await act(async () => root.unmount());
});

it("opens the exact page and sub tab when the Dashboard passes onOpenRoute", async () => {
  const onOpenRoute = vi.fn(), onOpenOrders = vi.fn(), onOpenInventory = vi.fn();
  const root = createRoot(container);
  await act(async () => root.render(<AdminAlerts alerts={[a("l1", "danger", "inventory"), a("o1", "warning", "orders")]}
    onOpenOrder={() => {}} onOpenOrders={onOpenOrders} onOpenWebhook={() => {}} onOpenNotifications={() => {}} onOpenInventory={onOpenInventory} onOpenRoute={onOpenRoute} />));
  const button = (label: string) => Array.from(container.querySelectorAll("button")).find((b) => b.textContent === label)!;
  await act(async () => button("Open Inventory app link").click());
  expect(onOpenRoute).toHaveBeenCalledWith({ tab: "inventory", subTab: "inv-link" });
  expect(onOpenInventory).not.toHaveBeenCalled();
  await act(async () => button("Review orders").click());
  expect(onOpenOrders).toHaveBeenCalled();
  await act(async () => root.unmount());
});
