// Stored shapes of the `orders/{id}` and `books/{id}` documents, one copy for the shop and the server
// (src/shared/CLAUDE.md). Types only: the generated functions/shared copy is empty. The listed fields are the ones
// screens read most, typed as the server writes them; every other field stays open (`any`), so older records and
// fields added later still read. Admin screens type their order and book lists with these instead of `Record<string, any>`.

type Open = { [field: string]: any };

/** One bought line of an order (the server's priced item, minus its shipping profile). */
export type OrderLine = Open & {
  id: string;
  title?: string;
  price?: number;
  quantity?: number;
  variantId?: string | null;
  format?: string;
  preorder?: boolean;
  releaseDate?: string | null;
};

/** The shopper's contact details on an order. */
export type OrderCustomer = Open & { name?: string; email?: string; phone?: string };

/** An `orders/{id}` document as the admin reads it (`id` is the document id). */
export type OrderRecord = Open & {
  id: string;
  orderId?: string;
  createdAt?: string;
  updatedAt?: string;
  paidAt?: string;
  shippedAt?: string;
  status?: string;
  paymentStatus?: string;
  paymentMethod?: string;
  isTest?: boolean;
  items?: OrderLine[];
  customer?: OrderCustomer;
  subtotal?: number;
  discount?: number;
  shipping?: number;
  tax?: number;
  total?: number;
  giftCardAmount?: number;
  appliedDiscount?: any;
  refundedAmountMinor?: number;
  checkoutCurrency?: string;
  expectedCurrency?: string;
};

/** A `books/{id}` document as the admin reads it (`id` is the document id). */
export type BookRecord = Open & {
  id: string;
  title?: string;
  slug?: string;
  status?: string;
  format?: string;
  retailPrice?: number;
  stockLevel?: number;
  categories?: string[];
  photos?: Array<{ url: string; altText?: string }>;
  createdAt?: string;
};
