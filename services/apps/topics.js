// The alerts an app can ask for (code plan 26.4), and the permission each one needs. `app/uninstalled` needs none: every
// app is told when it is removed, so it can stop and delete what it kept.
export const TOPICS = Object.freeze({
  "orders/paid": { words: "An order is paid", needs: "read_orders" },
  "orders/shipped": { words: "An order is sent", needs: "read_orders" },
  "orders/refunded": { words: "An order is refunded", needs: "read_orders" },
  "products/changed": { words: "A product is added or changed", needs: "read_products" },
  "inventory/changed": { words: "How many of a product you have changes", needs: "read_inventory" },
  "app/uninstalled": { words: "The shop removes your app", needs: null },
});
