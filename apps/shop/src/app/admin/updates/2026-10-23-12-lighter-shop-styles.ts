import type { AppUpdate } from "../appUpdates";

export default {
  id: "lighter-shop-styles",
  date: "2026-10-23",
  title: "Shop pages start drawing a little sooner",
  summary: "The styling that only the admin uses no longer downloads with the public shop, so the stylesheet every shopper waits for is about 13% smaller. The admin and Studio look the same. This is a front-end change that goes live with the next storefront deploy.",
  links: [{ label: "Open Overview", tab: "overview" }],
} satisfies AppUpdate;
