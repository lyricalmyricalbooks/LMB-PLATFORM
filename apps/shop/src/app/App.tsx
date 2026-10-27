import { useState, lazy, Suspense, useEffect, useRef, type ReactNode } from "react";
import { consentAllows } from "./lib/consent";
import { REFERRAL_KEY, referralSourceOf } from "./lib/referralSource";
import { recordVisitSource } from "./lib/visitSource";
import { LazyMotion, MotionConfig } from "motion/react";
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from "react-router";
import { ScrollToTop } from "./lib/ScrollToTop";
import { ga4PageView } from "./lib/ga4";
import { clarityRoute } from "./lib/clarity";
import { ThemePreviewBanner } from "./features/site/ThemePreviewBanner";
import { DraftPreviewBanner } from "./features/site/DraftPreviewBanner";
import { CartProvider, useCart } from "./CartContext";
import { CurrencyProvider } from "./CurrencyContext";
import { CookieConsent } from "./components/CookieConsent";
import { UnderConstructionWall } from "./components/UnderConstructionWall";
import { ThemeProvider } from "./components/theme/ThemeProvider";
import { BootSplash } from "./components/BootSplash";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { endPrerenderedHandoff, prerenderedHtml, whenPrerenderedReady } from "./lib/prerenderedPage";
import { preloadSiteData } from "./features/site/useSiteData";

// import.meta.env.BASE_URL is the Vite `base` config (e.g. "/LyricalmyricalWebsite/").
// Strip the trailing slash so React Router treats it as a basename.
const ROUTER_BASENAME = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");

// Storefront animations use the slim `m` components; their engine arrives in its own small chunk.
const loadMotionFeatures = () => import("./lib/motionFeatures").then(m => m.default);

// Lazy-loaded components for performance
const NotFoundPage = lazy(() => import("./features/site/NotFoundPage"));
// Toasts only follow a shopper's action, so react-hot-toast stays out of the first load; toasts raised before it
// arrives wait in its store and show once the toaster mounts.
const ShopToaster = lazy(() => import("./features/site/ShopToaster").then(m => ({ default: m.ShopToaster })));
// Pages that can arrive as server-rendered HTML wait for the shop data on that first load (prerenderedPage.ts).
const MainSite = lazy(whenPrerenderedReady(() => import("./components/MainSite"), preloadSiteData));
const Dashboard = lazy(() => import("./admin/Dashboard").then(m => ({ default: m.Dashboard })));
const Checkout = lazy(() => import("./Checkout").then(m => ({ default: m.Checkout })));
const BookDetail = lazy(whenPrerenderedReady(() => import("./features/site/BookDetail"), preloadSiteData));
const PageView = lazy(whenPrerenderedReady(() => import("./features/site/PageView").then(m => ({ default: m.PageView })), preloadSiteData));
const WishlistPage = lazy(() => import("./features/site/Wishlist"));
const AccountPage = lazy(() => import("./features/site/Account"));
const OrderTracking = lazy(() => import("./features/site/OrderTracking"));
// The bag drawer is closed when a page opens: its code (and the shipping estimate's country list) loads next to
// the page instead of inside the first download. It still mounts on every page as soon as it arrives.
// If its code can't load (a dropped connection, a page open across a deploy) the page carries on without the bag
// rather than falling into the route's error view.
const CartDrawer = lazy<() => ReactNode>(() => import("./components/CartDrawer")
  .then(m => ({ default: m.CartDrawer }))
  .catch(() => ({ default: () => null })));

/** One Google Analytics page view per route (the page's title is set just after it renders). */
function Ga4PageViews() {
  const location = useLocation();
  // Microsoft Clarity stops on checkout/account/tracking pages and starts again on public ones (lib/clarity.ts).
  useEffect(() => { clarityRoute(); }, [location.pathname]);
  useEffect(() => {
    const t = window.setTimeout(ga4PageView, 400);
    return () => window.clearTimeout(t);
  }, [location.pathname, location.search]);
  return null;
}

/** While the landing page's code and data load, keep showing its server-rendered HTML instead of the splash. */
function PageLoading() {
  const location = useLocation();
  const html = prerenderedHtml(ROUTER_BASENAME + location.pathname);
  if (html) return <div style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: html }} />;
  return <BootSplash />;
}

/** The first navigation ends the hand-over from the server-rendered landing page. */
function PrerenderedHandoff() {
  const location = useLocation();
  const [first] = useState(location.key);
  useEffect(() => { if (location.key !== first) endPrerenderedHandoff(); }, [location.key, first]);
  return null;
}

// /cart (old Big Cartel bag links, typed addresses): the shop with the bag open. Hosting answers it with
// X-Robots-Tag: noindex and useSEO adds the robots meta, so it's never listed. Closing the bag leaves /cart.
function CartRoute({ children }: { children: ReactNode }) {
  const { isCartOpen, setIsCartOpen } = useCart();
  const navigate = useNavigate();
  const opened = useRef(false);
  useEffect(() => { setIsCartOpen(true); }, [setIsCartOpen]);
  useEffect(() => {
    if (isCartOpen) opened.current = true;
    else if (opened.current) navigate("/", { replace: true });
  }, [isCartOpen, navigate]);
  return <>{children}</>;
}

function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();
  return <ErrorBoundary resetKey={location.key}>{children}</ErrorBoundary>;
}

export default function App() {
  const [currentPage, setCurrentPage] = useState(0);
  const [showCatalog, setShowCatalog] = useState(false);

  // Redirect to basename if path is outside basename
  useEffect(() => {
    if (ROUTER_BASENAME && !window.location.pathname.startsWith(ROUTER_BASENAME)) {
      const targetPath = ROUTER_BASENAME + window.location.pathname + window.location.search + window.location.hash;
      window.location.replace(targetPath);
    }
  }, []);

  // Capture referral traffic source if present in query parameters or HTTP referrer
  useEffect(() => {
    if (typeof window !== "undefined" && consentAllows("analytics")) {
      const params = new URLSearchParams(window.location.search);
      const ref = params.get("ref");
      if (ref) {
        window.sessionStorage.setItem("referral_source", ref.toLowerCase());
      } else if (!window.sessionStorage.getItem(REFERRAL_KEY) && document.referrer) {
        const source = referralSourceOf(document.referrer, window.location.hostname);
        if (source) window.sessionStorage.setItem(REFERRAL_KEY, source);
      }
      // The fuller record (campaign tags, landing page) that goes on the order as `acquisition`.
      // Not from the Studio preview (same test as trackingGuard's inEditorPreview).
      if (!window.location.search.includes("preview=true")) recordVisitSource();
    }
  }, []);

  const nextPage = () => {
    setCurrentPage((prev) => prev + 1);
  };

  const prevPage = () => {
    setCurrentPage((prev) => (prev > 0 ? prev - 1 : 0));
  };

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <LazyMotion features={loadMotionFeatures}>
      <MotionConfig reducedMotion="user">
      <CurrencyProvider>
        <CartProvider>
          <BrowserRouter basename={ROUTER_BASENAME}>
          <ScrollToTop />
          <Ga4PageViews />
          <RouteErrorBoundary>
          <Suspense fallback={null}><CartDrawer /></Suspense>
          <CookieConsent />
          <UnderConstructionWall />
          <ThemePreviewBanner />
          <DraftPreviewBanner />
          <PrerenderedHandoff />
          <Suspense fallback={<PageLoading />}>
                <Suspense fallback={null}><ShopToaster /></Suspense>
                <Routes>
                  <Route path="/" element={
                    <MainSite 
                      setShowCatalog={setShowCatalog}
                      showCatalog={showCatalog}
                      setCurrentPage={setCurrentPage}
                      currentPage={currentPage}
                      nextPage={nextPage}
                      prevPage={prevPage}
                    />
                  } />
                  <Route path="/books/:slug" element={<BookDetail />} />
                  {/* A category link opens the normal shop (same header + footer) filtered to that category. */}
                  <Route path="/collections/:slug" element={
                    <MainSite
                      setShowCatalog={setShowCatalog}
                      showCatalog={showCatalog}
                      setCurrentPage={setCurrentPage}
                      currentPage={currentPage}
                      nextPage={nextPage}
                      prevPage={prevPage}
                    />
                  } />
                  <Route path="/cart" element={
                    <CartRoute>
                      <MainSite
                        setShowCatalog={setShowCatalog}
                        showCatalog={showCatalog}
                        setCurrentPage={setCurrentPage}
                        currentPage={currentPage}
                        nextPage={nextPage}
                        prevPage={prevPage}
                      />
                    </CartRoute>
                  } />
                  <Route path="/wishlist" element={<WishlistPage />} />
                  <Route path="/account/*" element={<AccountPage />} />
                  <Route path="/page/:slug" element={<PageView />} />
                  <Route path="/admin/*" element={<Dashboard />} />
                  <Route path="/checkout" element={<Checkout />} />
                  <Route path="/track" element={<OrderTracking />} />
                <Route path="*" element={<NotFoundPage />} />
                </Routes>
          </Suspense>
          </RouteErrorBoundary>
          </BrowserRouter>
        </CartProvider>
      </CurrencyProvider>
      </MotionConfig>
      </LazyMotion>
    </ThemeProvider>
  );
}
