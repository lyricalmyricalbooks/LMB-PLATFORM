# Pickup, local delivery, reusable content, and languages

Date: 2026-10-04
Status: Proposed design for owner review

## Outcome
Implement features 23, 24, 28, and 29 in the existing bookstore and Studio. Preserve server-priced checkout, webhook-only paid status and inventory changes, restricted admin access, and router-relative URLs. Preserve unrelated fulfillment edits currently in the checkout. Deliver on an isolated scoped branch with tests, production build, browser verification, commit, push, and an attached PR against main. Report local verification separately from deployed verification.

## Pickup
Extend existing pickup rates into a complete fulfillment method. Admin Shipping manages enabled locations, address, public instructions, opening hours, and preparation estimate. Checkout distinguishes shipping, pickup, and local delivery. Pickup choices show configured locations and do not require a shipping address; collect the customer contact and only the billing/tax information required by the authoritative payment calculation. The server validates the chosen location, eligible items, rate, and tax basis from current configuration. Never substitute shipping for an unavailable pickup choice.

Persist a server-issued fulfillment snapshot on each order. Admin Orders provides prepare, ready for pickup, and collected actions, with authenticated and idempotent transitions. Ready notices use the existing notification infrastructure and customer tracking displays pickup instructions. Collection completes fulfillment without buying a label or pretending the parcel shipped. Unpaid/refunded orders cannot enter preparation. Configuration starts disabled and requires a real address before activation.

## Local delivery
Add explicit local-delivery configuration under Shipping: enabled postal-code zones, fee, minimum qualifying order subtotal, delivery estimate, and public instructions. First version uses normalized Canadian postal-code prefixes and exact postal codes, with explicit admin explanations and a destination tester. Geographic radius is deferred because it requires geocoding and a provider decision.

The browser displays eligible options; the server independently revalidates destination, minimum subtotal, eligible physical items, and current fee. Preserve pickup/local choices when live Shippo rates are enabled. Reject stale or invalid selections. Persist the validated destination and delivery snapshot. Admin fulfillment provides ready for delivery, out for delivery, and delivered actions without requiring carrier tracking or purchasing a label. Mixed digital/physical baskets apply fulfillment only to physical items.

## Reusable authors and events
Extend the existing authors collection instead of creating duplicate identities. Add complete admin editing, publication status, biography, portrait/alt text, public links, and book references. Introduce validated event records: title, description, start/end time and timezone, venue/address or online link, image/alt text, author/book references, status, and optional booking link.

Studio sections can reference published author/event IDs through searchable pickers. Updating a referenced record updates all placements; section presentation remains local. Missing/unpublished/deleted references do not expose draft content or sample content to shoppers. Deletion warns about references and requires explicit handling. Event date/time formatting follows the selected storefront language. Existing author-name/catalog behavior remains compatible.

Wire schema, renderers, section library, preview snapshots, click-to-edit hooks, Find anything, responsive controls, and legacy shared contracts together. Add public author/event routes with editable layouts, metadata, and sitemap coverage where the record is published. Public queries only return published records, with an explicitly defined compatibility policy for existing author records; private drafts remain admin-only. Update Firestore rules and indexes to match actual query shapes.

## Multilingual storefront
Initial languages: English and French, with extensible locale definitions. Studio owns language enablement, language names, default language, translation editing, completeness indicators, and language preview. Provide explicit translation fields for storefront COPY_SCHEMA, book title/subtitle/description/photo alt text/SEO, author and event content, custom pages, policies, navigation/category labels, and translatable section/block content. Keep IDs, SKUs, prices, inventory, category membership, and operational configuration authoritative and shared across languages.

Add a Studio-editable accessible language selector. Preserve the selected language through navigation, reload, checkout, order confirmation/tracking, and notifications. A supported URL language parameter gives shareable URLs without changing existing product slugs. Explicitly empty translations remain empty; missing translations fall back to the default language. Store the order locale for transactional messages. Translate presentation labels for provider errors using editable messages rather than displaying raw provider text.

Translations follow the associated resource's existing draft/publication boundary; edits to draft Studio content cannot leak into published pages. Preview carries locale and translated resources through the iframe and new-tab snapshot. Set document language, localized metadata, canonical/hreflang rules and sitemap entries consistently. Manual translation editing is included; automatic AI translation is deferred pending an explicit provider choice.

## Architecture and data boundaries
Use existing settings/design persistence for Studio presentation and COPY_SCHEMA translations, existing book/author documents for resource translations, and dedicated event documents for events. Operational shipping configuration belongs in the existing shipping/settings contract and is server-validated. Published content is public; drafts and private operational histories are admin-only. Validate lengths, IDs, statuses, URLs, locale codes, postal rules, monetary amounts and transitions at authoritative boundaries. Never put secrets or private order operations in public settings.

## Verification
Meaningful tests cover shipping-engine browser/server parity, delivery postal eligibility and minimums, stale selections, pickup tax/address requirements, mixed baskets, webhook preservation, unauthorized actions, fulfillment transitions, duplicate notifications, draft/public content visibility, reference updates, translation fallback versus explicit blanks, locale persistence, preview synchronization, editable copy/style coverage, SEO and route behavior.

Run the full repository suite and production build after integrating current main. Browser-check admin configuration/content/language editing and storefront book-to-cart-to-checkout behavior for shipping, pickup, and delivery at desktop and phone sizes, plus French author/event/page content and order tracking. Use clearly labeled fixtures when live authorization is unavailable. Updated Functions and Firestore rules require deployment with the frontend; paid-order and live notification verification require authenticated sandbox walkthroughs.

## Acceptance
All four features have usable admin controls and shopper/fulfillment flows. New public presentation and copy are Studio-owned. Missing location or zone configuration leaves the service unavailable. No unrelated working-tree edits are included. Documentation in AGENTS.md, CLAUDE.md and docs/THEME_EDITOR.md is updated together. The PR records verification and deployment requirements.
