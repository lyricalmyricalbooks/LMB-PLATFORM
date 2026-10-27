import type { AppUpdate } from "../appUpdates";

export default {
  id: "firebase-hosting-side-by-side", date: "2026-10-10", title: "Getting ready to move the shop to Firebase Hosting",
  summary: "This is the first step in moving the shop off GitHub Pages to Firebase Hosting, which gives it its own address at the root of the site (lmb-test-shop.web.app), faster delivery and room for your own domain later. Once it is switched on, every release also builds a copy of the shop for that address and publishes it there next to the current site. Your shop, its address, search listings and email links stay on GitHub Pages for now, and search engines are told not to list the new copy yet. Nothing changes for shoppers. The copy only appears once Firebase Hosting has been set up and switched on for the release workflow (the repository setting FIREBASE_HOSTING_ENABLED); until then, and until you have tried it, treat it as not live. Once it is up, sign in to the admin there to check it, and use Settings › Payments to register that address with Stripe for Apple Pay and Google Pay. Card checkout from the new address works once the matching Cloud Functions update is deployed. Moving the shop and email links over is a separate later step.",
  links: [{ label: "Open Payments", tab: "settings", settingsTab: "payments" }],
} satisfies AppUpdate;
