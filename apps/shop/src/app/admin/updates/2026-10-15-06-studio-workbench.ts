import type { AppUpdate } from "../appUpdates";

export default {
  id: "studio-workbench",
  date: "2026-10-15",
  title: "Studio Workbench: health checks, your changes and a setup checklist under the preview",
  summary: "Studio now has a Workbench docked under the preview (on tablets and computers). Health shows what to fix on the page while you keep editing, so it no longer opens as a separate window. Changes lists every edit you made this session; click one to go back to it, and see what your draft changes compared with the live shop. Setup is a 10-step checklist (logo, colours, fonts, share image, Google listing, Home page, policies, phone check, Health, publish), and each step has a Show me button. New keyboard shortcuts: G then L, T, X, N, P, M or H jumps to a workspace; W opens or closes the Workbench; A adds a section; [ and ] move between sections. Press ? in Studio to see them all. A line under the top bar now shows where you are: page, section and block.",
  links: [{ label: "Open Studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
