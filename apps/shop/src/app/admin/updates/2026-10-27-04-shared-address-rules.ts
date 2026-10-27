import type { AppUpdate } from "../appUpdates";

export default {
  id: "shared-address-rules",
  date: "2026-10-27",
  title: "One copy of the address checks",
  summary: "Checkout, the admin and the server now decide which address boxes a country needs (province, postal code) with the very same code and the same list of countries without postcodes. An address the bag accepts can no longer be turned away at payment or when buying a label because two copies drifted apart. Nothing about addresses changes today.",
  links: [{ label: "Open Orders", tab: "orders" }],
} satisfies AppUpdate;
