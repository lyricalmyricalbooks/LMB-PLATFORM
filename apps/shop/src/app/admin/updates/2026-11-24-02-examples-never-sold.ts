import type { AppUpdate } from "../appUpdates";

export default {
  id: "examples-never-sold",
  date: "2026-11-24",
  title: "Example products look real and can never be bought",
  summary: "The example products that fill a new shop now use the same photos and names as the website previews for your kind of shop. They can be looked at but never bought: their button reads \"Example · not for sale\" (change the words in Studio › Text & labels › Product page), and checkout refuses them even if one was already in a bag. They still disappear when you add your first real product.",
  links: [{ label: "Products", tab: "catalog" }],
} satisfies AppUpdate;
