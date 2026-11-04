// Every Meta, Pinterest and TikTok address, scope and field name the social service uses, in one place (code plan 27).
// Nothing else in this folder spells a network's path; add one here, with where it was confirmed, or not at all.
//
// Where these were confirmed (4 November 2026):
//   [MI]  developers.facebook.com/docs/instagram-platform/content-publishing: POST /<IG_ID>/media (image_url, caption,
//         alt_text) then POST /<IG_ID>/media_publish (creation_id) on graph.facebook.com for Facebook Login for
//         Business; permissions instagram_basic, instagram_content_publish, pages_read_engagement; 100 posts a day.
//   [MT]  developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/product-tagging:
//         `product_tags` on the image container ([{ product_id, x, y }]), catalog products only.
//   [MF]  Meta's Graph API reference (Facebook Login dialog and code exchange, long-lived tokens through
//         `fb_exchange_token`, /me/accounts with each Page's own token, /<page>/photos, /me/businesses,
//         /<business>/owned_product_catalogs, /<catalog>/product_feeds with a `schedule`, /<catalog>/products with a
//         `retailer_id` filter, DELETE /me/permissions). Checked again in Meta's app review before SOCIAL_ENABLED.
//   [P]   developers.pinterest.com/docs/work-with-organic-content-and-users/create-boards-and-pins/: POST /v5/pins with
//         board_id, link, title, description and media_source { source_type: "image_url", url }; scopes boards:read,
//         boards:write, pins:read, pins:write. The sign-in, token (Basic client authentication, form-encoded), boards
//         list, user account and catalog feed addresses are from Pinterest's v5 reference; checked again at approval.
//   [T]   developers.tiktok.com/doc/content-posting-api-reference-photo-post: POST /v2/post/publish/content/init/ with
//         media_type PHOTO, post_mode DIRECT_POST, post_info (title ≤ 90, description ≤ 4000, privacy_level from the
//         creator info query), source_info { source: "PULL_FROM_URL", photo_images, photo_cover_index }; scope
//         video.publish; the photo's site must be verified with TikTok; unaudited apps post privately only.
//         Sign-in, token, revoke, user info and creator info addresses from TikTok's Login Kit and Content Posting
//         references; checked again in TikTok's audit.

/** Meta's Graph API version. Meta keeps each version two years; move it forward with the app's own version. [MF] */
export const META_VERSION = "v23.0";

export const META = Object.freeze({
  authorize: (version = META_VERSION) => `https://www.facebook.com/${version}/dialog/oauth`, // [MF]
  graph: (version = META_VERSION) => `https://graph.facebook.com/${version}`, // [MF] [MI]
  // Pages and their Instagram accounts, posting to both, and the catalog. [MI] [MF]
  scopes: Object.freeze([
    "pages_show_list", "pages_read_engagement", "pages_manage_posts",
    "instagram_basic", "instagram_content_publish",
    "business_management", "catalog_management",
  ]),
  /** The error code Meta gives for a token that no longer works (expired, changed password, app removed). [MF] */
  lostTokenCode: 190,
});

export const PINTEREST = Object.freeze({
  authorize: "https://www.pinterest.com/oauth/", // [P]
  token: "https://api.pinterest.com/v5/oauth/token", // [P]
  api: "https://api.pinterest.com/v5", // [P]
  scopes: Object.freeze(["user_accounts:read", "boards:read", "boards:write", "pins:read", "pins:write", "catalogs:read", "catalogs:write"]),
});

export const TIKTOK = Object.freeze({
  authorize: "https://www.tiktok.com/v2/auth/authorize/", // [T]
  token: "https://open.tiktokapis.com/v2/oauth/token/", // [T]
  revoke: "https://open.tiktokapis.com/v2/oauth/revoke/", // [T]
  api: "https://open.tiktokapis.com/v2", // [T]
  scopes: Object.freeze(["user.info.basic", "video.publish"]),
  /** Title and description limits for a photo post. [T] */
  titleMax: 90,
  descriptionMax: 4000,
});

/** The networks a press can connect, in the order the admin lists them. */
export const NETWORKS = Object.freeze(["meta", "pinterest", "tiktok"]);
/** What each network calls itself to a press. */
export const NETWORK_NAMES = Object.freeze({ meta: "Facebook & Instagram", pinterest: "Pinterest", tiktok: "TikTok" });
/** Instagram's caption limit is the shortest of the three. [MI] */
export const CAPTION_MAX = 2200;
