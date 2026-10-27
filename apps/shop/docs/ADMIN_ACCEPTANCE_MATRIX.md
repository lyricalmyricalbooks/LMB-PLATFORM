# Admin & storefront acceptance matrix

Phase 1 of the Riso Press redesign. This is the **behavior contract**: a visual
change to a screen may not remove anything listed here. Verify a screen against
its row before and after restyling it. Sources: the code in `src/app/admin/*`,
`src/app/lib/commerce.ts`, `functions/index.js`.

## Non-negotiable protections (apply to every row)

- Checkout totals are server-authoritative (Stripe session); the client only displays them.
- Orders are created `unpaid`; only `stripeWebhook` marks them paid, decrements stock, counts discounts, records revenue. The admin "Mark paid" button calls the admin-authenticated `markOrderPaid` Cloud Function (Bearer ID token) and is gated by a confirmation dialog — never a client-side Firestore write.
- Admin auth is Google sign-in restricted to `lyricalmyricalbooks@gmail.com` (`admin/api.ts` + `ADMIN_EMAILS`/`requireAdmin`).
- Theme `design` (live) and `draftDesign` (draft) stay separate; Discard Draft never touches `design`.
- Fulfillment and address-verification states stay visible on orders.
- Accessible names and keyboard behaviour cannot regress.

## Admin (route `/admin/*`, all require the admin session)

| Screen | Reads | Writes / calls | Destructive / confirm | States that must exist | Revenue-sensitive | Analytics |
| --- | --- | --- | --- | --- | --- | --- |
| Shell (`Dashboard.tsx`) | `getStats`, `getSettings`, `getBooks` (search) | `updateSettings` (design/section save), `logout` | — | auth loading, signed-out, offline chip, mobile drawer | — | `recordVisit` is storefront-only |
| Overview (`AnalyticsDashboard`) | `getAnalytics`, `getBook` | — | — | loading, no data, partial failure, narrow chart, chart summary | revenue/orders KPIs (display only) | consumes `analytics` collection |
| Orders list | `getOrders` | `orderApi.bulkSetStatus`, `deleteTestOrders`, CSV export (client) | delete **only** marked test orders (dialog) | loading, empty, error, bulk selection | fulfillment status changes | — |
| Order detail | `getOrderById` | `setFulfillmentStatus`, `updateOrder`, `addOrderNote`, `addOrderEvent`, `refundOrder`, `markOrderPaid` (function), `createShippoOrder` | mark paid, refund, cancel (confirm) | timeline, tracking, refund history, digital delivery, Shippo address warning (`addressVerified === false`) | **mark paid, refund** | — |
| Books catalog | `getBooks` | `updateBook`, `duplicateBook`, `deleteBook` | delete (confirm) | loading, empty catalog, bulk selection | price/inventory display | — |
| Book editor | `getBook`, `getAuthors`, `getShippingProfiles`, `getSettings` | `createBook`, `updateBook`, `uploadFile` (Storage) | discard unsaved (warn) | validation, upload progress/error, dirty state | price, stock, formats, digital files | — |
| Discounts | `getDiscounts`, `getBooks` | `saveDiscount`, `updateDiscount`, `deleteDiscount` | delete/expire (confirm) | empty, validation, schedule | checkout re-validates server-side (`validateDiscount`); UI value is never authoritative | — |
| Reviews | `reviews` collection (latest 200) | `reviewsApi.setStatus`, `remove` | delete (dialog), bulk moderate with undo | loading, error, empty queue | — | — |
| Pages | `getPages` | `createPage`, `updatePage`, `deletePage` | delete (confirm), unsaved changes | empty, validation, draft/published | — | — |
| Settings › General | settings doc | `updateSettings`, `uploadBrandAsset` | — | dirty/save, error | maintenance mode affects storefront | — |
| Settings › Shipping | `getShippingProfiles`, `getShippoConfig`, `getBooks` | profile CRUD, `assignProductsToShippingProfile`, `saveShippoConfig` (token never re-displayed), `setShippoDynamicRates` | delete profile (confirm) | Shippo connected/not, address warnings | shipping rates | — |
| Settings › Payments | settings doc | — (Stripe keys are Functions secrets) | — | connection status, webhook health, **no secret exposure** | currency config | — |
| Settings › Notifications | settings doc | `updateSettings` | — | save, test-send, error | — | — |
| Theme editor | `getSettings`, `getPages`, `getBooks`, `getDefaultSettings` | `updateSettings(design/draft, publish)`, `discardThemeDraft`, `schedulePublish`, `cancelScheduledPublish`, `createPage/updatePage/deletePage`, uploads | discard draft, publish, delete page | Live/Draft/Unsaved, undo/redo, error | — | — |
| Activity logs | `getAuditLog(100)` | — | — | loading, empty, error, filter/search | — | — |

## Storefront (public routes)

| Screen | Data | Actions | States | Revenue-sensitive | Analytics (`commerce.ts` / `useSiteData`) |
| --- | --- | --- | --- | --- | --- |
| Home / sections | books, settings.design | add to cart (quick add) | loading, empty catalog | — | `recordVisit`, `track("view")` |
| Catalog / collection | books | search, sort, availability + category filter | empty results + reset | — | `trackCategory` |
| Book detail | book, reviews (approved) | variant, quantity, add to cart, wishlist, review submit | out-of-stock, low-stock, no reviews | price display only | `track("view")`, `track("add_to_cart")` |
| Cart | cart context (localStorage) | quantity, remove, discount code (`validateDiscount`) | empty, stock limit, invalid code | subtotal is display only | — |
| Checkout | cart, shipping zones | address, shipping method, Stripe handoff (`createStripeCheckoutSession`) | validation, loading, error, success | **server computes the charge; order stays `unpaid` until webhook** | `track("checkout_start")`, `track("purchase")` |
| Account | Firebase Auth, orders | sign in/out, profile, saved address, downloads (`downloadDigitalAsset`) | signed out, empty, error | paid-only digital downloads | — |
| Order tracking | order lookup | lookup form | not found, error | — | — |
| Wishlist / search / pages / consent / maintenance | local storage, books, pages | — | empty, offline | — | consent gates analytics |

## Responsive & keyboard checklist (per screen family)

Widths 375 / 768 / 1024 / 1440 / wide. Tab order follows visual order; dialogs
trap focus, close on Escape, restore focus; tables scroll horizontally inside
their region; no horizontal page scroll; controls usable at 200% zoom;
`prefers-reduced-motion` honoured; print views for receipts/packing slips.
