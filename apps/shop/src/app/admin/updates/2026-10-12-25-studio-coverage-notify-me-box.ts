import type { AppUpdate } from "../appUpdates";

export default {
  id: "studio-coverage-notify-me-box",
  date: "2026-10-12",
  title: "Style the “Notify me” box on sold-out and coming-soon books",
  summary: "The email signup box on a sold-out or Coming soon book page now has its own Studio controls: background, border colour and width, corners, inner spacing, heading colour, email field border and the button's colours (Theme settings › Product page · buy card & details › “Notify me” signup box). Clicking the box in the preview opens them. The word the button shows while sending is now in Text & labels › Product page. Nothing changes on the live shop until you set one.",
  links: [{ label: "Open Theme settings in Studio", tab: "settings", settingsTab: "designer", studio: "#designer?t=productPage&tab=style" }],
} satisfies AppUpdate;
