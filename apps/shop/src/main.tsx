
  import { createRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import "./styles/index.css";
  import { rememberPreviewSnapshot, startPreviewTab } from "./app/features/site/previewTab";
  import { captureSharedDiscount } from "./app/features/site/sharedDiscount";
  import { takeMovedState } from "./app/features/site/movedState";
  import { installTranslateSafeDom } from "./app/lib/translateSafeDom";
  import { arrivedPrerendered, keepPrerenderedPage } from "./app/lib/prerenderedPage";
  import { preloadSiteData } from "./app/features/site/useSiteData";
  import { takeOwnerDeviceLink } from "./app/lib/ownerDevice";
  import { listenShopSignals } from "./app/lib/shopSignals";
  import { watchPageSpeed } from "./app/lib/pageSpeed";
  import { installErrorReporting } from "./app/lib/errorReport";

  // A shopper's browser that hits an error tells the shop (Settings › General › Tools & records › Shop errors).
  installErrorReporting();

  // Shoppers may translate the page with Google Translate: keep React from crashing on the translated text.
  installTranslateSafeDom();

  // Arriving from the old GitHub Pages address: take the bag/wishlist/order key it handed over, tidy the address.
  takeMovedState();
  // Studio preview: keep the newest unsaved snapshot for pages that mount later (no-op for shoppers).
  rememberPreviewSnapshot();
  // Studio › "Preview in new tab": receive the unsaved draft (no-op for shoppers).
  startPreviewTab();
  // Settings › General › Your own visits: `?owner-device=on` leaves this browser out of the shop's numbers.
  takeOwnerDeviceLink();
  // Per-book bag and wishlist counts, and real page speed, for Overview › Dig deeper (lib/commerce.ts decides what counts).
  listenShopSignals();
  watchPageSpeed();
  // Admin › Discounts › Copy share link: remember ?discount=CODE for checkout and tidy the address.
  captureSharedDiscount();

  // Landing on a server-rendered page: keep showing it while the app loads, and start reading the shop data now.
  keepPrerenderedPage(document.getElementById("root"));
  if (arrivedPrerendered()) preloadSiteData()?.catch(() => {});

  createRoot(document.getElementById("root")!).render(<App />);
  
