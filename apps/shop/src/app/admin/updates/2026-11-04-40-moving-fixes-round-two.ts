import type { AppUpdate } from "../appUpdates";

export default {
  id: "moving-fixes-round-two",
  date: "2026-11-04",
  title: "Bringing your shop over: fewer surprises",
  summary: "A product your old shop didn't count (stock set to unlimited, or not managed) now comes over without stock counting instead of arriving sold out, and the preview says so. A size's or colour's own photo is copied into your shop like the other photos, so it still shows after the old shop closes. Past order files that write a discount or refund as a minus amount, or amounts with a currency sign, now read correctly, and the preview names the first and last order day in your own time. Gift card expiry dates and discount code dates written out in words keep their own day.",
  links: [{ label: "Open Books", tab: "catalog" }, { label: "Open Orders", tab: "orders" }, { label: "Open Gift cards", tab: "giftCards" }],
} satisfies AppUpdate;
