import type { AppUpdate } from "../appUpdates";

export default {
  id: "studio-2-media", date: "2026-10-09", title: "A media library for your shop's pictures",
  summary: "The Design studio has a new Media button in its left rail. Pictures you upload there — or with Upload image on any image field — are saved as three sizes (480, 960 and 1600 pixels wide); in page sections, phones then download a small file and big screens a sharp one; pictures in the first section of the home page load first. Each picture has a description for screen readers, a focal point, its file sizes (with a warning when one is larger than recommended), and a list of where it's used — click a place to open that section. Filters show unused pictures, pictures over the size budget and pictures without a description. Replace swaps a picture everywhere in your draft at once; Delete refuses while a picture is still used — including in My themes or a saved version in Version history. Image fields have a new Choose from library button. Pictures already on your site look exactly as before. The library needs its new security rules switched on; until then Media explains this and image fields work as they always have.",
  links: [{ label: "Open Media", tab: "settings", settingsTab: "designer", studio: "#designer?tab=media" }],
} satisfies AppUpdate;
