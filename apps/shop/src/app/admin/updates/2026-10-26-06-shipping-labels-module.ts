import type { AppUpdate } from "../appUpdates";

export default {
  id: "shipping-labels-module",
  date: "2026-10-26",
  title: "Label buying has its own place in the server code",
  summary: "The part of the server that quotes, buys, voids and refunds Shippo labels now lives in its own file instead of inside the one very large server file. Nothing changes when you buy or void a label. It means a change to labels can no longer get tangled up with checkout or payment code. Takes effect once the server update is deployed.",
  links: [{ label: "Open Orders", tab: "orders" }],
} satisfies AppUpdate;
