import type { AppUpdate } from "../appUpdates";

export default {
  id: "card-lines-style",
  date: "2026-10-23",
  title: "Colours for the author, formats and star lines on shop cards",
  summary:
    "The optional lines under a shop card's title (the author or artist, the list of formats and the star rating) can now be styled like the title and price: pick the author line's colour and size, the formats line's colour and the colour of the stars. Find them in Design › Theme settings › Book cards in the shop grid › Author, formats & stars under the title. Every control starts empty, so the shop looks exactly as before until you choose a colour or size.",
  links: [
    { label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" },
  ],
} satisfies AppUpdate;
