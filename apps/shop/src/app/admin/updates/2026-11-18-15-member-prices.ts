import type { AppUpdate } from "../appUpdates";

export default {
  id: "member-prices",
  date: "2026-11-18",
  title: "Member prices at checkout (Beta)",
  summary: "A membership plan can now take a percent off everything you sell, up to 50%. When a member signs in and pays by card, checkout lowers each product's price for them and tells them their member price is on before anything is charged. Gift cards stay at full price, and your discount codes still work on top. Your Membership page shows the member price on each plan, and you can change its words in Text & labels.",
  links: [{ label: "Members", tab: "memberships" }],
} satisfies AppUpdate;
