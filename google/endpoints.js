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
//   Sheets         developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets (create, values.clear, values.update);
//                  the `drive.file` permission is enough for a sheet this app made (Google's Sheets scopes page)
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
export const GMAIL = "https://gmail.googleapis.com/gmail/v1";
export const DRIVE = "https://www.googleapis.com/drive/v3";
export const YOUTUBE = "https://www.googleapis.com/youtube/v3";
export const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets";
export const CALENDAR = "https://www.googleapis.com/calendar/v3";
export const BUSINESS_ACCOUNTS = "https://mybusinessaccountmanagement.googleapis.com/v1";
export const ADS = "https://googleads.googleapis.com/v18";

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
