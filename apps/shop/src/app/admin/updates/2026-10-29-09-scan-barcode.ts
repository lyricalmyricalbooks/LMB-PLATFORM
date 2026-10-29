import type { AppUpdate } from "../appUpdates";

export default {
  id: "scan-barcode",
  date: "2026-10-29",
  title: "Scan a barcode with your camera",
  summary: "In a product's details, a Scan button next to the ISBN and the barcode reads the code with your phone's or computer's camera and fills it in. For a book's ISBN it also looks up the details, as the Fill from ISBN button does. The picture never leaves your device. The button only shows in browsers that can read barcodes; elsewhere you type the code as before.",
  links: [{ label: "Open products", tab: "catalog" }],
} satisfies AppUpdate;
