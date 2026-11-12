/**
 * Settings › Payments › Stripe › Apple Pay / Google Pay, as Stripe's card form wants them. A switch the owner turned off
 * hides that wallet; on, or never set, Stripe shows it where the browser and the shop's web address allow. Shops whose
 * cards go through the platform have no such switch, so they always get "auto" (the caller passes no settings).
 */
export type WalletSwitches = { applePay?: unknown; googlePay?: unknown } | null | undefined;
export type WalletChoice = { applePay: "auto" | "never"; googlePay: "auto" | "never" };

export function walletChoice(stripe: WalletSwitches): WalletChoice {
  return {
    applePay: stripe?.applePay === false ? "never" : "auto",
    googlePay: stripe?.googlePay === false ? "never" : "auto",
  };
}
