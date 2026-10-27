import type { AppUpdate } from "../appUpdates";

export default {
  id: "inventory-link-automatic", date: "2026-10-11", title: "Inventory app link: website orders come in by themselves",
  summary: "Website orders now go into the inventory app's books by themselves, with no Bring them in step. Sales you had already typed in there by hand are linked rather than counted twice, and any order the app can't match for certain waits under Needs you and on its To-do list. The inventory app also checks that each book it moved to its new storage has every record. You can see this under Website orders › From your website › Storage check. The wording in Inventory › Inventory app link now says the same.",
  links: [{ label: "Open Inventory", tab: "inventory" }],
} satisfies AppUpdate;
