import type { AppUpdate } from "../appUpdates";

export default {
  id: "inventory-link-on-hand", date: "2026-10-11", title: "Inventory app link: stock now matches ON HAND",
  summary: "Linked books now follow the inventory app's ON HAND number, including copies the author is holding. Before this, those copies were left out, so books like Un Fantastico Altrove showed 0 on the website instead of 89. The fix is in the inventory app: open it once so it sends the new numbers, then go to Inventory › Inventory app link › Preview stock changes and press Apply these numbers. Big jumps always wait for you to confirm them.",
  links: [{ label: "Open Inventory", tab: "inventory" }],
} satisfies AppUpdate;
