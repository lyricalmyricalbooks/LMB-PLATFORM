import type { AppUpdate } from "../appUpdates";

export default {
  id: "moving-made-safer",
  date: "2026-11-03",
  title: "Moving your shop: a progress list, an undo and a suggested rate",
  summary: "The Overview now shows Your move so far: what has come over from your old shop and what is left, each with a button to do it, or \"We had none\". Past orders in another currency get the Bank of Canada's average rate filled in for you to check. Brought the wrong order file? Remove that whole import in one step, from the window or from any order it added. And links inside pages you brought over that lead nowhere yet are listed with a suggested redirect.",
  links: [
    { label: "Open Overview", tab: "overview" },
    { label: "Open Orders", tab: "orders" },
    { label: "Open General settings", tab: "settings", settingsTab: "general" },
  ],
} satisfies AppUpdate;
