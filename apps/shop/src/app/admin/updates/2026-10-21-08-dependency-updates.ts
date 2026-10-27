import type { AppUpdate } from "../appUpdates";

export default {
  id: "dependency-updates",
  date: "2026-10-21",
  title: "Behind the scenes: every library updated to its latest version",
  summary: "The shop's building blocks are all on their newest versions: React 19, the page router, animations, icons, Firebase, Stripe (card form and server), Resend email and the build tools. Nothing should look or work differently. A few icons (bag, heart) are drawn slightly differently, and Studio forgets how wide you had dragged its side panels once, so drag them back if you like. Firebase Functions must be deployed for the server-side Stripe and Resend updates; local tests don't prove a live payment.",
  links: [
    { label: "Open Studio", tab: "settings", settingsTab: "designer" },
    { label: "Open Overview", tab: "overview" },
  ],
} satisfies AppUpdate;
