# Partner company logos

The logos of the companies a shop works with (Google, Stripe, Square, QuickBooks, Instagram, the card brands …), kept
here once and copied to the shop app and the platform pages by `build.mjs` (a test fails when a copy is out of date).

```
node shared/brand-logos/build.mjs            # rebuild logos.js and the copies after changing svg/ or sources.json
node shared/brand-logos/build.mjs --check
npm pack simple-icons@<version> && tar xzf simple-icons-*.tgz
node shared/brand-logos/build.mjs --import package   # refresh the single-colour marks from Simple Icons
```

Where they show: `BrandLogo`, `BrandTitle`, `BrandLogoRow` and `GoogleSignInButton` in
`apps/shop/src/app/components/brand/BrandLogo.tsx`; `SectionCard` and `Dialog` take a `logo` prop; the storefront's
payment icons (`features/site/paymentIcons.tsx`); the Google button on the platform pages (`.gsi-button`).

## Licensing and rules

- **Trademarks.** Every logo is a trademark of the company named below. We show one only to say a shop works with that
  company (nominative use): next to the company's own name, on the screen that connects to it or the payment method it
  takes. Never use one to suggest the company endorses Colophon or a press, never in our own branding, ads or app icon,
  and never for a company a shop does not actually connect to.
- **Artwork.** Google's G, Drive, Gmail and Calendar are Google's own full-colour files (gstatic.com). The others are
  the single-colour marks collected by [Simple Icons](https://simpleicons.org) (artwork data CC0; see its
  [disclaimer](https://github.com/simple-icons/simple-icons/blob/develop/DISCLAIMER.md)), drawn in each company's own
  colour as Simple Icons records it, with each company's source page below. Simple Icons grants no trademark rights:
  the owners' rules below still apply.
- **Full-colour artwork beside a single-colour mark.** A logo can also keep the company's full-colour file in `full/`
  (Mastercard: its official two-circle symbol). Places that show logos in their own colours use it; places that show
  them in one colour (the storefront's payment icons by default) keep the single-colour mark.
- **Never alter a logo.** No redrawing, recolouring (except the storefront's payment icons, which follow the shop's
  one text colour as the card brands allow for single-colour use), stretching, rotating, outlines, shadows or cropping.
  To change one, replace its SVG file with the owner's newer artwork and rebuild.
- **Clear space and size.** Logos sit on a white tile (or the company's own badge colour) at three sizes, 24, 36 and
  48 pixels, with the mark at about 62% of the tile, so every logo keeps clear space on all sides and the same size in
  every admin look, by day and by night, on phone and desktop.
- **Google sign-in.** Buttons that sign in with Google follow [Google's branding
  rules](https://developers.google.com/identity/branding-guidelines): the standard four-colour G, white with a #747775
  outline (Google's dark version at night), Roboto Medium, and only the words "Sign in with Google", "Sign up with
  Google" or "Continue with Google".
- **No rivals.** Customer-facing words never name a rival shop builder, so their logos are never in this kit.

## The logos

| Id | Company product | Owner | Artwork | Owner's rules |
| --- | --- | --- | --- | --- |
| `google` | Google | Google LLC | Google's own full-colour file | [rules](https://developers.google.com/identity/branding-guidelines) |
| `googledrive` | Google Drive | Google LLC | Google's own full-colour file | [rules](https://about.google/brand-resource-center/) |
| `gmail` | Gmail | Google LLC | Google's own full-colour file | [rules](https://about.google/brand-resource-center/) |
| `googlecalendar` | Google Calendar | Google LLC | Google's own full-colour file | [rules](https://about.google/brand-resource-center/) |
| `googleanalytics` | Google Analytics | Google LLC | Simple Icons 16.36.0 (CC0), single colour #E37400 | [rules](https://about.google/brand-resource-center/) |
| `googlesearchconsole` | Google Search Console | Google LLC | Simple Icons 16.36.0 (CC0), single colour #458CF5 | [rules](https://about.google/brand-resource-center/) |
| `googleads` | Google Ads | Google LLC | Simple Icons 16.36.0 (CC0), single colour #4285F4 | [rules](https://about.google/brand-resource-center/) |
| `googlemaps` | Google Maps | Google LLC | Simple Icons 16.36.0 (CC0), single colour #4285F4 | [rules](https://about.google/brand-resource-center/) |
| `googlesheets` | Google Sheets | Google LLC | Simple Icons 16.36.0 (CC0), single colour #34A853 | [rules](https://about.google/brand-resource-center/) |
| `googlepay` | Google Pay | Google LLC | Simple Icons 16.36.0 (CC0), single colour #4285F4 | [rules](https://developers.google.com/pay/api/web/guides/brand-guidelines) |
| `youtube` | YouTube | Google LLC | Simple Icons 16.36.0 (CC0), single colour #FF0000 | [rules](https://www.youtube.com/howyoutubeworks/resources/brand-resources/#logos-icons-and-colors) |
| `stripe` | Stripe | Stripe, Inc. | Simple Icons 16.36.0 (CC0), single colour #635BFF | [rules](https://stripe.com/newsroom/brand-assets) |
| `square` | Square | Block, Inc. | Simple Icons 16.36.0 (CC0), single colour #3E4348 | [rules](https://squareup.com/us/en/press) |
| `paypal` | PayPal | PayPal, Inc. | Simple Icons 16.36.0 (CC0), single colour #002991 | [rules](https://newsroom.paypal-corp.com/media-resources) |
| `quickbooks` | QuickBooks | Intuit Inc. | Simple Icons 16.36.0 (CC0), single colour #2CA01C | [rules](https://design.intuit.com/quickbooks/brand) |
| `godaddy` | GoDaddy | GoDaddy Inc. | Simple Icons 16.36.0 (CC0), single colour #1BDBDB | [rules](https://aboutus.godaddy.net/newsroom/media-resources/) |
| `instagram` | Instagram | Meta Platforms, Inc. | Simple Icons 16.36.0 (CC0), single colour #FF0069 | [rules](https://about.meta.com/brand/resources/instagram) |
| `facebook` | Facebook | Meta Platforms, Inc. | Simple Icons 16.36.0 (CC0), single colour #0866FF | [rules](https://about.meta.com/brand/resources/facebook/logo) |
| `threads` | Threads | Meta Platforms, Inc. | Simple Icons 16.36.0 (CC0), single colour #000000 | [rules](https://www.meta.com/brand/resources/instagram/threads) |
| `pinterest` | Pinterest | Pinterest, Inc. | Simple Icons 16.36.0 (CC0), single colour #BD081C | [rules](https://business.pinterest.com/en/brand-guidelines) |
| `tiktok` | TikTok | ByteDance Ltd. | Simple Icons 16.36.0 (CC0), single colour #000000 | [rules](https://developers.tiktok.com/doc/getting-started-design-guidelines) |
| `x` | X | X Corp. | Simple Icons 16.36.0 (CC0), single colour #000000 | [rules](https://about.x.com/en/who-we-are/brand-toolkit) |
| `zapier` | Zapier | Zapier, Inc. | Simple Icons 16.36.0 (CC0), single colour #FF4F00 | [rules](https://www.figma.com/file/NQFxTCE5pGR3dHZt0DkOyy/Zapier-Brand-Guidelines-%5BExternal%5D?type=design&node-id=101-9701&mode=design) |
| `mailchimp` | Mailchimp | Intuit Inc. | Simple Icons 16.36.0 (CC0), single colour #241C15 on #FFE01B | [rules](https://mailchimp.com/about/brand-assets) |
| `visa` | Visa | Visa Inc. | Simple Icons 16.36.0 (CC0), single colour #1A1F71 | [rules](https://www.visa.com/brandcenter) |
| `mastercard` | Mastercard | Mastercard International Inc. | Simple Icons 16.36.0 (CC0), single colour #EB001B | [rules](https://www.mastercard.com/brandcenter/us/en/brand-requirements/mastercard.html) |
| `americanexpress` | American Express | American Express Company | Simple Icons 16.36.0 (CC0), single colour #2E77BC | [rules](https://commons.wikimedia.org/wiki/File:American_Express_logo_(2018).svg) |
| `applepay` | Apple Pay | Apple Inc. | Simple Icons 16.36.0 (CC0), single colour #000000 | [rules](https://developer.apple.com/apple-pay/marketing/) |
| `klarna` | Klarna | Klarna Bank AB | Simple Icons 16.36.0 (CC0), single colour #0B051D on #FFB3C7 | [rules](https://klarna.design) |
| `afterpay` | Afterpay | Afterpay Ltd (Block, Inc.) | Simple Icons 16.36.0 (CC0), single colour #000000 on #B2FCE4 | [rules](https://www.afterpay.com/en-AU/business/resources/marketing/brand-tools/brand-guidelines) |
| `ups` | UPS | United Parcel Service of America, Inc. | Simple Icons 16.36.0 (CC0), single colour #150400 | [rules](https://www.ups.com) |
| `fedex` | FedEx | FedEx Corporation | Simple Icons 16.36.0 (CC0), single colour #4D148C | [rules](https://newsroom.fedex.com) |
| `usps` | USPS | United States Postal Service | Simple Icons 16.36.0 (CC0), single colour #333366 | [rules](https://www.usps.com) |
| `dhl` | DHL | Deutsche Post AG | Simple Icons 16.36.0 (CC0), single colour #D40511 on #FFCC00 | [rules](https://www.dpdhl-brands.com/dhl/en/guides/design-basics/logo-and-claim.html) |

Google Merchant Center and Google Business Profile have no public single-mark artwork, so their screens show the Google G
with the product's name beside it. Shippo and Klaviyo are not in the kit yet: add their own artwork here before showing
them.

**Canada Post stays out of the kit on purpose** (checked 4 November 2026,
https://www.canadapost-postescanada.ca/cpc/en/our-company/news-and-media/media-centre/canada-post-logos.page). Its
postmark is only for sponsors, media and schools. A shop that ships with it may use the wide "Shipped by Canada Post"
logo, but on a website that logo must always be a link to canadapost.ca, must never be placed on another shape, and
must sit on a page that talks about Canada Post. A small square tile breaks those rules. If it is ever shown, use their
downloaded "Shipped by" file unchanged, as a link, next to the shipping choice.
