import type { AppUpdate } from "../appUpdates";

export default {
  id: "digital-every-shop",
  date: "2026-11-17",
  title: "Digital goods (Beta): downloads for every kind of shop, several files each",
  summary: "Any product in any kind of shop can now be a download: open the product and turn on \"Buyers download files\" in the Digital product box. A product, or each of its versions, can hold up to 20 files of up to 5 GB each. Big files go up in pieces with a progress bar, so a weak connection picks up where it stopped. Name each file the way buyers should see it; their email and account list a button per file, and each file has its own download allowance. Signed-in buyers also get a Library in their account with every download from every order in one place. In Settings, General, Digital downloads you choose where buyers can be: Canada and the US to start. Checkout refuses downloads to other countries in plain words. Still Beta, and not yet tried with a real payment.",
  links: [{ label: "Products", tab: "catalog" }, { label: "Digital downloads settings", tab: "settings", settingsTab: "general" }],
} satisfies AppUpdate;
