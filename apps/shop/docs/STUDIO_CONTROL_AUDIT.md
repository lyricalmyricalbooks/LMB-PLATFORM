# Studio control audit (16 October 2026)

Every Studio › Theme settings control (534) and every section › Style field (60, on desktop, tablet and phone)
was changed one at a time in the Studio fixture's preview, which runs the live design, and the preview page was
compared before and after. `scripts/studio-control-audit.mjs` repeats the check (`AUDIT_ONLY=<key,…>`,
`AUDIT_OUT=<file>`, `CHROMIUM_PATH`).

| Result | Controls |
|---|---|
| Visibly changed the page | 265 |
| Changed styles only (hover/focus, or a part that wasn't on screen) | 93 |
| Changed the page structure | 11 |
| Nothing changed | 165 |

Each "nothing changed" control was then read in the code. Most need something that wasn't on the test page
(a full bag, a sold-out book, a pop-up, hover, another setting switched on). The ones below were really broken.

## Broken, fixed in this change

| Control | What was wrong | Now |
|---|---|---|
| Typography › **Line height** | Set only on the page root; almost every text carries its own Tailwind line height, so it reached nearly nothing | Moves every text size's line height in proportion (`shopTypography.ts`). 1.6 = unchanged |
| Typography › **Letter spacing** | Same as line height | Adds to every tracking step; Normal = unchanged |
| Typography › **Heading weight**, Riso › **Uppercase headings**' spacing | The Riso heading rule forced weight 400 / 0.01em | Riso headings follow the controls (`--rp-heading-weight`, `--rp-heading-tracking`) |
| Typography › **Theme font** | The home/catalog view read Body font first, although the label (and every other page) says Theme font wins | Theme font first everywhere |
| Typography › **Logo wordmark font** | Never reached the header logo (missing from the logo field list) or the footer wordmark | Used by both; empty = heading font |
| Section › Style › **Button corners** (and any corner a section sets) | The Riso look forced square corners with `!important` over every `rounded-*` element | An element's own corner setting now wins; elements with none stay square |
| Section › Style › heading colour / size / weight / case / letter spacing | Didn't reach headings typed inside a rich-text field (Rich text, Image with text…) | Applied to those headings too |
| Custom pages › Page content › **Title in capitals** off | Riso uppercase still won | Title keeps its own case |
| Checkout · fields › **Field border colour**, **Field corners** | Lost to the Riso input reset | Applied (focus outline unchanged) |
| Book page › **Add-to-bag size** | Medium and Large both drew 52px | Medium is 44px; Large unchanged |
| Reference header › **Logo size** (desktop/phone), **Space between category links**, **Cart total placeholder** | Size was a fixed clamp; gaps and the placeholder text were ignored | Applied |
| Header › **Announcement text size / weight / letter spacing** | Only the scrolling ticker read them; the static bar was hard-coded | All bars |
| Footer & social links › **Facebook / X / TikTok URL** | Nothing rendered them (only Instagram) | Shown beside Instagram once filled in; their words are in Text & labels › Footer |
| Cart drawer › every Style control | The preview bag was empty, so nothing could be seen | The Studio preview shows a sample line in an empty bag (never saved; Remove shows the empty bag) |
| Shop grid › **Sold-out label** | Read the default, not your Text & labels word | Reads Text & labels |
| **Book page photo corners** | Sat in Book cards › Book photos, so it looked like a shop-grid control | Moved to Book page extras and relabelled |
| Header › **Header layout** | Only sets how see-through the header is when no background colour is set | Relabelled "Header see-through amount" |
| Reference-only controls (category gaps), missing-page "return" link | Labels didn't say where they apply | Labels say so |

## Broken, fixed later the same day (they work now, but start at Off)

| Control | Now |
|---|---|
| Layout › **Space between sections** | New `sectionGap` (0 = none) spaces every section after the first in a stack (`designTokensCss`). The old `sectionSpacing` keeps feeding the shop grid's row gap and is labelled that way |
| **Shadow scale** | Replaced by Animations & hover effects › **Book card shadow** (`cardShadowDepth`, Off by default) on every `.fm-card`, one step deeper on hover. The never-drawn saved `shadowScale` is ignored |
| **Spacing scale** | Removed: the shop grid gap and section spacing already have their own controls |
| **Show breadcrumbs** | Replaced by Show or hide whole features › **Breadcrumbs above a shop category** (`showCollectionBreadcrumbs`, off by default): Home / Parent / Category above the category heading; words in Text & labels › Collection & wishlist pages (`breadcrumbHome`, `breadcrumbSeparator`) |
| **Corner radius scale** | Shop-grid cards follow the chosen corner set (its middle value) |
| Book page › **description colour / alignment / font** | Each control says when Fine-tune › Book description sets its own value and offers **Use this control instead** (`studio/fineTuneConflicts.ts`) |
| Studio shows page-only values as empty | On All pages, a field says when the previewed page uses its own value and offers **Use the all-pages value** (`fieldPageOverride`) |

## Did nothing in the test, but work (they need a state)

- **Hover / focus / pressed only:** button hover colours, footer link and social hover, logo hover, focus ring colour and width, field focus colour, pressed buttons, drop-down menu panels.
- **Needs a part that wasn't on the page:** toasts (after Add to bag), cookie banner and pop-up (open them from Studio's pop-over menu), search overlay, enlarged photo viewer, recently viewed, reviews, newsletter.
- **Needs a book in that state:** sold-out, pre-order, coming-soon and sale badges, edition chooser, low-stock line, photo dots and thumbnails (fixture books have no photos).
- **Needs another setting on:** sticker navigation pills (Navigation style = Stickers), scrolling announcement speed, rotating announcements (2+ messages), Reference-header controls (Header layout = Reference), shop filter bar, design scales (Type scale), footer logo picture (Footer logo = Image), payment icons (an icon list), under-construction admin link, the logo controls while the wordmark is two-part, the ambient glow.
- **Only in one layout:** Tabs vs Accordions controls on the book page, classic footer columns.
- **Only on other pages:** utility-page header/footer (wishlist, account, tracking, 404), "Your data" box (order tracking), missing-page text.
- **Not drawn on the page:** favicon, share image, custom code (public pages only, never in the preview).
- **Motion controls:** the test browser asks for reduced motion, which switches animation off by design.

## Every control checked

| Control | Where | Result in the test | Fixed here |
|---|---|---|---|
| Page background (`backgroundColor`) | Colours · / | changes the page |  |
| Text (`textColor`) | Colours · / | changes the page |  |
| Accent (`primaryColor`) | Colours · / | changes the page |  |
| Link hover (`linkColorHover`) | Colours · / | changes the page |  |
| Borders & lines (`borderColor`) | Colours · / | changes the page |  |
| Muted text (`mutedTextColor`) | Colours · / | changes styles only (hover, focus, hidden part) |  |
| Second accent (press blue) (`secondaryColor`) | Colours · / | changes styles only (hover, focus, hidden part) |  |
| Panel background (`surfaceColor`) | Colours · / | changes the page |  |
| Raised panel background (`surfaceRaisedColor`) | Colours · / | changes the page |  |
| Image overlay / scrim (`overlayColor`) | Colours · / | changes the page |  |
| Selected tab / chip background (`activeControlBg`) | Colours · / | changes styles only (hover, focus, hidden part) |  |
| Selected tab / chip text (`activeControlText`) | Colours · / | changes styles only (hover, focus, hidden part) |  |
| Success (in stock, added) (`successColor`) | Colours · / | changes styles only (hover, focus, hidden part) |  |
| Warning (`warningColor`) | Colours · / | changes styles only (hover, focus, hidden part) |  |
| Error / danger (`dangerColor`) | Colours · / | changes styles only (hover, focus, hidden part) |  |
| Wishlist heart (`favoriteColor`) | Colours · / | changes styles only (hover, focus, hidden part) |  |
| Book cards colour scheme (`elementSchemes.cards`) | Colour schemes · / | no change in this test |  |
| Product page buy card colour scheme (`elementSchemes.buyCard`) | Colour schemes · / | no change in this test |  |
| Shopping bag colour scheme (`elementSchemes.cartDrawer`) | Colour schemes · / | no change in this test |  |
| Header colour scheme (`elementSchemes.header`) | Colour schemes · / | no change in this test |  |
| Footer colour scheme (`elementSchemes.footer`) | Colour schemes · / | no change in this test |  |
| Style (`buttonStyle`) | Buttons · / | changes the page |  |
| Background (`buttonColor`) | Buttons · / | changes the page |  |
| Text (`buttonTextColor`) | Buttons · / | changes the page |  |
| Hover background (`buttonHoverBgColor`) | Buttons · / | changes styles only (hover, focus, hidden part) |  |
| Hover text (`buttonHoverTextColor`) | Buttons · / | changes styles only (hover, focus, hidden part) |  |
| Corner radius (`buttonRadius`) | Buttons · / | changes the page |  |
| UPPERCASE labels (`buttonUppercase`) | Buttons · / | changes the page |  |
| Drop shadow (`buttonShadow`) | Buttons · / | changes the page |  |
| Heading font (Google Fonts) (`headingFont`) | Typography · / | changes the page |  |
| Body font (Google Fonts) (`bodyFont`) | Typography · / | changes the page |  |
| Header & menu font (Google Fonts) (`navFont`) | Typography · / | changes the page |  |
| Logo wordmark font (Google Fonts) (`wordmarkFont`) | Typography · / | no change in this test | yes |
| Theme font (overrides body font — clear it to use Body font) (`font`) | Typography · / | no change in this test | yes |
| Base text size (`baseFontSize`) | Typography · / | changes the page |  |
| Line height (`lineHeight`) | Typography · / | changes the page | yes |
| Heading weight (`headingWeight`) | Typography · / | changes styles only (hover, focus, hidden part) | yes |
| Body weight (`bodyWeight`) | Typography · / | changes the page |  |
| Letter spacing (`letterSpacing`) | Typography · / | changes styles only (hover, focus, hidden part) | yes |
| Minimum size (0 = automatic) (`smallPrintMinSize`) | Small print & labels · / | changes the page |  |
| Smallest text on phones (0 = off) (`phoneMinTextSize`) | Small print & labels · / | changes the page |  |
| Text color (buttons and filled badges keep their own) (`smallPrintColor`) | Small print & labels · / | changes the page |  |
| Letter case (`smallPrintCase`) | Small print & labels · / | changes the page |  |
| Letter spacing (`smallPrintTracking`) | Small print & labels · / | changes the page |  |
| Font (`smallPrintFont`) | Small print & labels · / | changes the page |  |
| Customer accounts (sign-in, account page and order history). Off = customers check out as guests and get carrier tracking links by email (`customerAccounts`) | Customer accounts · /account | changes the page |  |
| Show the “Your data” box on the order tracking page (shoppers ask for a copy of their data, or for it to be deleted) (`showPrivacyRequestForm`) | Customer accounts · /account | no change in this test |  |
| Use the full screen width (header, shop, book pages, custom pages and footer run to the screen edges; Content width and Shop page masthead & covers › Header width are then ignored) (`fullWidth`) | Layout & spacing · / | changes the page |  |
| Content width (`containerWidth`) | Layout & spacing · / | changes the page |  |
| Space between sections (`sectionSpacing`) | Layout & spacing · / | no change in this test |  |
| Card corner radius (boxed card style only) (`cardRadius`) | Layout & spacing · / | changes the page |  |
| Draw sections lower on the page only when shoppers scroll near them (faster first load) (`lazySections`) | Layout & spacing · / | no change in this test |  |
| Heading size scale (`typeScale`) | Design scales · / | changes the page |  |
| Scale starts from (body text size) (`typeScaleBase`) | Design scales · / | no change in this test |  |
| Shrink headings smoothly on smaller screens (`typeScaleFluid`) | Design scales · / | no change in this test |  |
| Spacing unit (sections' Space above and below are multiples of it) (`spaceUnit`) | Design scales · / | changes styles only (hover, focus, hidden part) |  |
| Spacing on phones (`phoneSpaceScale`) | Design scales · / | changes styles only (hover, focus, hidden part) |  |
| Corner set (cards, buy card, order slip) (`radiusScale`) | Design scales · / | changes styles only (hover, focus, hidden part) |  |
| Keyboard focus ring width (its colour: Printed-paper look (Riso) › Keyboard focus ring) (`focusRingWidth`) | Design scales · / | changes styles only (hover, focus, hidden part) |  |
| Box border while typing in it (`inputFocusColor`) | Design scales · / | changes styles only (hover, focus, hidden part) |  |
| Buttons when pressed (`buttonPress`) | Design scales · / | changes styles only (hover, focus, hidden part) |  |
| Show page footer (`showPageFooter`) | Custom pages · /page/about | changes the page |  |
| Show missing-page message (`showNotFoundMessage`) | Custom pages · /page/about | no change in this test |  |
| Show return to store link (`showNotFoundBack`) | Custom pages · /page/about | no change in this test | yes |
| Page colours (`pageChromeStyle`) | Custom pages · /page/about | changes the page |  |
| Show small label above title (`pageShowEyebrow`) | Custom pages · /page/about | changes the page |  |
| Title size (`pageTitleSize`) | Custom pages · /page/about | changes the page |  |
| Uppercase title (`pageTitleUppercase`) | Custom pages · /page/about | changes the page structure |  |
| Title colour (`pageTitleColor`) | Custom pages · /page/about | changes the page |  |
| Text size (`pageBodySize`) | Custom pages · /page/about | changes the page |  |
| Text colour (`pageTextColor`) | Custom pages · /page/about | changes the page |  |
| Alignment (`pageAlign`) | Custom pages · /page/about | changes the page |  |
| Column width (`pageWidth`) | Custom pages · /page/about | changes the page |  |
| Space above the title (`pageTopSpacing`) | Custom pages · /page/about | changes the page |  |
| Title font (`pageTitleFont`) | Custom pages · /page/about | changes the page |  |
| Title size · desktop (0 = use Title size) (`pageTitleSizePx`) | Custom pages · /page/about | changes the page |  |
| Title size · phone (0 = automatic, smaller than desktop) (`pageTitleSizePxMobile`) | Custom pages · /page/about | changes the page |  |
| Title weight (`pageTitleWeight`) | Custom pages · /page/about | changes the page |  |
| Line under the title (`pageShowRule`) | Custom pages · /page/about | changes the page |  |
| Line colour (`pageRuleColor`) | Custom pages · /page/about | changes the page |  |
| Line thickness (`pageRuleWidth`) | Custom pages · /page/about | changes the page |  |
| Space above and below the line (`pageRuleSpacing`) | Custom pages · /page/about | changes the page |  |
| Text width (line length) (`pageTextMeasure`) | Custom pages · /page/about | changes the page |  |
| Exact text width (0 = use Text width above) (`pageTextWidthPx`) | Custom pages · /page/about | changes the page |  |
| Card style (`productCardStyle`) | Book cards in the shop grid · /?catalog=true | changes the page |  |
| Image shown for books with no photo (`placeholderImageUrl`) | Book cards in the shop grid · /?catalog=true | changes the page structure |  |
| Show “low stock” when this many or fewer are left (cards) (`lowStockCardThreshold`) | Book cards in the shop grid · /?catalog=true | no change in this test |  |
| Hover effect (`productHoverEffect`) | Book cards in the shop grid · /?catalog=true | changes the page structure |  |
| Image shape (proportions) (`imageAspectRatio`) | Book cards in the shop grid · /?catalog=true | changes the page |  |
| Image outline (arch, circle, hexagon…) (`photoOutline`) | Book cards in the shop grid · /?catalog=true | changes the page |  |
| Columns (desktop) (`productColumnsDesktop`) | Book cards in the shop grid · /?catalog=true | changes the page |  |
| Columns (phone) (`productColumnsMobile`) | Book cards in the shop grid · /?catalog=true | changes the page |  |
| Gap between cards (`catalogGridGap`) | Book cards in the shop grid · /?catalog=true | changes the page |  |
| Card button text (`productCTA`) | Book cards in the shop grid · /?catalog=true | changes the page |  |
| Product image corner radius (`productBorderRadius`) | Book cards in the shop grid · /?catalog=true | no change in this test | yes |
| Quantity stepper on product page (`showQtyStepper`) | Book cards in the shop grid · /?catalog=true | no change in this test |  |
| Description style (`productDescriptionStyle`) | Book cards in the shop grid · /?catalog=true | no change in this test |  |
| Show price only on hover (`showPriceOnHover`) | Book cards in the shop grid · /?catalog=true | changes the page |  |
| “Add to bag” button under each book in the shop grid (books with several editions get “Choose options”) (`showQuickAdd`) | Book cards in the shop grid · /?catalog=true | changes the page |  |
| Heart (save to wishlist) button on shop cards (`showCardWishlist`) | Book cards in the shop grid · /?catalog=true | changes the page |  |
| Show “sold out” badge (`showSoldOutBadge`) | Book cards in the shop grid · /?catalog=true | no change in this test |  |
| Sold-out badge look (`soldOutBadgeStyle`) | Book cards in the shop grid · /?catalog=true | no change in this test |  |
| Sold-out badge colour (stamp ink / tag / band) (`soldOutBadgeBg`) | Book cards in the shop grid · /?catalog=true | no change in this test |  |
| Sold-out badge text colour (`soldOutBadgeText`) | Book cards in the shop grid · /?catalog=true | no change in this test |  |
| Sold-out badge text size (0 = automatic) (`soldOutBadgeSize`) | Book cards in the shop grid · /?catalog=true | no change in this test |  |
| Sold-out badge corner (tag & small box) (`soldOutBadgePosition`) | Book cards in the shop grid · /?catalog=true | no change in this test |  |
| Grey out sold-out photos (`soldOutPhotoFade`) | Book cards in the shop grid · /?catalog=true | no change in this test |  |
| Show collection label on cards (`showCollectionMeta`) | Book cards in the shop grid · /?catalog=true | no change in this test |  |
| Line above card title (0 = hidden) (`catalogCardRuleWidth`) | Book cards in the shop grid · /?catalog=true | changes the page |  |
| Card price style (`catalogPriceStyle`) | Book cards in the shop grid · /?catalog=true | changes the page |  |
| Card title color (`productTitleColor`) | Book cards in the shop grid · /?catalog=true | changes the page |  |
| Card title size · desktop (0 = automatic) (`cardTitleSize`) | Book cards in the shop grid · /?catalog=true | changes the page |  |
| Card title size · phone (0 = same as desktop) (`cardTitleSizeMobile`) | Book cards in the shop grid · /?catalog=true | changes the page |  |
| Smallest card title & price on phones (0 = off) (`cardTitlePhoneMin`) | Book cards in the shop grid · /?catalog=true | changes the page |  |
| Card title weight (`cardTitleWeight`) | Book cards in the shop grid · /?catalog=true | changes the page |  |
| Card title font (`cardTitleFont`) | Book cards in the shop grid · /?catalog=true | changes the page |  |
| Card title letter spacing (`cardTitleTracking`) | Book cards in the shop grid · /?catalog=true | changes the page |  |
| Card price color (`productPriceColor`) | Book cards in the shop grid · /?catalog=true | changes the page |  |
| Card price size · desktop (0 = automatic) (`cardPriceSize`) | Book cards in the shop grid · /?catalog=true | changes the page |  |
| Card price size · phone (0 = same as desktop) (`cardPriceSizeMobile`) | Book cards in the shop grid · /?catalog=true | changes the page |  |
| Price under the title on phones (`cardPriceStackPhone`) | Book cards in the shop grid · /?catalog=true | changes the page |  |
| Card price weight (`cardPriceWeight`) | Book cards in the shop grid · /?catalog=true | changes the page |  |
| Card price font (`cardPriceFont`) | Book cards in the shop grid · /?catalog=true | changes the page |  |
| Boxed price tag background (`cardPriceTagBg`) | Book cards in the shop grid · /?catalog=true | changes styles only (hover, focus, hidden part) |  |
| Card crossed-out (old) price color (`cardPriceOldColor`) | Book cards in the shop grid · /?catalog=true | changes the page |  |
| Badge background (`badgeBgPrimary`) | Book cards in the shop grid · /?catalog=true | changes the page |  |
| Badge text (`badgeTextPrimary`) | Book cards in the shop grid · /?catalog=true | changes the page |  |
| Secondary badge background (`badgeBgSecondary`) | Book cards in the shop grid · /?catalog=true | changes styles only (hover, focus, hidden part) |  |
| Secondary badge text (`badgeTextSecondary`) | Book cards in the shop grid · /?catalog=true | changes styles only (hover, focus, hidden part) |  |
| “Low stock” color (`lowInventoryColor`) | Book cards in the shop grid · /?catalog=true | changes styles only (hover, focus, hidden part) |  |
| Header layout (`headerStyle`) | Header & announcement bar · / | no change in this test | yes |
| Show publisher navigation row (`showSecondaryNavigation`) | Header & announcement bar · / | no change in this test |  |
| Logo alignment (`logoPosition`) | Header & announcement bar · / | changes the page |  |
| Logo height (`logoHeight`) | Header & announcement bar · / | no change in this test |  |
| Stick header to top (`stickyHeader`) | Header & announcement bar · / | changes the page |  |
| Transparent header over hero (`transparentHeader`) | Header & announcement bar · / | no change in this test |  |
| Header background (`headerBg`) | Header & announcement bar · / | no change in this test |  |
| Header text (`headerColor`) | Header & announcement bar · / | changes the page |  |
| Show announcement bar (`showAnnouncement`) | Header & announcement bar · / | changes the page |  |
| Announcement text (`announcementText`) | Header & announcement bar · / | changes the page |  |
| Announcement background (`announcementBg`) | Header & announcement bar · / | changes the page |  |
| Announcement text color (`announcementColor`) | Header & announcement bar · / | changes the page |  |
| Scrolling ticker (`announcementScrolling`) | Header & announcement bar · / | changes the page |  |
| Announcement text size (`announcementFontSize`) | Header & announcement bar · / | no change in this test | yes |
| Announcement weight (`announcementWeight`) | Header & announcement bar · / | no change in this test | yes |
| Announcement letter spacing (`announcementTracking`) | Header & announcement bar · / | no change in this test | yes |
| Ticker speed (seconds per loop) (`announcementSpeed`) | Header & announcement bar · / | no change in this test |  |
| Seconds each message shows (several messages) (`announcementRotateSeconds`) | Header & announcement bar · / | no change in this test |  |
| Nav link style (`navStyle`) | Header & announcement bar · / | changes the page |  |
| Show phone navigation (`showMobileNavigation`) | Header & announcement bar · / | changes the page |  |
| Compact header on phones (thin announcement line, one-line logo, search & bag) (`phoneCompactHeader`) | Header & announcement bar · / | changes the page |  |
| Phone navigation style (`mobileNavStyle`) | Header & announcement bar · / | changes the page |  |
| Phone tab text size (`mobileNavTabSize`) | Header & announcement bar · / | changes the page |  |
| Show the shop header & footer on wishlist, account, order tracking and missing pages (`showStoreChromeOnUtilityPages`) | Header & announcement bar · / | no change in this test |  |
| Hide search icon (`hideHeaderSearch`) | Header & announcement bar · / | changes the page |  |
| Hide wishlist (heart) icon (`hideHeaderWishlist`) | Header & announcement bar · / | changes the page |  |
| Hide account icon (`hideHeaderAccount`) | Header & announcement bar · / | changes the page |  |
| Hide currency selector (`hideCurrencySelector`) | Header & announcement bar · / | changes the page |  |
| Hide light/dark toggle (`hideThemeToggle`) | Header & announcement bar · / | changes the page |  |
| Hide “Admin” link (`hideAdminLink`) | Header & announcement bar · / | changes the page |  |
| Hide cart button (`hideCartButton`) | Header & announcement bar · / | changes the page |  |
| Delay before it opens (`popupDelaySeconds`) | Pop-up window · / | no change in this test |  |
| How often it shows (`popupFrequency`) | Pop-up window · / | no change in this test |  |
| Position (`popupPosition`) | Pop-up window · / | no change in this test |  |
| Width (`popupMaxWidth`) | Pop-up window · / | no change in this test |  |
| Page shading behind it (`popupBackdropOpacity`) | Pop-up window · / | no change in this test |  |
| Don't show on phones (`popupHideOnPhones`) | Pop-up window · / | no change in this test |  |
| Pop-up background (`popupBg`) | Pop-up window · / | no change in this test |  |
| Pop-up text colour (`popupTextColor`) | Pop-up window · / | no change in this test |  |
| Pop-up outline colour (`popupBorderColor`) | Pop-up window · / | no change in this test |  |
| Pop-up outline width (`popupBorderWidth`) | Pop-up window · / | no change in this test |  |
| Where messages appear (`toastPosition`) | Short notice messages · / | no change in this test |  |
| Message background (`toastBg`) | Short notice messages · / | no change in this test |  |
| Message text colour (`toastTextColor`) | Short notice messages · / | no change in this test |  |
| Message text size (`toastFontSize`) | Short notice messages · / | no change in this test |  |
| Message letter spacing (`toastTracking`) | Short notice messages · / | no change in this test |  |
| Message corner rounding (`toastRadius`) | Short notice messages · / | no change in this test |  |
| Message outline width (`toastBorderWidth`) | Short notice messages · / | no change in this test |  |
| Message outline colour (`toastBorderColor`) | Short notice messages · / | no change in this test |  |
| Widest a message can be (`toastMaxWidth`) | Short notice messages · / | no change in this test |  |
| Hide the “Join the Catalogue” sign-up box (`hideNewsletter`) | Footer & social links · / | changes the page |  |
| Hide the “Recently viewed” row on the shop page (`hideRecentlyViewed`) | Footer & social links · / | no change in this test |  |
| Footer navigation layout (`footerNavigationLayout`) | Footer & social links · / | changes the page |  |
| Show Explore link group (`showFooterExplore`) | Footer & social links · / | changes the page |  |
| Show Participate & connect link group (`showFooterConnect`) | Footer & social links · / | changes the page |  |
| Show legal row heading (`showFooterLegalHeading`) | Footer & social links · / | changes the page |  |
| Show footer location (`showFooterLocation`) | Footer & social links · / | changes the page |  |
| Multi-column footer (`footerColumns`) | Footer & social links · / | changes the page |  |
| Footer columns (`footerLayout`) | Footer & social links · / | no change in this test |  |
| Footer background (`footerBg`) | Footer & social links · / | changes the page |  |
| Where the link groups sit (`footerLinksAlign`) | Footer & social links · / | changes the page |  |
| Space above & below the footer links (desktop) (`footerPaddingY`) | Footer & social links · / | changes the page |  |
| Space above & below the footer links (phone) (`footerPaddingYMobile`) | Footer & social links · / | changes the page |  |
| Space above & below the legal row and bottom bar (`footerBarPaddingY`) | Footer & social links · / | changes the page |  |
| Space between link groups (`footerColumnGap`) | Footer & social links · / | changes the page |  |
| Space between links (`footerLinkGap`) | Footer & social links · / | changes the page |  |
| Footer text size (`footerTextSize`) | Footer & social links · / | changes the page |  |
| Footer text & link colour (`footerTextColor`) | Footer & social links · / | changes the page |  |
| Footer group heading colour (`footerHeadingColor`) | Footer & social links · / | changes the page |  |
| Footer link colour on hover (`footerLinkHoverColor`) | Footer & social links · / | changes styles only (hover, focus, hidden part) |  |
| Show divider lines (legal row & bottom bar) (`showFooterDividers`) | Footer & social links · / | changes the page |  |
| Divider line colour (`footerDividerColor`) | Footer & social links · / | changes the page |  |
| Show a coloured line along the top of the footer (`showFooterAccentLine`) | Footer & social links · / | changes the page |  |
| Top line thickness (`footerAccentLineWidth`) | Footer & social links · / | changes the page |  |
| Footer accent colour (top line & group headings; blank = theme accent) (`footerAccentColor`) | Footer & social links · / | changes the page |  |
| Colour the link-group headings with the accent (`footerGroupHeadingsAccent`) | Footer & social links · / | changes the page |  |
| Logo & shop name position (`footerBrandAlign`) | Footer & social links · / | changes the page |  |
| Centred logo: line up with the links' middle or top (`footerBrandVAlign`) | Footer & social links · / | changes styles only (hover, focus, hidden part) |  |
| Centre the logo on phones too (`footerBrandCenterMobile`) | Footer & social links · / | changes the page |  |
| Show a line between the logo and the links (`showFooterBrandDivider`) | Footer & social links · / | changes the page |  |
| Show Instagram & email icons as square buttons (`footerSocialBoxes`) | Footer & social links · / | changes the page |  |
| Square button colour on hover (blank = footer accent) (`footerSocialHoverColor`) | Footer & social links · / | changes styles only (hover, focus, hidden part) |  |
| Show “Admin” link in the footer's bottom bar (`showFooterAdminLink`) | Footer & social links · / | changes the page |  |
| Logo picture in the footer (`footerLogo`) | Footer & social links · / | no change in this test |  |
| Footer logo picture (blank = the header's Logo image) (`footerLogoUrl`) | Footer & social links · / | no change in this test |  |
| Footer logo width (`footerLogoWidth`) | Footer & social links · / | no change in this test |  |
| Show social links (`showSocialInFooter`) | Footer & social links · / | changes the page |  |
| Show payment-method icons row (`showPaymentBadges`) | Footer & social links · / | no change in this test |  |
| Show “Powered by” line (`showPoweredBy`) | Footer & social links · / | changes the page |  |
| Instagram URL (`social.instagram`) | Footer & social links · / | changes the page structure |  |
| X / Twitter URL (`social.twitter`) | Footer & social links · / | no change in this test | yes |
| Facebook URL (`social.facebook`) | Footer & social links · / | no change in this test | yes |
| TikTok URL (`social.tiktok`) | Footer & social links · / | no change in this test | yes |
| Logo image (optional) (`logoUrl`) | Logo & wordmark · / | no change in this test |  |
| Share image (link previews on social / messages) (`shareImageUrl`) | Logo & wordmark · / | no change in this test |  |
| Browser tab icon (favicon) (blank = the built-in lyre icon) (`faviconUrl`) | Logo & wordmark · / | no change in this test |  |
| Recolor logo image with the color below (`logoTint`) | Logo & wordmark · / | no change in this test |  |
| Logo / wordmark color (`logoColor`) | Logo & wordmark · / | changes the page |  |
| Wordmark color when pointed at or clicked (empty = link hover color) (`logoHoverColor`) | Logo & wordmark · / | changes styles only (hover, focus, hidden part) |  |
| Text logo (when no wordmark / image) (`logoText`) | Logo & wordmark · / | no change in this test |  |
| Wordmark style (`wordmarkStyle`) | Logo & wordmark · / | changes the page |  |
| Wordmark: first word (`wordmarkPrimary`) | Logo & wordmark · / | changes the page |  |
| Wordmark: second word (`wordmarkSecondary`) | Logo & wordmark · / | changes the page |  |
| Dim the second word (`wordmarkSecondaryMuted`) | Logo & wordmark · / | changes the page |  |
| Second word color (overrides dimming) (`wordmarkSecondaryColor`) | Logo & wordmark · / | changes the page |  |
| Wordmark size (`wordmarkSize`) | Logo & wordmark · / | changes the page |  |
| Wordmark weight (`wordmarkWeight`) | Logo & wordmark · / | changes the page |  |
| Heading (leave empty to hide) (`catalogHeading`) | Shop page heading & filters · /?catalog=true | changes the page |  |
| Heading font (`catalogHeadingFont`) | Shop page heading & filters · /?catalog=true | changes the page |  |
| Heading size (desktop, 0 = standard) (`catalogHeadingSize`) | Shop page heading & filters · /?catalog=true | changes styles only (hover, focus, hidden part) |  |
| Heading size (phone, 0 = standard) (`catalogHeadingSizeMobile`) | Shop page heading & filters · /?catalog=true | changes styles only (hover, focus, hidden part) |  |
| Heading case (`catalogHeadingCase`) | Shop page heading & filters · /?catalog=true | changes styles only (hover, focus, hidden part) |  |
| Heading colour (`catalogHeadingColor`) | Shop page heading & filters · /?catalog=true | changes styles only (hover, focus, hidden part) |  |
| Show the shop filter bar beside the heading (All · your shop categories · In stock) (`showShopFilterBar`) | Shop page heading & filters · /?catalog=true | changes the page |  |
| Shop filter bar: show how many books each button finds (`shopFilterBarCounts`) | Shop page heading & filters · /?catalog=true | no change in this test |  |
| Shop filter bar: include an “In stock” button (`shopFilterBarInStock`) | Shop page heading & filters · /?catalog=true | no change in this test |  |
| Shop filter bar font (`shopFilterBarFont`) | Shop page heading & filters · /?catalog=true | no change in this test |  |
| Shop filter bar button outline (`shopFilterBarBorderColor`) | Shop page heading & filters · /?catalog=true | no change in this test |  |
| Shop filter bar chosen button (outline and text) (`shopFilterBarActiveColor`) | Shop page heading & filters · /?catalog=true | no change in this test |  |
| Show “N titles” count (`showCatalogCount`) | Shop page heading & filters · /?catalog=true | changes the page |  |
| Show category chips (`showCategoryChips`) | Shop page heading & filters · /?catalog=true | changes the page |  |
| Show counts on chips (`categoryChipShowCounts`) | Shop page heading & filters · /?catalog=true | no change in this test |  |
| Show search, sort & in-stock bar (`showCatalogControls`) | Shop page heading & filters · /?catalog=true | changes the page |  |
| Search pop-up: max results shown (`searchResultLimit`) | Shop page heading & filters · /?catalog=true | no change in this test |  |
| Search pop-up: show “See all results” link when more books match (`showSearchSeeAll`) | Shop page heading & filters · /?catalog=true | no change in this test |  |
| Search pop-up: show this shopper's recent searches (`showRecentSearches`) | Shop page heading & filters · /?catalog=true | no change in this test |  |
| Search pop-up: popular searches (comma-separated, blank = none) (`searchSuggestions`) | Shop page heading & filters · /?catalog=true | no change in this test |  |
| Layout (`catalogLayoutStyle`) | Shop page masthead & covers · /?catalog=true | changes the page |  |
| Masthead text (replaces the wordmark) (`catalogMastheadText`) | Shop page masthead & covers · /?catalog=true | changes the page structure |  |
| Masthead text case (`brandTransform`) | Shop page masthead & covers · /?catalog=true | changes the page structure |  |
| Masthead size (desktop) (`catalogMastheadDesktop`) | Shop page masthead & covers · /?catalog=true | changes the page structure |  |
| Masthead size (phone) (`catalogMastheadMobile`) | Shop page masthead & covers · /?catalog=true | no change in this test |  |
| Header width (`catalogHeaderWidth`) | Shop page masthead & covers · /?catalog=true | no change in this test |  |
| Header rule thickness (`catalogHeaderRuleWidth`) | Shop page masthead & covers · /?catalog=true | no change in this test |  |
| Space between category links, desktop (wins over Navigation links › Space between links) (`catalogNavGapDesktop`) | Shop page masthead & covers · /?catalog=true | no change in this test | yes |
| Space between category links, phone (`catalogNavGapMobile`) | Shop page masthead & covers · /?catalog=true | no change in this test | yes |
| Book title case (`catalogTitleTransform`) | Shop page masthead & covers · /?catalog=true | changes the page |  |
| Cover image fit (`catalogImageFit`) | Shop page masthead & covers · /?catalog=true | changes the page |  |
| Cover focus (left↔right) (`catalogImageFocalX`) | Shop page masthead & covers · /?catalog=true | changes the page |  |
| Cover focus (top↔bottom) (`catalogImageFocalY`) | Shop page masthead & covers · /?catalog=true | changes the page |  |
| Cart button placement (`catalogCartPlacement`) | Shop page masthead & covers · /?catalog=true | no change in this test |  |
| Empty cart total text (`catalogCartTotalPlaceholder`) | Shop page masthead & covers · /?catalog=true | no change in this test | yes |
| Max categories in the nav (the Reference header shows only this many, in Shop categories order) (`referenceCategoryLimit`) | Shop page masthead & covers · /?catalog=true | no change in this test |  |
| Link color (`navLinkColor`) | Navigation links · / | changes the page |  |
| Link size (`navLinkSize`) | Navigation links · / | changes the page |  |
| Link weight (`navLinkWeight`) | Navigation links · / | changes the page |  |
| Link letter spacing (`navLinkSpacing`) | Navigation links · / | changes the page |  |
| Current page link color (empty = link hover color) (`navLinkActiveColor`) | Navigation links · / | changes the page |  |
| Inactive link brightness (`navLinkOpacity`) | Navigation links · / | changes the page |  |
| Category bar position (`navPlacement`) | Navigation links · / | changes the page |  |
| Space between links (the category bar uses Shop page masthead & covers › Space between category links when that is set) (`navGap`) | Navigation links · / | changes the page |  |
| When links don’t fit on one line (`navLineMode`) | Navigation links · / | changes the page structure |  |
| Shrink no smaller than (`navFitMin`) | Navigation links · / | no change in this test |  |
| Link case (`navLinkTransform`) | Navigation links · / | changes the page |  |
| Sticker pill corner shape (pixels per corner, e.g. 14px 4px 14px 4px; one number rounds all four) (`navPillRadius`) | Navigation links · / | no change in this test |  |
| Tilt sticker pills (`navPillRotate`) | Navigation links · / | no change in this test |  |
| Colorful sticker pills (`navPillActivePalette`) | Navigation links · / | no change in this test |  |
| Show sub-categories as their own links (no drop-down) (`navFlatSubcategories`) | Navigation links · / | changes the page |  |
| Hide the “All” link at the top of drop-downs (`navDropdownHideAll`) | Navigation links · / | no change in this test |  |
| Drop-down background (`navDropdownBg`) | Navigation links · / | no change in this test |  |
| Drop-down link color (`navDropdownTextColor`) | Navigation links · / | no change in this test |  |
| Drop-down border color (`navDropdownBorderColor`) | Navigation links · / | no change in this test |  |
| Drop-down border thickness (`navDropdownBorderWidth`) | Navigation links · / | no change in this test |  |
| Drop-down link case (`navDropdownTransform`) | Navigation links · / | no change in this test |  |
| Header menu drop-down & mega menu background (`headerMenuPanelBg`) | Navigation links · / | no change in this test |  |
| Header menu drop-down & mega menu link color (`headerMenuPanelTextColor`) | Navigation links · / | no change in this test |  |
| Header menu drop-down & mega menu border color (`headerMenuPanelBorderColor`) | Navigation links · / | no change in this test |  |
| Header menu drop-down & mega menu corners (`headerMenuPanelRadius`) | Navigation links · / | no change in this test |  |
| Show edition details (`showPdpEditionDetails`) | Book page · photos & layout · /books/night-pages | no change in this test |  |
| Show “only N left” on the product page at or below (`lowStockProductThreshold`) | Book page · photos & layout · /books/night-pages | no change in this test |  |
| Recently viewed: how many books (`recentlyViewedCount`) | Book page · photos & layout · /books/night-pages | no change in this test |  |
| Image layout (`productImageLayout`) | Book page · photos & layout · /books/night-pages | changes the page |  |
| Details side (`productContentPosition`) | Book page · photos & layout · /books/night-pages | changes the page |  |
| Text alignment (`productAlignment`) | Book page · photos & layout · /books/night-pages | changes the page |  |
| Title size (`productTitleSize`) | Book page · photos & layout · /books/night-pages | changes the page |  |
| Subtitle weight (`productSubtitleWeight`) | Book page · photos & layout · /books/night-pages | no change in this test |  |
| Photo size (max width) (`productImageMaxWidth`) | Book page · photos & layout · /books/night-pages | changes the page |  |
| Photo shape (proportions) (`productImageAspect`) | Book page · photos & layout · /books/night-pages | changes the page |  |
| Frame size (adapt to each photo) (`productImageFrameMode`) | Book page · photos & layout · /books/night-pages | no change in this test |  |
| Shape for landscape photos (smart frames) (`productImageAspectLandscape`) | Book page · photos & layout · /books/night-pages | no change in this test |  |
| Photo outline (arch, circle, hexagon…) (`productPhotoOutline`) | Book page · photos & layout · /books/night-pages | changes the page |  |
| Photo fit (`productImageFit`) | Book page · photos & layout · /books/night-pages | changes the page |  |
| Image shadow (`productImageShadow`) | Book page · photos & layout · /books/night-pages | changes the page |  |
| Image hover zoom (`productImageHoverScale`) | Book page · photos & layout · /books/night-pages | no change in this test |  |
| Ambient glow behind image (`showAmbientGlow`) | Book page · photos & layout · /books/night-pages | changes the page |  |
| Glow strength (`glowIntensity`) | Book page · photos & layout · /books/night-pages | no change in this test |  |
| Glow color (`productImageGlowColor`) | Book page · photos & layout · /books/night-pages | no change in this test |  |
| Details layout (`productDetailsLayout`) | Book page · photos & layout · /books/night-pages | changes the page |  |
| Add-to-bag width (`productCtaWidth`) | Book page · photos & layout · /books/night-pages | changes the page |  |
| Add-to-bag size (`productCtaSize`) | Book page · photos & layout · /books/night-pages | changes the page structure | yes |
| Add-to-bag animation (`productCtaAnimation`) | Book page · photos & layout · /books/night-pages | changes the page |  |
| Add-to-bag text (`addToBagLabel`) | Book page · photos & layout · /books/night-pages | changes the page |  |
| “Frequently bought together” (`showBundleWidget`) | Book page · photos & layout · /books/night-pages | no change in this test |  |
| Bundle style (`productBundleLayout`) | Book page · photos & layout · /books/night-pages | no change in this test |  |
| “From the Catalogue” row (related books) (`showRelatedProducts`) | Book page · photos & layout · /books/night-pages | changes the page |  |
| Specifications (`showSpecs`) | Book page · photos & layout · /books/night-pages | no change in this test |  |
| Share button (`showSocialShare`) | Book page · photos & layout · /books/night-pages | changes the page |  |
| Heart (save to wishlist) button next to Add to bag (`showPdpWishlist`) | Book page · photos & layout · /books/night-pages | changes the page |  |
| “Notify me when back in stock” box (sold-out items) (`showBackInStock`) | Book page · photos & layout · /books/night-pages | no change in this test |  |
| “Email me when it's out” box (Coming soon books — the Coming soon button opens it) (`showComingSoonSignup`) | Book page · photos & layout · /books/night-pages | no change in this test |  |
| Image zoom (`showZoom`) | Book page · photos & layout · /books/night-pages | no change in this test |  |
| Click photo to enlarge (full-screen viewer) (`showPhotoLightbox`) | Book page · photos & layout · /books/night-pages | changes the page |  |
| Show book videos (added in Books › edit › Images) among the photos (`showProductVideos`) | Book page · photos & layout · /books/night-pages | no change in this test |  |
| Show “Back” link above the breadcrumb (`pdpShowBackLink`) | Book page · buy box & details · /books/night-pages | changes the page |  |
| Show the arrow before the “Back” link (`pdpShowBackArrow`) | Book page · buy box & details · /books/night-pages | changes the page |  |
| Show breadcrumb (Shop / category / title) (`pdpShowBreadcrumb`) | Book page · buy box & details · /books/night-pages | changes the page |  |
| Card background (`pdpCardBg`) | Book page · buy box & details · /books/night-pages | changes the page |  |
| Card border colour (`pdpCardBorderColor`) | Book page · buy box & details · /books/night-pages | changes the page |  |
| Card & panel border width (`pdpCardBorderWidth`) | Book page · buy box & details · /books/night-pages | changes the page |  |
| Card offset shadow colour (`pdpCardShadowColor`) | Book page · buy box & details · /books/night-pages | changes the page |  |
| Card offset shadow distance (0 = none) (`pdpCardShadowOffset`) | Book page · buy box & details · /books/night-pages | changes the page |  |
| Card inner spacing (`pdpCardPadding`) | Book page · buy box & details · /books/night-pages | changes the page |  |
| Lines inside the card (`pdpCardDividerColor`) | Book page · buy box & details · /books/night-pages | changes the page |  |
| “Notify me” signup box: background (`pdpAlertBg`) | Book page · buy box & details · /books/night-pages | changes styles only (hover, focus, hidden part) |  |
| “Notify me” signup box: border colour (`pdpAlertBorderColor`) | Book page · buy box & details · /books/night-pages | changes styles only (hover, focus, hidden part) |  |
| “Notify me” signup box: border width (`pdpAlertBorderWidth`) | Book page · buy box & details · /books/night-pages | changes styles only (hover, focus, hidden part) |  |
| “Notify me” signup box: corners (`pdpAlertRadius`) | Book page · buy box & details · /books/night-pages | changes styles only (hover, focus, hidden part) |  |
| “Notify me” signup box: inner spacing (`pdpAlertPadding`) | Book page · buy box & details · /books/night-pages | changes styles only (hover, focus, hidden part) |  |
| “Notify me” signup box: heading colour (`pdpAlertHeadingColor`) | Book page · buy box & details · /books/night-pages | changes styles only (hover, focus, hidden part) |  |
| “Notify me” signup box: email field border colour (`pdpAlertFieldBorderColor`) | Book page · buy box & details · /books/night-pages | changes styles only (hover, focus, hidden part) |  |
| “Notify me” signup box: button background (`pdpAlertButtonBg`) | Book page · buy box & details · /books/night-pages | changes styles only (hover, focus, hidden part) |  |
| “Notify me” signup box: button text colour (`pdpAlertButtonText`) | Book page · buy box & details · /books/night-pages | changes styles only (hover, focus, hidden part) |  |
| “Notify me” signup box: button border colour (`pdpAlertButtonBorderColor`) | Book page · buy box & details · /books/night-pages | changes styles only (hover, focus, hidden part) |  |
| Extras & gift card fields: background (`pdpFieldBg`) | Book page · buy box & details · /books/night-pages | changes styles only (hover, focus, hidden part) |  |
| Extras & gift card fields: text colour (`pdpFieldText`) | Book page · buy box & details · /books/night-pages | changes styles only (hover, focus, hidden part) |  |
| Extras & gift card fields: border colour (`pdpFieldBorderColor`) | Book page · buy box & details · /books/night-pages | changes styles only (hover, focus, hidden part) |  |
| Extras & gift card fields: border width (`pdpFieldBorderWidth`) | Book page · buy box & details · /books/night-pages | changes styles only (hover, focus, hidden part) |  |
| Extras & gift card fields: corners (`pdpFieldRadius`) | Book page · buy box & details · /books/night-pages | changes styles only (hover, focus, hidden part) |  |
| Extras & gift card fields: border while typing (`pdpFieldFocusColor`) | Book page · buy box & details · /books/night-pages | changes styles only (hover, focus, hidden part) |  |
| Enlarged photo viewer: button background (enlarge, close, arrows) (`pdpViewerButtonBg`) | Book page · buy box & details · /books/night-pages | changes the page |  |
| Enlarged photo viewer: button icon colour (`pdpViewerButtonIcon`) | Book page · buy box & details · /books/night-pages | changes the page |  |
| Enlarged photo viewer: button outline colour (`pdpViewerButtonBorderColor`) | Book page · buy box & details · /books/night-pages | changes the page |  |
| Enlarged photo viewer: button shape (`pdpViewerButtonShape`) | Book page · buy box & details · /books/night-pages | changes the page |  |
| Enlarged photo viewer: background behind the photo (`pdpViewerShade`) | Book page · buy box & details · /books/night-pages | changes styles only (hover, focus, hidden part) |  |
| Enlarged photo viewer: show the photo count (“2 of 5”) (`pdpViewerShowCount`) | Book page · buy box & details · /books/night-pages | no change in this test |  |
| Enlarged photo viewer: photo count colour (`pdpViewerCountColor`) | Book page · buy box & details · /books/night-pages | changes styles only (hover, focus, hidden part) |  |
| Edition picker (signed / unsigned…) (`pdpEditionPicker`) | Book page · buy box & details · /books/night-pages | no change in this test |  |
| Edition choices: show each edition's price (`pdpChipShowPrice`) | Book page · buy box & details · /books/night-pages | no change in this test |  |
| Edition buttons: text size (`pdpChipTextSize`) | Book page · buy box & details · /books/night-pages | changes styles only (hover, focus, hidden part) |  |
| Edition buttons: letter case (`pdpChipCase`) | Book page · buy box & details · /books/night-pages | changes styles only (hover, focus, hidden part) |  |
| Edition buttons: text colour (`pdpChipTextColor`) | Book page · buy box & details · /books/night-pages | changes styles only (hover, focus, hidden part) |  |
| Edition buttons: outline colour (`pdpChipBorderColor`) | Book page · buy box & details · /books/night-pages | changes styles only (hover, focus, hidden part) |  |
| Edition buttons: outline width (`pdpChipBorderWidth`) | Book page · buy box & details · /books/night-pages | changes styles only (hover, focus, hidden part) |  |
| Edition buttons: corners (`pdpChipRadius`) | Book page · buy box & details · /books/night-pages | changes styles only (hover, focus, hidden part) |  |
| Edition buttons: picked edition background (`pdpChipActiveBg`) | Book page · buy box & details · /books/night-pages | changes styles only (hover, focus, hidden part) |  |
| Edition buttons: picked edition text colour (`pdpChipActiveText`) | Book page · buy box & details · /books/night-pages | changes styles only (hover, focus, hidden part) |  |
| Edition buttons: strike through sold-out editions (`pdpChipSoldOutStrike`) | Book page · buy box & details · /books/night-pages | changes styles only (hover, focus, hidden part) |  |
| Sticky “Add to bag” bar (follows the shopper once the main button scrolls away) (`pdpStickyBar`) | Book page · buy box & details · /books/night-pages | no change in this test |  |
| “Buy it now” button under Add to bag (adds the book and opens checkout) (`pdpShowBuyNow`) | Book page · buy box & details · /books/night-pages | changes the page |  |
| Sticky bar on phones only (off = every screen size) (`pdpStickyPhoneOnly`) | Book page · buy box & details · /books/night-pages | no change in this test |  |
| Show category tag (`pdpShowTag`) | Book page · buy box & details · /books/night-pages | changes the page |  |
| Category tag style (`pdpTagStyle`) | Book page · buy box & details · /books/night-pages | changes the page |  |
| Title font (`pdpTitleFont`) | Book page · buy box & details · /books/night-pages | changes the page |  |
| Title size · desktop (0 = automatic) (`pdpTitleSize`) | Book page · buy box & details · /books/night-pages | changes the page |  |
| Title size · phone (0 = automatic, smaller than desktop) (`pdpTitleSizeMobile`) | Book page · buy box & details · /books/night-pages | changes the page |  |
| Title colour (`pdpTitleColor`) | Book page · buy box & details · /books/night-pages | changes the page |  |
| Title letter case (`pdpTitleCase`) | Book page · buy box & details · /books/night-pages | changes the page |  |
| Price font (`pdpPriceFont`) | Book page · buy box & details · /books/night-pages | changes the page |  |
| Price size · desktop (0 = automatic) (`pdpPriceSize`) | Book page · buy box & details · /books/night-pages | changes the page |  |
| Price size · phone (0 = automatic, smaller than desktop) (`pdpPriceSizeMobile`) | Book page · buy box & details · /books/night-pages | changes the page |  |
| Price colour (`pdpPriceColor`) | Book page · buy box & details · /books/night-pages | changes the page |  |
| Show stock line under the price (`pdpShowStock`) | Book page · buy box & details · /books/night-pages | changes the page |  |
| Stock line dot colour (`pdpStockColor`) | Book page · buy box & details · /books/night-pages | changes the page |  |
| Small label font (breadcrumb, caption, stock, specs) (`pdpMetaFont`) | Book page · buy box & details · /books/night-pages | changes the page |  |
| Small label size (`pdpMetaSize`) | Book page · buy box & details · /books/night-pages | changes the page |  |
| Small label colour (`pdpMetaColor`) | Book page · buy box & details · /books/night-pages | changes the page |  |
| Photo thumbnails (`pdpThumbPosition`) | Book page · buy box & details · /books/night-pages | no change in this test |  |
| Thumbnails on several rows (instead of one line you scroll sideways) — under the photo, and on phones (`pdpThumbWrap`) | Book page · buy box & details · /books/night-pages | changes styles only (hover, focus, hidden part) |  |
| Thumbnail size (`pdpThumbSize`) | Book page · buy box & details · /books/night-pages | changes styles only (hover, focus, hidden part) |  |
| Selected thumbnail border (`pdpThumbActiveColor`) | Book page · buy box & details · /books/night-pages | changes styles only (hover, focus, hidden part) |  |
| Photo frame & caption border colour (`pdpPhotoBorderColor`) | Book page · buy box & details · /books/night-pages | changes the page |  |
| Photo frame border width (0 = none) (`pdpPhotoBorderWidth`) | Book page · buy box & details · /books/night-pages | changes the page |  |
| Show caption bar under the photo (`pdpShowCaption`) | Book page · buy box & details · /books/night-pages | changes the page |  |
| Dots under the photo (one per photo, like a social media carousel) (`pdpPhotoDots`) | Book page · buy box & details · /books/night-pages | no change in this test |  |
| Details tabs position (`pdpDetailsPlacement`) | Book page · buy box & details · /books/night-pages | changes the page |  |
| Details (specs) style (`pdpSpecsStyle`) | Book page · buy box & details · /books/night-pages | no change in this test |  |
| Selected tab background (`pdpTabActiveBg`) | Book page · buy box & details · /books/night-pages | changes styles only (hover, focus, hidden part) |  |
| Selected tab text (`pdpTabActiveText`) | Book page · buy box & details · /books/night-pages | changes styles only (hover, focus, hidden part) |  |
| Tab panel border colour (`pdpPanelBorderColor`) | Book page · buy box & details · /books/night-pages | changes the page |  |
| Description text width (0 = fill the box) (`pdpPanelTextWidth`) | Book page · buy box & details · /books/night-pages | changes styles only (hover, focus, hidden part) |  |
| Description font (`pdpDescFont`) | Book page · buy box & details · /books/night-pages | changes the page |  |
| Description text size (0 = default) (`pdpDescSize`) | Book page · buy box & details · /books/night-pages | changes the page |  |
| Description text size on phones (0 = same as desktop) (`pdpDescSizeMobile`) | Book page · buy box & details · /books/night-pages | changes the page |  |
| Description line spacing (0 = default) (`pdpDescLineHeight`) | Book page · buy box & details · /books/night-pages | changes the page |  |
| Description text colour (`pdpDescColor`) | Book page · buy box & details · /books/night-pages | changes styles only (hover, focus, hidden part) |  |
| Description alignment (`pdpDescAlign`) | Book page · buy box & details · /books/night-pages | changes styles only (hover, focus, hidden part) |  |
| Description link colour (`pdpDescLinkColor`) | Book page · buy box & details · /books/night-pages | changes styles only (hover, focus, hidden part) |  |
| Underline description links (`pdpDescLinkUnderline`) | Book page · buy box & details · /books/night-pages | changes styles only (hover, focus, hidden part) |  |
| Description heading font (`pdpDescHeadingFont`) | Book page · buy box & details · /books/night-pages | changes the page |  |
| Description heading size (0 = default) (`pdpDescHeadingSize`) | Book page · buy box & details · /books/night-pages | changes styles only (hover, focus, hidden part) |  |
| Description heading colour (`pdpDescHeadingColor`) | Book page · buy box & details · /books/night-pages | changes styles only (hover, focus, hidden part) |  |
| Description quote bar colour (`pdpDescQuoteColor`) | Book page · buy box & details · /books/night-pages | changes styles only (hover, focus, hidden part) |  |
| Space around headings, lists & quotes (`pdpDescBlockGap`) | Book page · buy box & details · /books/night-pages | changes styles only (hover, focus, hidden part) |  |
| Sale badge (`showSaleBadge`) | Badges & shop labels · /books/night-pages | no change in this test |  |
| Sale badge text (`saleBadgeLabel`) | Badges & shop labels · /books/night-pages | no change in this test |  |
| Show the saving on the sale badge (e.g. “Sale −20%”) (`showSalePercent`) | Badges & shop labels · /books/night-pages | no change in this test |  |
| New badge (`showNewBadge`) | Badges & shop labels · /books/night-pages | no change in this test |  |
| New badge text (`newBadgeLabel`) | Badges & shop labels · /books/night-pages | no change in this test |  |
| “New” for how many days (`newBadgeDays`) | Badges & shop labels · /books/night-pages | no change in this test |  |
| Pre-order badge (words: Text & labels › Product page) (`showPreorderBadge`) | Badges & shop labels · /books/night-pages | no change in this test |  |
| Coming soon badge (words: Text & labels › Product page) (`showComingSoonBadge`) | Badges & shop labels · /books/night-pages | no change in this test |  |
| Sold-out text (`soldOutLabel`) | Badges & shop labels · /books/night-pages | no change in this test | yes |
| Cart label (`cartLabel`) | Badges & shop labels · /books/night-pages | changes the page |  |
| Page animations (`enableAnimations`) | Animations & hover effects · / | no change in this test |  |
| Space above and below shop sections (`density`) | Animations & hover effects · / | changes styles only (hover, focus, hidden part) |  |
| Spacing inside cards and grids (`spacingScale`) | Animations & hover effects · / | changes styles only (hover, focus, hidden part) |  |
| Card shadow depth (`shadowScale`) | Animations & hover effects · / | changes styles only (hover, focus, hidden part) |  |
| Text on success colour (`successTextColor`) | Animations & hover effects · / | changes styles only (hover, focus, hidden part) |  |
| Checkout accent (`checkoutAccentColor`) | Checkout page · /checkout | changes the page |  |
| Checkout background (`checkoutBgColor`) | Checkout page · /checkout | changes the page |  |
| Order note / gift message box at checkout (`showOrderNote`) | Checkout page · /checkout | changes the page |  |
| Hide eligible express wallets (`hideCheckoutExpressWallets`) | Checkout page · /checkout | changes the page |  |
| Hide total beside payment (`hideCheckoutPaymentTotal`) | Checkout page · /checkout | changes the page |  |
| Hide optional apartment or unit field (`hideCheckoutAddressUnit`) | Checkout page · /checkout | changes the page |  |
| Card payment form background (`stripeFormBg`) | Checkout page · /checkout | changes the page |  |
| Card payment form padding (`stripeFormPadding`) | Checkout page · /checkout | changes the page |  |
| Checkout field corner radius (`checkoutInputRadius`) | Checkout page · /checkout | changes the page | yes |
| Checkout heading font (Contact, Delivery…) (`checkoutHeadingFont`) | Checkout page · /checkout | changes the page |  |
| Checkout text font (`checkoutFont`) | Checkout page · /checkout | changes the page |  |
| Checkout form field font (incl. card form) (`checkoutFieldFont`) | Checkout page · /checkout | changes the page |  |
| Checkout field background (`checkoutFieldBg`) | Checkout page · /checkout | changes the page |  |
| Checkout field text (`checkoutFieldText`) | Checkout page · /checkout | changes the page |  |
| Checkout field border (`checkoutFieldBorder`) | Checkout page · /checkout | changes styles only (hover, focus, hidden part) | yes |
| Turn off address suggestions while typing (`hideAddressSuggestions`) | Checkout page · /checkout | changes the page |  |
| Countries shown first in the country list (2-letter codes, e.g. CA, US, GB, FR) (`checkoutPinnedCountries`) | Checkout page · /checkout | no change in this test |  |
| Hide flags in the country list (`hideCountryFlags`) | Checkout page · /checkout | changes the page structure |  |
| Open the order summary by default on phones (`checkoutSummaryOpenOnPhones`) | Checkout page · /checkout | changes the page |  |
| Hide the order total on the Pay button (`hidePayButtonTotal`) | Checkout page · /checkout | changes the page |  |
| Always show the discount code box (instead of a link) (`alwaysShowDiscountBox`) | Checkout page · /checkout | changes the page |  |
| Gift card box at checkout (`showCheckoutGiftCardBox`) | Checkout page · /checkout | changes the page |  |
| Tell shoppers when an automatic offer beats their code (`showCheckoutAutoDiscountHint`) | Checkout page · /checkout | no change in this test |  |
| Hide “add more for free shipping” in the order summary (`hideCheckoutFreeShipNudge`) | Checkout page · /checkout | no change in this test |  |
| Hide “only N left” in the order summary (`hideCheckoutLowStock`) | Checkout page · /checkout | no change in this test |  |
| Hide the policy links under the Pay button (`hideCheckoutPolicyLinks`) | Checkout page · /checkout | changes the page |  |
| Slides in from (`cartDrawerSide`) | Cart drawer (shopping bag) · / | changes the page |  |
| Bag width (`cartDrawerWidth`) | Cart drawer (shopping bag) · / | changes the page |  |
| Inner side spacing (`cartDrawerPadding`) | Cart drawer (shopping bag) · / | changes the page |  |
| Bag background (`cartDrawerBg`) | Cart drawer (shopping bag) · / | changes the page |  |
| Bag text (`cartDrawerText`) | Cart drawer (shopping bag) · / | changes the page |  |
| Bag small / muted text (`cartDrawerMuted`) | Cart drawer (shopping bag) · / | changes the page |  |
| Bag raised surface (photos, upsell card) (`cartDrawerSurface`) | Cart drawer (shopping bag) · / | changes styles only (hover, focus, hidden part) |  |
| Bag dividers between rows (`cartDrawerBorder`) | Cart drawer (shopping bag) · / | changes styles only (hover, focus, hidden part) |  |
| Outline colour (bag edge, buttons, photos) (`cartDrawerEdgeColor`) | Cart drawer (shopping bag) · / | changes the page |  |
| Outline width (`cartDrawerEdgeWidth`) | Cart drawer (shopping bag) · / | changes the page |  |
| Offset shadow colour (`cartDrawerShadowColor`) | Cart drawer (shopping bag) · / | changes the page |  |
| Bag edge shadow distance (`cartDrawerShadowOffset`) | Cart drawer (shopping bag) · / | changes the page |  |
| Page dimming behind the bag (`cartDrawerBackdropColor`) | Cart drawer (shopping bag) · / | changes the page |  |
| Blur the page behind the bag (`cartDrawerBackdropBlur`) | Cart drawer (shopping bag) · / | changes the page structure |  |
| Heading & book title font (`cartDrawerTitleFont`) | Cart drawer (shopping bag) · / | changes the page |  |
| Heading size (`cartDrawerTitleSize`) | Cart drawer (shopping bag) · / | changes the page |  |
| Heading & book title case (`cartDrawerTitleCase`) | Cart drawer (shopping bag) · / | changes the page |  |
| Small labels font (`cartDrawerMetaFont`) | Cart drawer (shopping bag) · / | changes the page |  |
| Small labels size (`cartDrawerMetaSize`) | Cart drawer (shopping bag) · / | changes the page |  |
| Show item count under the heading (`cartDrawerShowCount`) | Cart drawer (shopping bag) · / | no change in this test |  |
| Free-shipping progress bar (amount comes from Settings › Shipping) (`showFreeShipBar`) | Cart drawer (shopping bag) · / | no change in this test |  |
| Progress bar fill (`cartDrawerProgressColor`) | Cart drawer (shopping bag) · / | changes styles only (hover, focus, hidden part) |  |
| Progress bar track (`cartDrawerProgressTrack`) | Cart drawer (shopping bag) · / | changes styles only (hover, focus, hidden part) |  |
| Progress bar height (`cartDrawerProgressHeight`) | Cart drawer (shopping bag) · / | changes styles only (hover, focus, hidden part) |  |
| Number each line (01, 02 …) (`cartDrawerShowItemNumbers`) | Cart drawer (shopping bag) · / | no change in this test |  |
| Book photo width (`cartDrawerThumbWidth`) | Cart drawer (shopping bag) · / | changes styles only (hover, focus, hidden part) |  |
| Outline book photos (`cartDrawerThumbOutline`) | Cart drawer (shopping bag) · / | changes styles only (hover, focus, hidden part) |  |
| Black & white book photos (`cartDrawerGrayscaleThumbs`) | Cart drawer (shopping bag) · / | no change in this test |  |
| Book title size (`cartDrawerItemTitleSize`) | Cart drawer (shopping bag) · / | changes styles only (hover, focus, hidden part) |  |
| Show price per copy (`cartDrawerShowUnitPrice`) | Cart drawer (shopping bag) · / | no change in this test |  |
| Show line total (price × quantity) (`cartDrawerShowLineTotal`) | Cart drawer (shopping bag) · / | no change in this test |  |
| Pre-order note under pre-ordered books (`cartDrawerShowPreorder`) | Cart drawer (shopping bag) · / | no change in this test |  |
| Extras, gift-card recipient & box-set contents under each book (`cartDrawerShowLineOptions`) | Cart drawer (shopping bag) · / | no change in this test |  |
| Quantity buttons (`cartDrawerQtyStyle`) | Cart drawer (shopping bag) · / | no change in this test |  |
| Remove button (`cartDrawerRemoveStyle`) | Cart drawer (shopping bag) · / | no change in this test |  |
| “Complete your collection” suggestion (`cartDrawerShowUpsell`) | Cart drawer (shopping bag) · / | no change in this test |  |
| Offset shadow on the suggestion card (`cartDrawerUpsellShadow`) | Cart drawer (shopping bag) · / | changes styles only (hover, focus, hidden part) |  |
| Show Subtotal & Shipping rows (`cartDrawerShowSummary`) | Cart drawer (shopping bag) · / | no change in this test |  |
| Total price size (`cartDrawerTotalSize`) | Cart drawer (shopping bag) · / | changes styles only (hover, focus, hidden part) |  |
| Secure / Tracked / Returns badges (`showCartTrustBadges`) | Cart drawer (shopping bag) · / | no change in this test |  |
| Badge 1 (Secure) in the bag (`cartDrawerShowSecureBadge`) | Cart drawer (shopping bag) · / | no change in this test |  |
| Badge 2 (Tracked) in the bag (`cartDrawerShowTrackedBadge`) | Cart drawer (shopping bag) · / | no change in this test |  |
| Badge 3 (Returns) in the bag (`cartDrawerShowReturnsBadge`) | Cart drawer (shopping bag) · / | no change in this test |  |
| Checkout button background (`cartDrawerCheckoutBg`) | Cart drawer (shopping bag) · / | changes the page |  |
| Checkout button text (`cartDrawerCheckoutText`) | Cart drawer (shopping bag) · / | changes the page |  |
| Checkout button height (`cartDrawerCheckoutHeight`) | Cart drawer (shopping bag) · / | changes the page |  |
| Offset shadow on the checkout button (`cartDrawerCheckoutShadow`) | Cart drawer (shopping bag) · / | changes the page |  |
| Arrow on the checkout button (`cartDrawerShowCheckoutArrow`) | Cart drawer (shopping bag) · / | no change in this test |  |
| Shipping cost preview in cart (`cartDrawerShowShippingPreview`) | Cart drawer (shopping bag) · / | no change in this test |  |
| Delivery note under the button (`cartDrawerShowDeliveryNote`) | Cart drawer (shopping bag) · / | no change in this test |  |
| Bag icon when the bag is empty (`cartDrawerShowEmptyIcon`) | Cart drawer (shopping bag) · / | changes the page |  |
| “Continue shopping” button when the bag is empty (`cartDrawerShowEmptyButton`) | Cart drawer (shopping bag) · / | changes the page |  |
| “Continue shopping” goes to (blank = Home) (`cartDrawerEmptyLink`) | Cart drawer (shopping bag) · / | no change in this test |  |
| Print style (`themeStyle`) | Printed-paper look (Riso) · / | changes the page |  |
| Outline color (`risoOutlineColor`) | Printed-paper look (Riso) · / | changes styles only (hover, focus, hidden part) |  |
| Outline width (`risoOutlineWidth`) | Printed-paper look (Riso) · / | changes styles only (hover, focus, hidden part) |  |
| Offset shadow color (`risoShadowColor`) | Printed-paper look (Riso) · / | changes styles only (hover, focus, hidden part) |  |
| Offset shadow distance (`risoShadowOffset`) | Printed-paper look (Riso) · / | changes styles only (hover, focus, hidden part) |  |
| Card corner radius (`risoCardRadius`) | Printed-paper look (Riso) · / | changes styles only (hover, focus, hidden part) |  |
| Keyboard focus ring (`focusRingColor`) | Printed-paper look (Riso) · / | changes styles only (hover, focus, hidden part) |  |
| UPPERCASE headings (`risoUppercaseHeadings`) | Printed-paper look (Riso) · / | changes styles only (hover, focus, hidden part) | yes |
| Halftone texture (`risoGrain`) | Printed-paper look (Riso) · / | changes the page |  |
| “Recently viewed” row (product page) (`showRecentlyViewed`) | Show or hide whole features · / | changes the page |  |
| Breadcrumbs (collection pages) (`showBreadcrumbs`) | Show or hide whole features · / | no change in this test |  |
| Cookie banner (keep on where law requires it) (`showCookieBanner`) | Show or hide whole features · / | no change in this test |  |
| Under construction wall (hides the whole shop from visitors) (`showUnderConstruction`) | Show or hide whole features · / | changes the page |  |
| “Admin” button on the under construction wall (`showUnderConstructionAdmin`) | Show or hide whole features · / | no change in this test |  |
| Custom CSS (`customCss`) | Custom code (advanced) · / | changes the page |  |
| Extra <head> HTML (`customHeadHtml`) | Custom code (advanced) · / | no change in this test |  |
| Footer scripts (`customFooterScripts`) | Custom code (advanced) · / | no change in this test |  |


## Every section field checked

| Section field | Section | Result in the test | Fixed here |
|---|---|---|---|
| Colour scheme (`colorSchemeId`) | ImageWithTextSection · desktop | no change in this test |  |
| Heading font (`headingFontOverride`) | ImageWithTextSection · desktop | changes the page |  |
| Body font (`bodyFontOverride`) | ImageWithTextSection · desktop | changes the page |  |
| Solid colour (`bgColor`) | ImageWithTextSection · desktop | changes the page |  |
| Gradient from (`bgGradientFrom`) | ImageWithTextSection · desktop | changes the page |  |
| Gradient to (`bgGradientTo`) | ImageWithTextSection · desktop | changes the page |  |
| Gradient direction (`bgGradientDir`) | ImageWithTextSection · desktop | no change in this test |  |
| Background image (`bgImageUrl`) | ImageWithTextSection · desktop | changes the page |  |
| Image size (`bgImageSize`) | ImageWithTextSection · desktop | no change in this test |  |
| Image position (`bgImagePosition`) | ImageWithTextSection · desktop | no change in this test |  |
| Heading colour (`headingColor`) | ImageWithTextSection · desktop | changes the page | yes |
| Body text colour (`bodyColor`) | ImageWithTextSection · desktop | changes the page |  |
| Heading gradient from (`headingGradientFrom`) | ImageWithTextSection · desktop | no change in this test |  |
| Heading gradient to (`headingGradientTo`) | ImageWithTextSection · desktop | no change in this test |  |
| Heading size (`headingSize`) | ImageWithTextSection · desktop | changes the page | yes |
| Heading weight (`headingWeight`) | ImageWithTextSection · desktop | changes the page | yes |
| Letter case (`textTransform`) | ImageWithTextSection · desktop | changes the page | yes |
| Letter spacing (`letterSpacingOverride`) | ImageWithTextSection · desktop | changes the page | yes |
| Line height (`lineHeightOverride`) | ImageWithTextSection · desktop | changes the page |  |
| Box fill (`boxColor`) | ImageWithTextSection · desktop | changes the page |  |
| Raised box fill (`raisedBoxColor`) | ImageWithTextSection · desktop | no change in this test |  |
| Line / border colour (`lineColor`) | ImageWithTextSection · desktop | changes the page |  |
| Button background (`btnBg`) | ImageWithTextSection · desktop | changes the page |  |
| Button text (`btnText`) | ImageWithTextSection · desktop | changes the page |  |
| Button style (`btnStyle`) | ImageWithTextSection · desktop | changes the page |  |
| Button corners (`btnRadius`) | ImageWithTextSection · desktop | no change in this test | yes |
| Uppercase button text (`btnUppercase`) | ImageWithTextSection · desktop | no change in this test |  |
| Magnetic effect (`btnMagnetic`) | ImageWithTextSection · desktop | no change in this test |  |
| Shadow (`boxShadow`) | ImageWithTextSection · desktop | changes the page |  |
| Corner radius (`cornerRadius`) | ImageWithTextSection · desktop | changes the page |  |
| Backdrop blur (`backdropBlur`) | ImageWithTextSection · desktop | no change in this test |  |
| Hover effect (`hoverEffect`) | ImageWithTextSection · desktop | changes the page |  |
| Section entrance (`animation`) | ImageWithTextSection · desktop | no change in this test |  |
| Blocks appear as you scroll (`revealBlocks`) | ImageWithTextSection · desktop | no change in this test |  |
| Delay between blocks (`staggerStep`) | ImageWithTextSection · desktop | no change in this test |  |
| How long it takes (`motionDuration`) | ImageWithTextSection · desktop | no change in this test |  |
| Wait before starting (`motionDelay`) | ImageWithTextSection · desktop | no change in this test |  |
| Blocks and cards when pointed at (`blockHover`) | ImageWithTextSection · desktop | no change in this test |  |
| Background picture drifts while scrolling (parallax) (`parallax`) | ImageWithTextSection · desktop | no change in this test |  |
| Stay on screen while scrolling (sticky) (`sticky`) | ImageWithTextSection · desktop | no change in this test |  |
| Sticky distance from the top (`stickyTop`) | ImageWithTextSection · desktop | no change in this test |  |
| Turn motion off on phones (`motionOffOnPhones`) | ImageWithTextSection · desktop | no change in this test |  |
| Shape divider · top (`shapeDividerTop`) | ImageWithTextSection · desktop | changes the page |  |
| Top divider colour (`shapeDividerTopColor`) | ImageWithTextSection · desktop | no change in this test |  |
| Shape divider · bottom (`shapeDividerBottom`) | ImageWithTextSection · desktop | changes the page |  |
| Bottom divider colour (`shapeDividerBottomColor`) | ImageWithTextSection · desktop | no change in this test |  |
| Scoped CSS (`customCss`) | ImageWithTextSection · desktop | changes the page |  |
| Content width (`containerWidth`) | ImageWithTextSection · desktop | changes the page |  |
| Space above and below (from Design scales) (`spacingStep`) | ImageWithTextSection · desktop | changes the page |  |
| Full width (edge to edge) (`fullWidth`) | ImageWithTextSection · desktop | changes the page structure |  |
| Hide on tablets and desktops (`hideOnDesktop`) | ImageWithTextSection · desktop | changes the page |  |
| Hide when a connected detail is empty (`hideWhenEmpty`) | ImageWithTextSection · desktop | no change in this test |  |
| Colour scheme (`colorSchemeId`) | RichTextSection · desktop | no change in this test |  |
| Heading font (`headingFontOverride`) | RichTextSection · desktop | changes the page |  |
| Body font (`bodyFontOverride`) | RichTextSection · desktop | changes the page |  |
| Solid colour (`bgColor`) | RichTextSection · desktop | changes the page |  |
| Gradient from (`bgGradientFrom`) | RichTextSection · desktop | changes the page |  |
| Gradient to (`bgGradientTo`) | RichTextSection · desktop | changes the page |  |
| Gradient direction (`bgGradientDir`) | RichTextSection · desktop | no change in this test |  |
| Background image (`bgImageUrl`) | RichTextSection · desktop | changes the page |  |
| Image size (`bgImageSize`) | RichTextSection · desktop | no change in this test |  |
| Image position (`bgImagePosition`) | RichTextSection · desktop | no change in this test |  |
| Heading colour (`headingColor`) | RichTextSection · desktop | no change in this test | yes |
| Body text colour (`bodyColor`) | RichTextSection · desktop | changes the page |  |
| Heading gradient from (`headingGradientFrom`) | RichTextSection · desktop | no change in this test |  |
| Heading gradient to (`headingGradientTo`) | RichTextSection · desktop | no change in this test |  |
| Heading size (`headingSize`) | RichTextSection · desktop | no change in this test | yes |
| Heading weight (`headingWeight`) | RichTextSection · desktop | no change in this test | yes |
| Letter case (`textTransform`) | RichTextSection · desktop | no change in this test | yes |
| Letter spacing (`letterSpacingOverride`) | RichTextSection · desktop | no change in this test | yes |
| Line height (`lineHeightOverride`) | RichTextSection · desktop | changes the page |  |
| Box fill (`boxColor`) | RichTextSection · desktop | no change in this test |  |
| Raised box fill (`raisedBoxColor`) | RichTextSection · desktop | no change in this test |  |
| Line / border colour (`lineColor`) | RichTextSection · desktop | no change in this test |  |
| Button background (`btnBg`) | RichTextSection · desktop | no change in this test |  |
| Button text (`btnText`) | RichTextSection · desktop | no change in this test |  |
| Button style (`btnStyle`) | RichTextSection · desktop | no change in this test |  |
| Button corners (`btnRadius`) | RichTextSection · desktop | no change in this test | yes |
| Uppercase button text (`btnUppercase`) | RichTextSection · desktop | no change in this test |  |
| Magnetic effect (`btnMagnetic`) | RichTextSection · desktop | no change in this test |  |
| Shadow (`boxShadow`) | RichTextSection · desktop | changes the page |  |
| Corner radius (`cornerRadius`) | RichTextSection · desktop | changes the page |  |
| Backdrop blur (`backdropBlur`) | RichTextSection · desktop | no change in this test |  |
| Hover effect (`hoverEffect`) | RichTextSection · desktop | changes the page |  |
| Section entrance (`animation`) | RichTextSection · desktop | no change in this test |  |
| Blocks appear as you scroll (`revealBlocks`) | RichTextSection · desktop | no change in this test |  |
| Delay between blocks (`staggerStep`) | RichTextSection · desktop | no change in this test |  |
| How long it takes (`motionDuration`) | RichTextSection · desktop | no change in this test |  |
| Wait before starting (`motionDelay`) | RichTextSection · desktop | no change in this test |  |
| Blocks and cards when pointed at (`blockHover`) | RichTextSection · desktop | no change in this test |  |
| Background picture drifts while scrolling (parallax) (`parallax`) | RichTextSection · desktop | no change in this test |  |
| Stay on screen while scrolling (sticky) (`sticky`) | RichTextSection · desktop | no change in this test |  |
| Sticky distance from the top (`stickyTop`) | RichTextSection · desktop | no change in this test |  |
| Turn motion off on phones (`motionOffOnPhones`) | RichTextSection · desktop | no change in this test |  |
| Shape divider · top (`shapeDividerTop`) | RichTextSection · desktop | changes the page |  |
| Top divider colour (`shapeDividerTopColor`) | RichTextSection · desktop | no change in this test |  |
| Shape divider · bottom (`shapeDividerBottom`) | RichTextSection · desktop | changes the page |  |
| Bottom divider colour (`shapeDividerBottomColor`) | RichTextSection · desktop | no change in this test |  |
| Scoped CSS (`customCss`) | RichTextSection · desktop | changes the page |  |
| Content width (`containerWidth`) | RichTextSection · desktop | changes the page |  |
| Space above and below (from Design scales) (`spacingStep`) | RichTextSection · desktop | changes the page |  |
| Full width (edge to edge) (`fullWidth`) | RichTextSection · desktop | changes the page structure |  |
| Hide on tablets and desktops (`hideOnDesktop`) | RichTextSection · desktop | changes the page |  |
| Hide when a connected detail is empty (`hideWhenEmpty`) | RichTextSection · desktop | no change in this test |  |
| Colour scheme (`colorSchemeId`) | FeatureGridSection · desktop | no change in this test |  |
| Heading font (`headingFontOverride`) | FeatureGridSection · desktop | changes the page |  |
| Body font (`bodyFontOverride`) | FeatureGridSection · desktop | changes the page |  |
| Solid colour (`bgColor`) | FeatureGridSection · desktop | changes the page |  |
| Gradient from (`bgGradientFrom`) | FeatureGridSection · desktop | changes the page |  |
| Gradient to (`bgGradientTo`) | FeatureGridSection · desktop | changes the page |  |
| Gradient direction (`bgGradientDir`) | FeatureGridSection · desktop | no change in this test |  |
| Background image (`bgImageUrl`) | FeatureGridSection · desktop | changes the page |  |
| Image size (`bgImageSize`) | FeatureGridSection · desktop | no change in this test |  |
| Image position (`bgImagePosition`) | FeatureGridSection · desktop | no change in this test |  |
| Heading colour (`headingColor`) | FeatureGridSection · desktop | changes the page | yes |
| Body text colour (`bodyColor`) | FeatureGridSection · desktop | changes the page |  |
| Heading gradient from (`headingGradientFrom`) | FeatureGridSection · desktop | no change in this test |  |
| Heading gradient to (`headingGradientTo`) | FeatureGridSection · desktop | no change in this test |  |
| Heading size (`headingSize`) | FeatureGridSection · desktop | changes the page | yes |
| Heading weight (`headingWeight`) | FeatureGridSection · desktop | changes the page | yes |
| Letter case (`textTransform`) | FeatureGridSection · desktop | changes the page | yes |
| Letter spacing (`letterSpacingOverride`) | FeatureGridSection · desktop | changes the page | yes |
| Line height (`lineHeightOverride`) | FeatureGridSection · desktop | changes the page |  |
| Box fill (`boxColor`) | FeatureGridSection · desktop | changes the page |  |
| Raised box fill (`raisedBoxColor`) | FeatureGridSection · desktop | no change in this test |  |
| Line / border colour (`lineColor`) | FeatureGridSection · desktop | changes the page |  |
| Button background (`btnBg`) | FeatureGridSection · desktop | no change in this test |  |
| Button text (`btnText`) | FeatureGridSection · desktop | no change in this test |  |
| Button style (`btnStyle`) | FeatureGridSection · desktop | no change in this test |  |
| Button corners (`btnRadius`) | FeatureGridSection · desktop | no change in this test | yes |
| Uppercase button text (`btnUppercase`) | FeatureGridSection · desktop | no change in this test |  |
| Magnetic effect (`btnMagnetic`) | FeatureGridSection · desktop | no change in this test |  |
| Shadow (`boxShadow`) | FeatureGridSection · desktop | changes the page |  |
| Corner radius (`cornerRadius`) | FeatureGridSection · desktop | changes the page |  |
| Backdrop blur (`backdropBlur`) | FeatureGridSection · desktop | no change in this test |  |
| Hover effect (`hoverEffect`) | FeatureGridSection · desktop | changes the page |  |
| Section entrance (`animation`) | FeatureGridSection · desktop | no change in this test |  |
| Blocks appear as you scroll (`revealBlocks`) | FeatureGridSection · desktop | no change in this test |  |
| Delay between blocks (`staggerStep`) | FeatureGridSection · desktop | no change in this test |  |
| How long it takes (`motionDuration`) | FeatureGridSection · desktop | no change in this test |  |
| Wait before starting (`motionDelay`) | FeatureGridSection · desktop | no change in this test |  |
| Blocks and cards when pointed at (`blockHover`) | FeatureGridSection · desktop | no change in this test |  |
| Background picture drifts while scrolling (parallax) (`parallax`) | FeatureGridSection · desktop | no change in this test |  |
| Stay on screen while scrolling (sticky) (`sticky`) | FeatureGridSection · desktop | no change in this test |  |
| Sticky distance from the top (`stickyTop`) | FeatureGridSection · desktop | no change in this test |  |
| Turn motion off on phones (`motionOffOnPhones`) | FeatureGridSection · desktop | no change in this test |  |
| Shape divider · top (`shapeDividerTop`) | FeatureGridSection · desktop | changes the page |  |
| Top divider colour (`shapeDividerTopColor`) | FeatureGridSection · desktop | no change in this test |  |
| Shape divider · bottom (`shapeDividerBottom`) | FeatureGridSection · desktop | changes the page |  |
| Bottom divider colour (`shapeDividerBottomColor`) | FeatureGridSection · desktop | no change in this test |  |
| Scoped CSS (`customCss`) | FeatureGridSection · desktop | changes the page |  |
| Content width (`containerWidth`) | FeatureGridSection · desktop | changes the page |  |
| Space above and below (from Design scales) (`spacingStep`) | FeatureGridSection · desktop | changes the page |  |
| Full width (edge to edge) (`fullWidth`) | FeatureGridSection · desktop | changes the page structure |  |
| Hide on tablets and desktops (`hideOnDesktop`) | FeatureGridSection · desktop | changes the page |  |
| Hide when a connected detail is empty (`hideWhenEmpty`) | FeatureGridSection · desktop | no change in this test |  |
| Colour scheme (`colorSchemeId`) | NewsletterSection · desktop | no change in this test |  |
| Heading font (`headingFontOverride`) | NewsletterSection · desktop | changes the page |  |
| Body font (`bodyFontOverride`) | NewsletterSection · desktop | changes the page |  |
| Solid colour (`bgColor`) | NewsletterSection · desktop | changes the page |  |
| Gradient from (`bgGradientFrom`) | NewsletterSection · desktop | changes the page |  |
| Gradient to (`bgGradientTo`) | NewsletterSection · desktop | changes the page |  |
| Gradient direction (`bgGradientDir`) | NewsletterSection · desktop | no change in this test |  |
| Background image (`bgImageUrl`) | NewsletterSection · desktop | changes the page |  |
| Image size (`bgImageSize`) | NewsletterSection · desktop | no change in this test |  |
| Image position (`bgImagePosition`) | NewsletterSection · desktop | no change in this test |  |
| Heading colour (`headingColor`) | NewsletterSection · desktop | changes the page | yes |
| Body text colour (`bodyColor`) | NewsletterSection · desktop | changes the page |  |
| Heading gradient from (`headingGradientFrom`) | NewsletterSection · desktop | no change in this test |  |
| Heading gradient to (`headingGradientTo`) | NewsletterSection · desktop | no change in this test |  |
| Heading size (`headingSize`) | NewsletterSection · desktop | changes the page | yes |
| Heading weight (`headingWeight`) | NewsletterSection · desktop | changes the page | yes |
| Letter case (`textTransform`) | NewsletterSection · desktop | changes the page | yes |
| Letter spacing (`letterSpacingOverride`) | NewsletterSection · desktop | changes the page | yes |
| Line height (`lineHeightOverride`) | NewsletterSection · desktop | changes the page |  |
| Box fill (`boxColor`) | NewsletterSection · desktop | changes the page |  |
| Raised box fill (`raisedBoxColor`) | NewsletterSection · desktop | no change in this test |  |
| Line / border colour (`lineColor`) | NewsletterSection · desktop | changes the page |  |
| Button background (`btnBg`) | NewsletterSection · desktop | changes the page |  |
| Button text (`btnText`) | NewsletterSection · desktop | changes the page |  |
| Button style (`btnStyle`) | NewsletterSection · desktop | changes the page |  |
| Button corners (`btnRadius`) | NewsletterSection · desktop | no change in this test | yes |
| Uppercase button text (`btnUppercase`) | NewsletterSection · desktop | changes the page |  |
| Magnetic effect (`btnMagnetic`) | NewsletterSection · desktop | no change in this test |  |
| Shadow (`boxShadow`) | NewsletterSection · desktop | changes the page |  |
| Corner radius (`cornerRadius`) | NewsletterSection · desktop | changes the page |  |
| Backdrop blur (`backdropBlur`) | NewsletterSection · desktop | no change in this test |  |
| Hover effect (`hoverEffect`) | NewsletterSection · desktop | changes the page |  |
| Section entrance (`animation`) | NewsletterSection · desktop | no change in this test |  |
| Blocks appear as you scroll (`revealBlocks`) | NewsletterSection · desktop | no change in this test |  |
| Delay between blocks (`staggerStep`) | NewsletterSection · desktop | no change in this test |  |
| How long it takes (`motionDuration`) | NewsletterSection · desktop | no change in this test |  |
| Wait before starting (`motionDelay`) | NewsletterSection · desktop | no change in this test |  |
| Blocks and cards when pointed at (`blockHover`) | NewsletterSection · desktop | no change in this test |  |
| Background picture drifts while scrolling (parallax) (`parallax`) | NewsletterSection · desktop | no change in this test |  |
| Stay on screen while scrolling (sticky) (`sticky`) | NewsletterSection · desktop | no change in this test |  |
| Sticky distance from the top (`stickyTop`) | NewsletterSection · desktop | no change in this test |  |
| Turn motion off on phones (`motionOffOnPhones`) | NewsletterSection · desktop | no change in this test |  |
| Shape divider · top (`shapeDividerTop`) | NewsletterSection · desktop | changes the page |  |
| Top divider colour (`shapeDividerTopColor`) | NewsletterSection · desktop | no change in this test |  |
| Shape divider · bottom (`shapeDividerBottom`) | NewsletterSection · desktop | changes the page |  |
| Bottom divider colour (`shapeDividerBottomColor`) | NewsletterSection · desktop | no change in this test |  |
| Scoped CSS (`customCss`) | NewsletterSection · desktop | changes the page |  |
| Content width (`containerWidth`) | NewsletterSection · desktop | changes the page |  |
| Space above and below (from Design scales) (`spacingStep`) | NewsletterSection · desktop | changes the page |  |
| Full width (edge to edge) (`fullWidth`) | NewsletterSection · desktop | changes the page structure |  |
| Hide on tablets and desktops (`hideOnDesktop`) | NewsletterSection · desktop | changes the page |  |
| Hide when a connected detail is empty (`hideWhenEmpty`) | NewsletterSection · desktop | no change in this test |  |
| Hide on tablets (`hideOnTablet`) | ImageWithTextSection · tablet | changes the page |  |
| Hide on tablets (`hideOnTablet`) | RichTextSection · tablet | changes the page |  |
| Hide on tablets (`hideOnTablet`) | FeatureGridSection · tablet | changes the page |  |
| Hide on tablets (`hideOnTablet`) | NewsletterSection · tablet | changes the page |  |
| Phone text scale (`mobileFontScale`) | ImageWithTextSection · mobile | changes the page |  |
| Phone heading size (`mobileHeadingSize`) | ImageWithTextSection · mobile | changes the page |  |
| Phone grid columns (`mobileColumns`) | ImageWithTextSection · mobile | changes the page |  |
| Hide on phones (`hideOnMobile`) | ImageWithTextSection · mobile | changes the page |  |
| Phone text scale (`mobileFontScale`) | RichTextSection · mobile | changes the page |  |
| Phone heading size (`mobileHeadingSize`) | RichTextSection · mobile | changes the page |  |
| Phone grid columns (`mobileColumns`) | RichTextSection · mobile | changes the page |  |
| Hide on phones (`hideOnMobile`) | RichTextSection · mobile | changes the page |  |
| Phone text scale (`mobileFontScale`) | FeatureGridSection · mobile | changes the page |  |
| Phone heading size (`mobileHeadingSize`) | FeatureGridSection · mobile | changes the page |  |
| Phone grid columns (`mobileColumns`) | FeatureGridSection · mobile | changes the page |  |
| Hide on phones (`hideOnMobile`) | FeatureGridSection · mobile | changes the page |  |
| Phone text scale (`mobileFontScale`) | NewsletterSection · mobile | changes the page |  |
| Phone heading size (`mobileHeadingSize`) | NewsletterSection · mobile | changes the page |  |
| Phone grid columns (`mobileColumns`) | NewsletterSection · mobile | changes the page |  |
| Hide on phones (`hideOnMobile`) | NewsletterSection · mobile | changes the page |  |
