import { describe, expect, it } from "vitest";
import { isServicesStorefront, withServicesStorefront } from "./servicesStorefront";
import { automaticFooterItems } from "./footerNavigation";

const salon = { sells: "hair", design: {}, policies: { shipping: "We ship.", returns: "Returns.", privacy: "Private." } };

describe("services storefront", () => {
  it("is a services shop with no products on sale", () => {
    expect(isServicesStorefront("hair", 0)).toBe(true);
    expect(isServicesStorefront("hair", 2)).toBe(false);
    expect(isServicesStorefront("books", 0)).toBe(false);
    expect(isServicesStorefront(undefined, 0)).toBe(false);
    // A change of type (shop types plan): the type decides, whatever products the shop kept.
    expect(isServicesStorefront("hair", 12, "services")).toBe(true);
    expect(isServicesStorefront("hair", 0, "products")).toBe(false);
    expect(isServicesStorefront("hair", 3, "both")).toBe(false);
    expect(isServicesStorefront("hair", 0, "both")).toBe(true);
  });

  it("hides the bag, wishlist and currency picker until the owner sets them", () => {
    const out = withServicesStorefront(salon, 0);
    expect(out.design).toMatchObject({ hideCartButton: true, hideHeaderWishlist: true, hideCurrencySelector: true });
    const owner = withServicesStorefront({ ...salon, design: { hideCartButton: false } }, 0);
    expect(owner.design.hideCartButton).toBe(false);
  });

  it("drops the shipping and returns policies, keeps the rest", () => {
    expect(withServicesStorefront(salon, 0).policies).toEqual({ privacy: "Private." });
    expect(salon.policies.shipping).toBe("We ship.");
  });

  it("leaves other shops and services shops with products as they are", () => {
    expect(withServicesStorefront(salon, 3)).toBe(salon);
    const shop = { ...salon, sells: "clothing" };
    expect(withServicesStorefront(shop, 0)).toBe(shop);
  });

  it("drops the Shop and Track your order footer links", () => {
    const ids = automaticFooterItems(withServicesStorefront({ ...salon, bookingsLive: true }, 0), []).map(i => i.id);
    expect(ids).not.toContain("footer-shop");
    expect(ids).not.toContain("footer-track");
    expect(ids).toContain("footer-book");
    expect(automaticFooterItems({ design: {} }, []).map(i => i.id)).toContain("footer-track");
  });
});
