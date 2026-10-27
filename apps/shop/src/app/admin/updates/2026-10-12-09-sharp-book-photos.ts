import type { AppUpdate } from "../appUpdates";

export default {
  id: "sharp-book-photos",
  date: "2026-10-12",
  title: "Sharper, high-quality photos",
  summary:
    "Photos you upload now keep much more detail. A photo up to 2400 pixels on its long side and under 2.5 MB is uploaded exactly as you chose it, with no re-compression; bigger ones are reduced to 2400 pixels at high quality (it used to be 1600 pixels at lower quality). Book photos and Media library pictures are also saved in phone, tablet, desktop and retina sizes, so the book page shows the sharp 2400-pixel copy on big and retina screens while shop cards and phones still load quickly. Photos uploaded before this change keep working as they are; upload them again to get the sharper copies.",
  links: [{ label: "Open Books", tab: "catalog" }],
} satisfies AppUpdate;
