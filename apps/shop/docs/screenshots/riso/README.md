# Riso Press screenshot matrix

Captured at 1440px (desktop) and 375px (mobile) from the built app and a mock-data harness.

- **Admin** screens (`admin-*`) were captured with mocked `adminApi` data; `admin-shell-*` are the real
  dashboard on its offline debug bypass (analytics/orders show error or empty states — Firestore is not reachable).
- **Storefront** screens (`store-*`) use the Riso theme preset seeded into the bootstrap cache; the checkout
  is captured with mocked settings (Stripe enabled). Fonts (Anton / Archivo / DM Mono) fall back in the capture
  environment because Google Fonts is blocked there, so headings render in a fallback face.
- Known capture artifacts: product images are flat colour placeholders; "NaN" shipping in checkout comes from the
  mock shipping-rate shape, not real data.

| Screen | Desktop | Mobile |
| --- | --- | --- |
| admin-book-editor | [desktop](admin-book-editor-desktop.jpg) | [mobile](admin-book-editor-mobile.jpg) |
| admin-books | [desktop](admin-books-desktop.jpg) | [mobile](admin-books-mobile.jpg) |
| admin-discounts | [desktop](admin-discounts-desktop.jpg) | [mobile](admin-discounts-mobile.jpg) |
| admin-login | [desktop](admin-login-desktop.jpg) | [mobile](admin-login-mobile.jpg) |
| admin-order-detail | [desktop](admin-order-detail-desktop.jpg) | [mobile](admin-order-detail-mobile.jpg) |
| admin-orders | [desktop](admin-orders-desktop.jpg) | [mobile](admin-orders-mobile.jpg) |
| admin-overview | [desktop](admin-overview-desktop.jpg) | [mobile](admin-overview-mobile.jpg) |
| admin-pages | [desktop](admin-pages-desktop.jpg) | [mobile](admin-pages-mobile.jpg) |
| admin-reviews | [desktop](admin-reviews-desktop.jpg) | [mobile](admin-reviews-mobile.jpg) |
| admin-settings-general | [desktop](admin-settings-general-desktop.jpg) | [mobile](admin-settings-general-mobile.jpg) |
| admin-settings-notifications | [desktop](admin-settings-notifications-desktop.jpg) | [mobile](admin-settings-notifications-mobile.jpg) |
| admin-settings-payments | [desktop](admin-settings-payments-desktop.jpg) | [mobile](admin-settings-payments-mobile.jpg) |
| admin-settings-shipping | [desktop](admin-settings-shipping-desktop.jpg) | [mobile](admin-settings-shipping-mobile.jpg) |
| admin-settings-shipping-profile | [desktop](admin-settings-shipping-profile-desktop.jpg) | [mobile](admin-settings-shipping-profile-mobile.jpg) |
| admin-shell | [desktop](admin-shell-desktop.jpg) | [mobile](admin-shell-mobile.jpg) |
| admin-shell-menu | [desktop](admin-shell-menu-desktop.jpg) | — |
| admin-theme-editor | [desktop](admin-theme-editor-desktop.jpg) | [mobile](admin-theme-editor-mobile.jpg) |
| store-account | [desktop](store-account-desktop.jpg) | [mobile](store-account-mobile.jpg) |
| store-cart | [desktop](store-cart-desktop.jpg) | [mobile](store-cart-mobile.jpg) |
| store-catalog | [desktop](store-catalog-desktop.jpg) | [mobile](store-catalog-mobile.jpg) |
| store-checkout | [desktop](store-checkout-desktop.jpg) | [mobile](store-checkout-mobile.jpg) |
| store-home | [desktop](store-home-desktop.jpg) | [mobile](store-home-mobile.jpg) |
| store-product | [desktop](store-product-desktop.jpg) | [mobile](store-product-mobile.jpg) |
| store-tracking | [desktop](store-tracking-desktop.jpg) | [mobile](store-tracking-mobile.jpg) |
| store-wishlist | [desktop](store-wishlist-desktop.jpg) | [mobile](store-wishlist-mobile.jpg) |
