// What an outside app may ask to see or change in a press's shop (code plan 26.1, docs/app-store.md). The list is fixed:
// an app picks from it, and the press reads each one's plain words on the permission screen before saying yes (26.2).
//
// On purpose, nothing here can weaken payments, stock holds or checkout: no permission marks an order paid, changes the
// money on a paid order, reads card details or touches the shop's payment settings. Those stay the shop's own.
//
// `write_*` includes `read_*` of the same thing, as on the big platforms: an app that changes products can see them.

export const SCOPES = Object.freeze({
  read_shop: { words: "See your shop's name, address and currency", group: "shop" },
  read_products: { words: "See your products, prices and photos", group: "products" },
  write_products: { words: "Add and change your products, prices and photos", group: "products", includes: "read_products" },
  read_inventory: { words: "See how many of each product you have", group: "inventory" },
  write_inventory: { words: "Change how many of each product you have", group: "inventory", includes: "read_inventory" },
  read_orders: { words: "See your orders, what was in them and where they ship to", group: "orders", personal: true },
  write_orders: { words: "Add tracking and mark orders as sent", group: "orders", includes: "read_orders", personal: true },
  read_customers: { words: "See your customers' names, emails and addresses", group: "customers", personal: true },
  write_customers: { words: "Add and change your customers' details", group: "customers", includes: "read_customers", personal: true },
  read_discounts: { words: "See your discount codes", group: "discounts" },
  write_discounts: { words: "Make and change discount codes", group: "discounts", includes: "read_discounts" },
  read_content: { words: "See your website's pages and blog posts", group: "content" },
  write_content: { words: "Add and change your website's pages and blog posts", group: "content", includes: "read_content" },
});

export const SCOPE_NAMES = Object.freeze(Object.keys(SCOPES));

/**
 * A clean, sorted list of permissions from what an app asked for, or null when any of them isn't on the list. A
 * permission that another one already includes is dropped (asking for both "see" and "change" products is "change").
 */
export function cleanScopes(list) {
  if (!Array.isArray(list)) return null;
  const asked = new Set();
  for (const name of list) {
    if (typeof name !== "string" || !Object.hasOwn(SCOPES, name)) return null;
    asked.add(name);
  }
  for (const name of [...asked]) if (SCOPES[name].includes) asked.delete(SCOPES[name].includes);
  return SCOPE_NAMES.filter((name) => asked.has(name));
}

/** Every permission a granted list gives, with the ones it includes: used to check each call (26.3). */
export function grantedScopes(list) {
  const all = new Set();
  for (const name of cleanScopes(list) ?? []) {
    all.add(name);
    if (SCOPES[name].includes) all.add(SCOPES[name].includes);
  }
  return SCOPE_NAMES.filter((name) => all.has(name));
}

/** Does a granted list allow this permission? */
export const allows = (granted, scope) => grantedScopes(granted).includes(scope);

/** The plain words for a list, for the permission screen and the store page. */
export const scopeWords = (list) => (cleanScopes(list) ?? []).map((name) => ({ scope: name, words: SCOPES[name].words, personal: SCOPES[name].personal === true }));

/** The public list, for app makers' docs and the store. */
export const scopeList = () => SCOPE_NAMES.map((name) => ({ scope: name, words: SCOPES[name].words, group: SCOPES[name].group, ...(SCOPES[name].includes ? { includes: SCOPES[name].includes } : {}), personal: SCOPES[name].personal === true }));
