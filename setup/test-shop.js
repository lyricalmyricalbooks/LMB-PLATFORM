// The made-up test shop and platform settings used by tests and the dry run. Nothing here is a real project, folder,
// billing account, address, release or person.
export const TEST_SHOP = Object.freeze({
  shopId: "lmb-test-shop",
  pressName: "Test Press",
  ownerEmail: "owner@example.com",
  plan: "both",
  country: "CA",
  currency: "CAD",
  paymentProvider: "stripe",
  testMode: true,
});

// The starter documents a release would bring. The real list comes with each release of the shop copy, which owns their
// shape; these only prove the step writes what it is given, once.
const testStarterContent = (shop) => [
  { path: "settings/website", data: { shopName: shop.pressName, currency: shop.currency, country: shop.country } },
  { path: "settings/setupChecklist", data: { open: true } },
];

export const TEST_CONFIG = Object.freeze({
  folder: "folders/000000000000",
  billingAccount: "billingAccounts/000000-000000-000000",
  senderEmail: "shops@example.com",
  release: Object.freeze({ version: "0.0.0-test", starterContent: testStarterContent }),
});
