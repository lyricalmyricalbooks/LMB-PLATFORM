import type { AppUpdate } from "../appUpdates";

export default {
  id: "membership-box-orders",
  date: "2026-11-18",
  title: "Box orders are made on the cut-off day (Beta)",
  summary: "On a box plan's cut-off day, each paid member gets an order for the box at no extra cost, with free shipping to their address. It ships like any other order and takes stock off as usual. Three days before, Members warns you if there isn't enough stock, and you get an email that morning. Each member's row shows their last box.",
  links: [{ label: "Members", tab: "memberships" }],
} satisfies AppUpdate;
