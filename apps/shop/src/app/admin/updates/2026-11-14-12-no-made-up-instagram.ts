import type { AppUpdate } from "../appUpdates";

export default {
  id: "no-made-up-instagram",
  date: "2026-11-14",
  title: "No made-up Instagram link in the footer",
  summary: "New shops used to show an Instagram link in the footer that pointed at an account nobody owns. The link now appears only after you add your own in Studio under Style, Footer and social links, and shops still showing the old one read as having none.",
  links: [{ label: "Open Design", tab: "design" }],
} satisfies AppUpdate;
