# Social media approvals: what Julian submits (code plan 27.9)

Meta, Pinterest and TikTok each have to approve Colophon's app before a press can connect an account. This page has
everything ready to paste in, plus a short screen recording to make on the test shop. Your part is the sign-ins, the
forms and the recording. Each review takes days to weeks, so all three can be sent on the same day.

Things every form asks for:

| Field | What to put |
| --- | --- |
| App name | Colophon |
| Contact email | your own Gmail (the one on the privacy page) |
| Website | https://lmb-platform-prod.web.app |
| Privacy policy | https://lmb-platform-prod.web.app/terms/#privacy |
| Terms of service | https://lmb-platform-prod.web.app/terms/#terms |
| Data deletion | "A press disconnects in Sales channels, which deletes its saved access at once. A press that leaves Colophon has all its data deleted within 90 days (privacy policy, Data section)." |
| Icon | The Colophon mark, 1024 × 1024 |
| Sign-in answer addresses | `<SOCIAL_REDIRECT_BASE>/meta/oauth`, `/pinterest/oauth`, `/tiktok/oauth` (the social service's address once it is hosted) |

The app keys each network gives go into the social service's settings (names in `docs/social.md`), never anywhere else.

## Meta (Facebook & Instagram)

1. At developers.facebook.com, create a **Business** app named Colophon, attached to Lyricalmyrical Books' business
   account. Add the products **Facebook Login for Business**, **Instagram** (Instagram API with Facebook Login) and
   **Marketing API** (catalogs).
2. Complete **business verification**: company name Lyricalmyrical Books, 456 Montrose Ave, Toronto, M6G 3H1, plus a
   document showing that name and address.
3. Under app review, request each permission below, pasting its use in the box:

| Permission | How Colophon uses it |
| --- | --- |
| `pages_show_list` | Lists the Facebook Pages the shop owner manages, so they can pick which Page their posts go to. |
| `pages_read_engagement` | Reads the chosen Page's name and its linked Instagram account to show them on the Sales channels page. |
| `pages_manage_posts` | Publishes a photo post of one of the shop's products to the shop's own Page, now or at a time the owner picks. Only the owner starts a post. |
| `instagram_basic` | Reads the Instagram account linked to the Page (name and id) so the owner can choose it. |
| `instagram_content_publish` | Publishes a photo of one of the shop's products to the shop's own Instagram account, with the owner's words. |
| `business_management` | Finds the business that owns the Page, so the shop's product catalog can be made in that business. |
| `catalog_management` | Makes one product catalog for the shop and points it at the shop's product file, read daily, so posts can tag products. |

4. Upload the screen recording (below) to each permission.

## Pinterest

1. At developers.pinterest.com, connect Lyricalmyrical Books' business account and create an app named Colophon.
2. Request **Standard access**. Use this description: "Colophon runs online shops for small presses and makers. A shop
   owner connects their Pinterest account, picks a board, and pins one of their products with a link to its page.
   Owners can also send their product file to a Pinterest catalog so products show as shoppable pins. Colophon only
   acts when the owner presses a button and never reads other people's pins."
3. Scopes asked for: boards (read, write), pins (read, write), catalogs (read, write), account (read).
4. Attach the screen recording.

## TikTok

1. At developers.tiktok.com, create an app named Colophon (category: Business / shopping). Add **Login Kit** and the
   **Content Posting API** with Direct Post.
2. **Site check:** TikTok fetches each post's photo from an address it has checked. Add the shops' photo address
   (`firebasestorage.googleapis.com` is shared, so use the URL prefix check for each shop's photo folder, or the
   social service's own address if photos are passed through it later). This is the step most likely to bounce.
3. Scopes: `user.info.basic`, `video.publish`.
4. Submit the **audit** with the recording. Until it passes, posts are visible only to the posting account (the
   Social posts page says "private for now").

## Screen recording (about 2 minutes, once, used for all three)

On the test shop, with the social switch on and each network in its test mode:

1. Open the admin, then Books › Sales channels. Show the cards.
2. Press **Connect Facebook & Instagram**. Sign in, tick the Page and its Instagram account, allow. Back on Sales
   channels, show "Connected as …" and the places.
3. Press **Send my products**; show the "Products sent" line.
4. Go to Orders › Social posts › **Create post**. Pick a product, keep **Square picture** on, tick the Facebook Page
   and Instagram, choose **Now**, press **Post now**. Show the post on Facebook and on Instagram, tapping the link
   to the product page.
5. Create a second post set for later and show it under Scheduled.
6. Back on Sales channels, press **Disconnect**, confirm, and show the card back to "Not connected".

For Pinterest and TikTok, repeat steps 2, 4 and 6 with that network (Pinterest also step 3).

## After approval

Turn on `SOCIAL_ENABLED` for the social service, then run the test-shop checks on the real-accounts list
(`docs/start-real-accounts.md`, Social media channels).
