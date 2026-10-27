import type { AppUpdate } from "../appUpdates";

export default {
  id: "discount-save-checks",
  date: "2026-10-27",
  title: "Discounts are checked before they save",
  summary: "Editing a discount code that has no usage limit no longer stops at \u201cUse a whole-number limit of at least 1\u201d until you retyped the field. Creating, editing or pausing a discount now also checks every field has the right kind of value before anything is saved, and says which one if not. When a batch of single-use codes can\u2019t be created, the message now says why.",
  links: [{ label: "Open discounts", tab: "discounts" }],
} satisfies AppUpdate;
