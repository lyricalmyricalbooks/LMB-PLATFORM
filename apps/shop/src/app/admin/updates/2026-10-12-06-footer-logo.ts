import type { AppUpdate } from "../appUpdates";

export default {
  id: "footer-logo",
  date: "2026-10-12",
  title: "Put your logo in the footer",
  summary:
    "The left side of the footer can now show your logo picture, either instead of the shop name or above it. Choose it in Studio › Theme settings › Footer & social links › Footer logo › Logo picture in the footer. It uses your header logo (Logo & wordmark › Logo image) unless you upload a different picture for the footer, and Footer logo width sets its size. Its description for screen readers is Text & labels › Header › Logo image — alt text. It is off by default, so the footer stays as it is until you choose it.",
  links: [{ label: "Open the Design studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
