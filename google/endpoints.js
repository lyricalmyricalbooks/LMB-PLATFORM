// Every Google address and permission name the Google link uses (code plan 6.17 and 6.20), in one place, so nothing is
// invented elsewhere. Each one is from Google's own reference pages; check them again before the link is switched on
// (README, Switched on by Julian), because Google moves its newer services between versions.
//
//   Sign-in        developers.google.com/identity/protocols/oauth2/web-server (authorize, token, revoke)
//   Analytics      developers.google.com/analytics/devguides/config/admin/v1 (accountSummaries, properties,
//                  dataStreams; accessBindings is in v1alpha)
//   Verification   developers.google.com/site-verification/v1 (token, webResource)
//   Search Console developers.google.com/webmaster-tools/v1/api_reference_index (sites.add, sitemaps.submit)
//   Merchant       developers.google.com/merchant/api/reference (accounts, dataSources, programs, homepage)
//   Gmail          developers.google.com/gmail/api/reference/rest/v1/users.messages/send
//   Drive          developers.google.com/drive/api/reference/rest/v3/files/create (a folder)
//   YouTube        developers.google.com/youtube/v3/docs/channels/list, search/list
//   Calendar       developers.google.com/calendar/api/v3/reference/calendars/insert
//   Business       developers.google.com/my-business/reference/accountmanagement/rest/v1/accounts/list
//   Ads            developers.google.com/google-ads/api/reference/rpc (CustomerService.ListAccessibleCustomers,
//                  ProductLinkService.CreateProductLink / RemoveProductLink)

export const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
export const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

export const ANALYTICS_ADMIN = "https://analyticsadmin.googleapis.com/v1beta";
export const ANALYTICS_ADMIN_ALPHA = "https://analyticsadmin.googleapis.com/v1alpha";
export const SITE_VERIFICATION = "https://www.googleapis.com/siteVerification/v1";
export const SEARCH_CONSOLE = "https://www.googleapis.com/webmasters/v3";
export const MERCHANT = "https://merchantapi.googleapis.com";
// Merchant API v1 (code plan 15.1). Google discontinued v1beta in May 2026, so every call goes to v1.
export const MERCHANT_ACCOUNTS = `${MERCHANT}/accounts/v1`;
export const MERCHANT_DATASOURCES = `${MERCHANT}/datasources/v1`;
export const GMAIL = "https://gmail.googleapis.com/gmail/v1";
export const DRIVE = "https://www.googleapis.com/drive/v3";
export const YOUTUBE = "https://www.googleapis.com/youtube/v3";
export const CALENDAR = "https://www.googleapis.com/calendar/v3";
export const BUSINESS_ACCOUNTS = "https://mybusinessaccountmanagement.googleapis.com/v1";
// Google Ads lists v23 to v26 (checked 29 October 2026); v18 is no longer listed.
export const ADS_VERSION = "v24";
export const ADS = `https://googleads.googleapis.com/${ADS_VERSION}`;

/**
 * The versions Google has switched off, and when each address was last checked against Google's own page. A test
 * (google.test.js) fails when any file in this folder calls a retired one, so a version Google retires is noticed
 * here and not on a press's first connect. Update `checked` after reading developers.google.com/merchant/api/latest-updates
 * and developers.google.com/google-ads/api/docs/sunset-dates; the readiness check (plan 15.4) warns when it is old.
 */
export const VERSION_CHECKS = Object.freeze({
  merchant: Object.freeze({ checked: "2026-10-29", current: "v1", retired: ["v1beta"] }),
  ads: Object.freeze({ checked: "2026-10-29", current: ADS_VERSION, retired: ["v18", "v19", "v20", "v21", "v22"] }),
});

/** A Viewer on an Analytics property: enough for the shop's Overview to read the reports, nothing more. */
export const ANALYTICS_VIEWER_ROLE = "predefinedRoles/viewer";

/**
 * The permissions asked for, by part. `base` is always asked; each extra only when its tick box is ticked (and, for
 * Gmail sending and Business Profile, only once Julian switches it on). Google lets the press untick any of them on its
 * Allow page; the token answer says which were given, and a part whose permission wasn't given waits.
 */
export const SCOPES = Object.freeze({
  identity: ["openid", "email"],
  analytics: ["https://www.googleapis.com/auth/analytics.edit", "https://www.googleapis.com/auth/analytics.manage.users"],
  searchConsole: ["https://www.googleapis.com/auth/webmasters", "https://www.googleapis.com/auth/siteverification"],
  merchantCenter: ["https://www.googleapis.com/auth/content"],
  email: ["https://www.googleapis.com/auth/gmail.send"],
  drive: ["https://www.googleapis.com/auth/drive.file"],
  youtube: ["https://www.googleapis.com/auth/youtube.readonly"],
  calendar: ["https://www.googleapis.com/auth/calendar.app.created"],
  businessProfile: ["https://www.googleapis.com/auth/business.manage"],
  ads: ["https://www.googleapis.com/auth/adwords"],
});

/**
 * Which parts join Google's first review and which wait for a second one (plan 15.12). The permission document
 * (docs/google-verification.md) lists each permission under one of these, and a test keeps the two in step.
 */
export const LAUNCH_PARTS = Object.freeze(["identity", "analytics", "searchConsole", "merchantCenter", "email", "drive"]);
export const LATER_PARTS = Object.freeze(["youtube", "calendar", "businessProfile", "ads"]);

/** Permissions Google calls restricted: they need a yearly outside security assessment, so none may be asked for. */
export const RESTRICTED_SCOPES = Object.freeze([
  "https://mail.google.com/",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.metadata",
  "https://www.googleapis.com/auth/gmail.settings.basic",
  "https://www.googleapis.com/auth/gmail.settings.sharing",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/drive.metadata",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
]);
