import type { AppUpdate } from "../appUpdates";

export default {
  id: "studio-2-colour-schemes", date: "2026-10-09", title: "Colour schemes you can name, edit and reuse",
  summary: "Theme settings in the Design studio has a new Colour schemes category. A scheme is a named set of colours: background, panels, text, muted text, accent, text on the accent, borders, button colours and links. Add, rename, duplicate, reorder or delete schemes; each shows a small preview and checks that its text, buttons and accent are easy to read (WCAG contrast). Give a section a scheme in its Style tab › Colour scheme, or pick one for the book cards, the product page's buy card or the shopping bag. Change a scheme and everything using it follows. The starter schemes now use the Riso black, white and red instead of purple. Schemes you saved before keep their current look until you change one of their colours. Deleting a scheme that's in use asks first, and those parts go back to the theme's own colours.",
  links: [{ label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" }],
} satisfies AppUpdate;
