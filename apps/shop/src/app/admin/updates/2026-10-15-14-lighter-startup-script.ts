import type { AppUpdate } from "../appUpdates";

export default {
  id: "lighter-startup-script",
  date: "2026-10-15",
  title: "The shop's startup script is a fifth smaller, and pages no longer jump on load",
  summary: "The code a shopper's browser downloads and runs before the shop works shrank from about 226 KB to 176 KB (compressed). The database connection, which was part of that code, now downloads alongside the page and starts as soon as it is needed, so phones get to a working shop sooner. The shop page and category pages also stopped jumping as they finished loading: they used to draw one frame with the Home layout or the wrong category's books first. Nothing shoppers see has changed, and checkout, payments and sign-in work exactly as before. Measured on this branch, not yet on the live site.",
  links: [{ label: "Open Overview", tab: "overview" }],
} satisfies AppUpdate;
