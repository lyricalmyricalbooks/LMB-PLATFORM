import type { AppUpdate } from "../appUpdates";

export default {
  id: "live-rate-checkout-fix",
  date: "2026-10-14",
  title: "Checkout no longer refuses Pay when carrier rates are on",
  summary: "For countries that use live carrier rates, checkout sometimes showed the shop's own shipping rates and then refused Pay every time with \"That live carrier rate is no longer available\". That happened when the province/state box was left empty outside Canada and the US, when the carrier's prices were slow to load, or when Pay was pressed just before they loaded. Checkout now asks the carrier as soon as the address is complete, keeps Pay off until the prices are in, and if a rate is refused it fetches the carrier's prices again so the shopper can pick one and pay. Live rates are set up in Settings › Shipping › Carrier & labels. This needs the Functions deploy that ships with this update.",
  links: [{ label: "Shipping settings", tab: "settings", settingsTab: "shipping" }],
} satisfies AppUpdate;
