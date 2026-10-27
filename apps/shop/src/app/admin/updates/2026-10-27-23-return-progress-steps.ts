import type { AppUpdate } from "../appUpdates";

export default {
  id: "return-progress-steps",
  date: "2026-10-27",
  title: "Customer returns show where you are in four steps",
  summary: "On an order with a return request, a row of four steps (Decide, Parcel back, Inspect, Refund) now sits above the return panel. Finished steps show a tick and the step you're on is highlighted, so you can see at a glance what comes next. Nothing about how returns or refunds work has changed.",
  links: [{ label: "Open Orders", tab: "orders" }],
} satisfies AppUpdate;
