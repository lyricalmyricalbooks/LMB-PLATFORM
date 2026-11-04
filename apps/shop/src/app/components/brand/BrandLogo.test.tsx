// Partner company logos: drawn from the companies' own artwork, never recoloured, one tile size per step, and Google's
// sign-in button with Google's G and words. The storefront's payment icons use the real card marks in the shop's colour.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BRAND_LOGOS } from "./brandLogos";
import { BrandLogo, BrandLogoRow, GoogleSignInButton, isBrandId } from "./BrandLogo";
import { PAYMENT_ICONS } from "../../features/site/paymentIcons";
import { PAYMENT_BADGE_OPTIONS } from "../../features/site/paymentBadges";

describe("BrandLogo", () => {
  it("draws the company's own artwork in the company's colour, decorative unless labelled", () => {
    const html = renderToStaticMarkup(h(BrandLogo, { id: "stripe" }));
    expect(html).toContain('class="brand-logo brand-logo--md"');
    expect(html).toContain(`fill="${BRAND_LOGOS.stripe.color}"`);
    expect(html).toContain(BRAND_LOGOS.stripe.body);
    expect(html).toContain('aria-hidden="true"');
    expect(renderToStaticMarkup(h(BrandLogo, { id: "quickbooks", label: "QuickBooks", size: "lg" }))).toMatch(/role="img" aria-label="QuickBooks"/);
  });

  it("keeps full-colour logos' own colours and puts badge logos on their company's colour", () => {
    expect(renderToStaticMarkup(h(BrandLogo, { id: "google" }))).not.toMatch(/<svg[^>]*fill=/);
    expect(renderToStaticMarkup(h(BrandLogo, { id: "mailchimp" }))).toContain("background:#FFE01B");
  });

  it("names each logo in a row for screen readers", () => {
    const html = renderToStaticMarkup(h(BrandLogoRow, { ids: ["instagram", "facebook"], label: "Works with" }));
    expect(html).toContain('aria-label="Instagram"');
    expect(html).toContain('aria-label="Facebook"');
    expect(isBrandId("instagram")).toBe(true);
    expect(isBrandId("shopify")).toBe(false);
  });

  it("Google's sign-in button carries the four-colour G and Google's words", () => {
    const html = renderToStaticMarkup(h(GoogleSignInButton, { children: "Sign in with Google" }));
    expect(html).toMatch(/^<button type="button" class="gsi-button">/);
    for (const colour of ["#4285F4", "#34A853", "#FBBC05", "#EA4335"]) expect(html).toContain(colour);
    expect(html).toContain('<span class="gsi-button-text">Sign in with Google</span>');
  });
});

describe("storefront payment icons", () => {
  it("are the real card and wallet marks, in the shop's text colour, for every payment option", () => {
    for (const { id } of PAYMENT_BADGE_OPTIONS) {
      const html = renderToStaticMarkup(h("span", null, PAYMENT_ICONS[id]));
      expect(html, id).toContain('fill="currentColor"');
      expect(html, id).not.toContain("<text");
    }
    expect(renderToStaticMarkup(h("span", null, PAYMENT_ICONS.amex))).toContain(BRAND_LOGOS.americanexpress.body);
  });
});
