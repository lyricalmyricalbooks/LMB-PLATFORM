// Studio › Style › Customer accounts › "Customer accounts" switch. On by default (current behaviour).
// Off hides every sign-in entry point (header icon, phone menu, checkout Google button, thank-you
// sign-in box) and turns /account into a pointer to order tracking.
export function accountsEnabled(design: any): boolean {
  const value = design?.storefront?.customerAccounts ?? design?.customerAccounts;
  return value !== false;
}
