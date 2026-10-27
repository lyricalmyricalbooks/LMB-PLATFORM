// The stored shape of a `discounts/{id}` document, one copy for the shop and the server (src/shared/CLAUDE.md).
// `adminApi.saveDiscount` and `updateDiscount` check what they write against it, so a wrong-typed field (text
// where a number belongs, an unknown type) is refused on the Discounts screen instead of reaching checkout.
// Shapes only: business rules (a percentage at most 100, tiers in order) stay in `admin/discountValidation.ts`,
// and the server re-checks every rule when a shopper uses a code. Older records can miss fields or carry
// `active` instead of `isActive`, so readers keep their own fallbacks.
import { array, boolean, nullable, number, object, oneOf, optional, string, type Check, type Infer } from "./edge";

const DISCOUNT_TYPES = ["percentage", "fixed", "freeship", "bogo", "tiered", "gift"] as const;

/** A number, or the text the form typed for it (tiers keep what was typed). */
const numberOrText: Check<number | string> = {
  parse: (value, path) => (typeof value === "string" ? value : number().parse(value, path)),
};
// Older tiers can miss `type` (read as percentage).
const tier = object({ minSpend: numberOrText, value: numberOrText, type: optional(oneOf(["percentage", "fixed"] as const)) });
const count = nullable(number({ min: 0 }));

const fields = {
  code: string(),
  type: oneOf(DISCOUNT_TYPES),
  value: number(),
  isActive: boolean(),
  startDate: nullable(string()),
  expiryDate: nullable(string()),
  minOrderAmount: count,
  minQuantity: count,
  maxDiscountAmount: count,
  usageLimit: count,
  usageCount: number({ min: 0 }),
  onePerCustomer: boolean(),
  // "catalog" is an older name for "all" that checkout still reads.
  appliesTo: oneOf(["all", "catalog", "categories", "products"] as const),
  selectedCategories: array(string()),
  selectedProducts: array(string()),
  allowedEmailDomains: string(),
  allowedCustomerEmails: string(),
  description: string(),
  buyQuantity: count,
  getQuantity: count,
  getDiscountValue: nullable(number()),
  tiers: nullable(array(tier)),
  method: oneOf(["code", "automatic"] as const),
  title: string(),
  giftBookId: nullable(string()),
  giftVariantId: nullable(string()),
  createdAt: string(),
  updatedAt: string(),
};

/** A whole `discounts/{id}` document, as `adminApi.saveDiscount` creates it. */
export const discountRecord = object(fields);

type Partial_<S> = { [K in keyof S]: Check<Infer<S[K]> | undefined> };
/** The fields an edit writes: any of the record's, each in the record's shape. Other keys pass untouched. */
export const discountUpdate = object(Object.fromEntries((Object.entries(fields) as Array<[string, Check<unknown>]>).map(([k, v]) => [k, optional(v)])) as Partial_<typeof fields>);

export type DiscountType = (typeof DISCOUNT_TYPES)[number];
export type DiscountTier = Infer<typeof tier>;
export type DiscountRecord = Infer<typeof discountRecord>;
