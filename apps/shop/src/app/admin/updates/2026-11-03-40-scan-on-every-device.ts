import type { AppUpdate } from "../appUpdates";

export default {
  id: "scan-on-every-device",
  date: "2026-11-03",
  title: "Scan barcodes on iPhones, iPads and any computer",
  summary: "The Scan button next to a product's ISBN and barcode now works on every device with a camera, including iPhones, iPads, Firefox and Windows computers. Before, it only showed where the browser had its own barcode reader. The first scan on those devices takes a moment longer while the reader loads. Labels you print with letters in their code now read correctly too. The picture still never leaves your device.",
  links: [{ label: "Open products", tab: "catalog" }],
} satisfies AppUpdate;
