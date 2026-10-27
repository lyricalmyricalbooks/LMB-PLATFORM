import type { AppUpdate } from "../appUpdates";

export default {
  id: "shop-order-edition-stock", date: "2026-10-10", title: "Arrange your shop, edit edition stock from the list, steadier book photos",
  summary: "Books now opens in Shop order: drag a book by its grip (or use the up/down arrows) to set the order books appear in your shop. The storefront's default sort, now called “Featured”, and Product grid sections set to the shop's order follow it; books you haven't placed come after, newest first. Clear any search or filter to rearrange. For books sold in editions (like a hardcover with special editions), clicking the Inventory badge now opens a small window where you set each edition's stock; each change is logged in Inventory history, and a sale made while the window was open is never overwritten. The list now reads edition stock the same way checkout does. On the product page, the main photo no longer flashes: the loading placeholder could stay pulsing over a photo the browser already had. Checked with local tests only.",
  links: [{ label: "Open Books", tab: "catalog" }, { label: "Open Inventory", tab: "inventory" }],
} satisfies AppUpdate;
