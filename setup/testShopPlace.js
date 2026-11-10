// Where the platform's own test shop lives in the shared system (docs/shared-system.md, phase 8): a folder in the shared
// test project, at that project's own address. Kept apart from setup/make-test-shop.js so the release check and the
// hosted server can name it without loading the shop maker.
export const TEST_PROJECT = "lmb-test-shop";
export const TEST_SHOP_ID = "test-press";
export const TEST_SHOP_ADDRESS = `${TEST_PROJECT}.web.app`;
