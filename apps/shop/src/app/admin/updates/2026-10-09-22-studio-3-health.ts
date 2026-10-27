import type { AppUpdate } from "../appUpdates";

export default {
  id: "studio-3-health", date: "2026-10-09", title: "Studio Health checks your page before you publish",
  summary: "The Design studio's check before publishing is now Studio Health (Theme actions › Studio Health). It looks at the page shown in the preview, at the size you're previewing, and points out things shoppers would notice: text that's hard to read against its background, pictures without a description, buttons or links that are too small to tap on a phone, links that go nowhere or to a book or page that isn't published, very large or heavy pictures, a missing main heading, fonts that didn't load, and a missing page title or search description. Show me scrolls to the spot, and Edit this part opens its settings. The Publish confirmation now says how the page checks out, with a link to review. It only reads the page; nothing changes until you edit. Check each page and the phone size for full coverage. Tested with local checks only.",
  links: [{ label: "Open the Design studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
