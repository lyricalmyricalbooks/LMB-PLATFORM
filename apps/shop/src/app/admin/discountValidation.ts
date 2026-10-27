import { today } from "./discountState";
/**
 * `otherCodes`: codes of the shop's other discounts — two copies of one code make checkout ambiguous.
 * Automatic offers (method "automatic") have no code; blank entries in otherCodes are ignored.
 * `giftBook`: the catalog record picked as the free gift, when the dialog has it loaded.
 * `savedExpiry`: the expiry already saved on the code being edited. A past date is refused only when
 * this edit sets it, so an expired code can still be edited (e.g. paused or re-described).
 */
export function validateDiscountDraft(form: any, now = today(), otherCodes: string[] = [], giftBook?: any, savedExpiry = ""): Record<string, string> {
  const errors: Record<string, string> = {};
  const automatic = form.method === "automatic";
  const code = String(form.code || "").trim();
  if (automatic) {
    const title = String(form.title || "").trim();
    if (!title) errors.title = "Enter the title shoppers will see, e.g. “Spring sale”.";
    else if (title.length > 60) errors.title = "Keep the title to 60 characters or fewer.";
  } else if (!code) errors.code = "Enter a code customers will type at checkout.";
  else if (!/^[A-Z0-9_-]{3,32}$/i.test(code)) errors.code = "Use 3–32 letters, numbers, hyphens, or underscores.";
  if (form.type === "gift") {
    if (!automatic) errors.gift = "A free gift can only be an automatic offer. Choose “Automatic (no code)”.";
    else if (!form.giftBookId) errors.gift = "Choose the book to give away.";
    else if (giftBook && (giftBook.variants || []).length && !form.giftVariantId) errors.gift = "That book is sold in editions: choose which edition to give.";
    else if (giftBook && giftBook.productType === "giftCard") errors.gift = "A gift card can't be the free gift.";
  }
  if (form.type === "percentage" && !(Number(form.value) > 0 && Number(form.value) <= 100)) errors.value = "Enter a percentage between 1 and 100.";
  if (form.type === "fixed" && !(Number(form.value) > 0)) errors.value = "Enter an amount greater than zero.";
  if (form.appliesTo === "categories" && !(form.selectedCategories || []).length) errors.applies = "Choose at least one category.";
  if (form.appliesTo === "products" && !(form.selectedProducts || []).length) errors.applies = "Choose at least one book.";
  if (form.expiryDate && form.expiryDate !== savedExpiry && form.expiryDate < now) errors.expiryDate = "Choose today or a future date.";
  if (form.startDate && form.expiryDate && form.expiryDate < form.startDate) errors.expiryDate = "The end date must be on or after the start date.";
  if (form.usageLimit !== "" && (!(Number(form.usageLimit) >= 1) || !Number.isInteger(Number(form.usageLimit)))) errors.usageLimit = "Use a whole-number limit of at least 1.";
  if (form.minOrderAmount !== "" && Number(form.minOrderAmount) < 0) errors.minOrderAmount = "Minimum order cannot be negative.";
  if (form.maxDiscountAmount !== "" && form.maxDiscountAmount != null && !(Number(form.maxDiscountAmount) > 0)) errors.maxDiscountAmount = "Maximum discount must be greater than zero, or leave it blank.";
  if (form.minQuantity !== "" && (!(Number(form.minQuantity) >= 0) || !Number.isInteger(Number(form.minQuantity)))) errors.minQuantity = "Minimum quantity must be a whole number.";
  if (form.type === "bogo" && (!(Number(form.buyQuantity) >= 1) || !(Number(form.getQuantity) >= 1) || Number(form.getDiscountValue) < 0 || Number(form.getDiscountValue) > 100)) errors.bogo = "BOGO quantities must be at least 1 and the discount must be 0–100%.";
  if (form.type === "tiered") {
    const tiers = form.tiers || [];
    if (tiers.some((tier: any) => (tier.type || "percentage") === "percentage" && Number(tier.value) > 100)) errors.tiers = "A percentage tier can't be more than 100%.";
    else if (!tiers.length || tiers.some((tier: any) => Number(tier.value) <= 0) || tiers.some((tier: any, index: number) => index > 0 && Number(tier.minSpend) <= Number(tiers[index - 1].minSpend))) errors.tiers = "Add positive discounts with minimum spends in ascending order.";
  }
  if (!automatic && !errors.code && otherCodes.some(c => String(c || "").trim() && String(c || "").trim().toUpperCase() === code.toUpperCase()))
    errors.code = "Another discount already uses this code. Edit or delete that one instead.";
  return errors;
}

/**
 * The dialog's form for a saved discount. Saved records keep empty fields as null ("no usage limit"); the form keeps
 * them as its blank defaults (`empty`), so editing a code with no limit isn't refused as a limit of 0 and an older
 * record's missing text reads as empty.
 */
export function draftFrom(initial: Record<string, any>, empty: Record<string, any>): Record<string, any> {
  return {
    ...empty,
    ...Object.fromEntries(Object.entries(initial).filter(([, v]) => v != null)),
    method: initial.method === "automatic" ? "automatic" : "code",
  };
}
