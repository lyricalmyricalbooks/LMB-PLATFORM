import type { AppUpdate } from "../appUpdates";

export default {
  id: "state-province-shipping",
  date: "2026-11-14",
  title: "Shipping prices by state and province",
  summary: "A shipping zone can now hold US states and Canadian provinces, not just whole countries. Charge Alaska, Hawaii or the territories their own price while the rest of the country keeps yours: a state or province always wins over its country at checkout. Quick picks (Lower 48, Atlantic, Prairies…) fill a zone in one tap, the rate tester takes a state, and Shipping warns you when some states have no price. New shipping profiles start with a far-off-places zone you can edit.",
  links: [{ label: "Open Shipping", tab: "settings", settingsTab: "shipping" }],
} satisfies AppUpdate;
