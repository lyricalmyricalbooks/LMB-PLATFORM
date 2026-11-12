// @vitest-environment jsdom
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";
import { AlertsPill, useAlertDismissals, visibleAlerts } from "./AdminAlerts.tsx";
import { AlertsPage } from "./AlertsPage.tsx";
import type { AdminAlert } from "./adminAlerts";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
beforeEach(() => { container = document.createElement("div"); document.body.replaceChildren(container); try { localStorage.clear(); sessionStorage.clear(); } catch {} });

const a = (id: string, tone: AdminAlert["tone"], action: AdminAlert["action"] = "orders"): AdminAlert =>
  ({ id, tone, title: `Title ${id}`, detail: `Detail ${id}`, orderIds: ["o1"], action });

/** The Dashboard's wiring: one hidden list feeding both the pill and the page. */
function Harness({ alerts, ...handlers }: { alerts: AdminAlert[] } & Partial<Parameters<typeof AlertsPage>[0]>) {
  const hides = useAlertDismissals();
  const shown = visibleAlerts(alerts, hides.dismissed);
  const [opened, setOpened] = useState(0);
  return (
    <>
      <AlertsPill alerts={shown} onOpen={() => setOpened((n) => n + 1)} />
      <span data-opened={opened} />
      <AlertsPage alerts={shown} hiddenCount={alerts.length - shown.length} onDismiss={hides.dismiss} onShowHidden={hides.showAll}
        onOpenOrder={() => {}} onOpenOrders={() => {}} onOpenWebhook={() => {}} onOpenNotifications={() => {}} {...handlers} />
    </>
  );
}

it("lists every alert as a tile, urgent first, with the count in the top bar's pill", async () => {
  const onOpenWebhook = vi.fn();
  const root = createRoot(container);
  await act(async () => root.render(<Harness alerts={[a("w1", "warning"), a("i1", "info"), a("d1", "danger", "webhook")]} onOpenWebhook={onOpenWebhook} />));
  const titles = () => Array.from(container.querySelectorAll(".rp-todo-title")).map((n) => n.textContent);
  expect(titles()).toEqual(["Title d1", "Title w1", "Title i1"]);
  expect(container.querySelector(".rp-alerts-pill")?.textContent).toBe("3alerts");
  expect(container.querySelector(".rp-alerts-pill")?.hasAttribute("data-urgent")).toBe(true);
  const open = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Open payment checks")!;
  await act(async () => open.click());
  expect(onOpenWebhook).toHaveBeenCalled();
  // Hiding one keeps it hidden in this browser and takes it off the pill too; it can be brought back.
  await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Hide “Title d1” for now"]')!.click());
  expect(titles()).not.toContain("Title d1");
  expect(container.querySelector(".rp-alerts-pill")?.textContent).toBe("2alerts");
  expect(container.querySelector(".rp-alerts-pill")?.hasAttribute("data-urgent")).toBe(false);
  expect(localStorage.getItem("admin-dismissed-alerts")).toContain("d1");
  const again = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Show them again")!;
  await act(async () => again.click());
  expect(titles()).toContain("Title d1");
  await act(async () => root.unmount());
});

it("shows All clear and no pill when nothing needs you", async () => {
  const root = createRoot(container);
  await act(async () => root.render(<Harness alerts={[]} />));
  expect(container.querySelector(".rp-alerts-pill")).toBeNull();
  expect(container.textContent).toContain("All clear");
  await act(async () => root.unmount());
});

it("opens the exact page and sub tab when the Dashboard passes onOpenRoute", async () => {
  const onOpenRoute = vi.fn(), onOpenOrders = vi.fn(), onOpenInventory = vi.fn();
  const root = createRoot(container);
  await act(async () => root.render(<Harness alerts={[a("l1", "danger", "inventory"), a("o1", "warning", "orders")]}
    onOpenOrders={onOpenOrders} onOpenInventory={onOpenInventory} onOpenRoute={onOpenRoute} />));
  const button = (label: string) => Array.from(container.querySelectorAll("button")).find((b) => b.textContent === label)!;
  await act(async () => button("Open Inventory app link").click());
  expect(onOpenRoute).toHaveBeenCalledWith({ tab: "inventory", subTab: "inv-link" });
  expect(onOpenInventory).not.toHaveBeenCalled();
  await act(async () => button("Review orders").click());
  expect(onOpenOrders).toHaveBeenCalled();
  await act(async () => root.unmount());
});
