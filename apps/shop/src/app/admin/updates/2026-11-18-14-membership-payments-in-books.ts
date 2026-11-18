import type { AppUpdate } from "../appUpdates";

export default {
  id: "membership-payments-in-books",
  date: "2026-11-18",
  title: "Membership payments in your books (Beta)",
  summary: "Each payment a member makes now shows in Bookkeeping › Transactions and the Tax centre as its own Membership line, on the day it was paid. Membership payments count as sales, and your year figures and tax periods show them apart from the rest. No tax is charged on memberships yet, so the tax period reminds you of that. Test payments are left out, and a member's name never goes into the books.",
  links: [{ label: "Members", tab: "memberships" }],
} satisfies AppUpdate;
