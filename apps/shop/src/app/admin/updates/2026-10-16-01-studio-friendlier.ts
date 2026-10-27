import type { AppUpdate } from "../appUpdates";

export default {
  id: "studio-friendlier",
  date: "2026-10-16",
  title: "Studio speaks plainer and keeps your place",
  summary: "Studio now uses everyday words where it used developer terms: “Web address” instead of slug, “Title on Google”, “Picture description”, “Same as the larger screen”, “Reusable block” and “Pop-ups”. The badge at the top says plainly whether the shop has changed (“Not saved yet · shop unchanged”, “Saved as draft · shop unchanged”, “Live · the shop shows this”). Warnings and Undo after a delete stay on screen until you close them, and other messages stay up longer and pause while you point at them. Save problems are explained in plain words with a Try again button. The Publish window counts your changes. The mode button now says what it does (“Switch to Browse mode”), and the first time a link doesn't open while editing, Studio tells you why. Picking a section keeps you on the same Content / Style / Layout / Visibility tab. The section panel has Move up and Move down buttons. In a Flexible composition, blocks have “Hide on phones” and “Hide on tablets and phones” boxes that work whichever screen size you're previewing. Moving to another page in any way switches “This page only” back to All pages. Clicking the rail tab you're already on no longer closes what you're editing. Deleting three or more sections, or a page template, asks first. If Theme settings › Product page › Add-to-bag text is set, Text & labels tells you that it wins over the words there. On phones the tabs read Sections · Preview · Edit. Buttons are larger and easier to hit.",
  links: [{ label: "Open Studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
