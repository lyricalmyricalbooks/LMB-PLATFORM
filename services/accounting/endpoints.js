// Every QuickBooks Online address, scope and field name the bookkeeping service uses, in one place (code plan 7.15).
// Nothing else in this folder spells a QuickBooks path; add one here, with where it was confirmed, or not at all.
//
// Where these were confirmed (28 October 2026). developer.intuit.com's pages load only in a browser and could not be
// read from here (docs/accounting.md, "Not confirmed"), so each value below was read in Intuit's own published code:
//
//   [O]  Intuit's OAuth client for Node, github.com/intuit/oauth-jsclient, src/OAuthClient.js and src/access-token/Token.js:
//        the sign-in, token and revoke addresses, the accounting scope, the API hosts (production and sandbox), Basic
//        client authentication, form-encoded token requests, the `realmId` on the sign-in answer, the token fields
//        (`expires_in`, `x_refresh_token_expires_in`, `x_refresh_token_hard_expires_in`, the last only when the
//        `x-include-refresh-token-hard-expires-in: true` header is sent), `invalid_grant`, and the `Fault` error shape.
//   [J]  Intuit's QuickBooks V3 Java SDK, github.com/intuit/QuickBooks-V3-Java-SDK (develop):
//        ipp-v3-java-devkit .../interceptors/PrepareRequestInterceptor.java: `<host>/v3/company/<realmId>/<entity>` with
//        `requestid` and `minorversion` parameters; intuit-default-config.xml: latest minor version 75;
//        ipp-v3-java-data/src/main/xsd/Finance.xsd: every entity and field name below (SalesReceipt, RefundReceipt,
//        Purchase, Deposit, Item, Account, TaxCode, CompanyInfo, Line and its details, the enums); IntuitRestServiceDef.xsd:
//        the answer's `QueryResponse` and `Fault`.

/** The press's browser goes here to sign in with Intuit (code flow). [O] */
export const AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
/** Code → tokens, and refresh. POST, `Authorization: Basic <client id:secret>`, form-encoded. [O] */
export const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
/** Revoke one token (access or refresh). POST, Basic client authentication, JSON `{ token }`. [O] */
export const REVOKE_URL = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";
/** Asks the token answer for the connection's hard end (the five-year limit). [O] */
export const HARD_EXPIRY_HEADER = "x-include-refresh-token-hard-expires-in";
/** The one scope: the Accounting API. [O] */
export const ACCOUNTING_SCOPE = "com.intuit.quickbooks.accounting";

/** "live" is a real QuickBooks company, "test" one of Intuit's sandbox companies. [O] */
export const API_HOSTS = Object.freeze({ live: "https://quickbooks.api.intuit.com", test: "https://sandbox-quickbooks.api.intuit.com" });
/** Sent on every call. [J] */
export const MINOR_VERSION = "75";

/** The entities the service reads or writes, as their address segment. [J] */
export const ENTITIES = Object.freeze({
  salesReceipt: "salesreceipt",
  refundReceipt: "refundreceipt",
  purchase: "purchase",
  deposit: "deposit",
  item: "item",
  companyInfo: "companyinfo",
  query: "query",
});

/** `/v3/company/<realmId>/<entity>[/<id>]` [J] */
export function companyPath(realmId, entity, id) {
  if (!/^\d{1,32}$/.test(String(realmId))) throw new Error("a QuickBooks company id is digits");
  if (!Object.values(ENTITIES).includes(entity)) throw new Error(`no QuickBooks entity ${entity}`);
  if (id !== undefined && !/^\d{1,32}$/.test(String(id))) throw new Error("a QuickBooks id is digits");
  return `/v3/company/${realmId}/${entity}${id === undefined ? "" : `/${id}`}`;
}

/** The answer key each entity comes back under (`{ "SalesReceipt": {...} }`) and is queried by. [J] */
export const ENTITY_NAMES = Object.freeze({
  salesreceipt: "SalesReceipt",
  refundreceipt: "RefundReceipt",
  purchase: "Purchase",
  deposit: "Deposit",
  item: "Item",
  companyinfo: "CompanyInfo",
});

/** Values the service writes into enum fields. [J] Finance.xsd */
export const QB = Object.freeze({
  // LineDetailTypeEnum
  salesLine: "SalesItemLineDetail",
  discountLine: "DiscountLineDetail",
  taxLine: "TaxLineDetail",
  expenseLine: "AccountBasedExpenseLineDetail",
  depositLine: "DepositLineDetail",
  // GlobalTaxCalculationEnum
  taxExcluded: "TaxExcluded",
  notApplicable: "NotApplicable",
  // PaymentTypeEnum (a Purchase paid out of the account the card sales wait in)
  cash: "Cash",
  // ItemTypeEnum
  service: "Service",
  // AccountTypeEnum / AccountSubTypeEnum, for suggesting accounts
  bank: "Bank",
  income: "Income",
  expense: "Expense",
  otherCurrentLiability: "Other Current Liability",
  otherCurrentAsset: "Other Current Asset",
  undepositedFunds: "UndepositedFunds",
  bankCharges: "BankCharges",
  salesOfProductIncome: "SalesOfProductIncome",
});
