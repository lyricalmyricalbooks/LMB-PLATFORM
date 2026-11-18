import type { AppUpdate } from "../appUpdates";

export default {
  id: "charity-tax-receipts",
  date: "2026-11-18",
  title: "Tax receipts for registered charities (Beta)",
  summary: "If your shop is a registered charity, turn on Tax receipts in Donations › Amounts & choices and add your registration number. Givers can then tick \"Send me a tax receipt\" on your Support page and get a numbered receipt by email and on their thank-you page, ready to print. Numbers run in order each year and are never reused: a refund cancels the receipt, and Correct on a gift fixes a name or address with a new number. Gifts with a thank-you reward get no receipt.",
  links: [{ label: "Donations", tab: "giving" }],
} satisfies AppUpdate;
