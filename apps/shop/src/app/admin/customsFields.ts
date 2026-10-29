// Per-book customs answers for international labels (Books › edit › Details). Blank means the
// defaults below, which suit printed books. Mirrors functions/customs.js (validHsCode, defaults).
export const DEFAULT_CUSTOMS_DESCRIPTION = "Printed books";
export const DEFAULT_HS_CODE = "4901.99";

/** 4 to 10 digits, optionally dotted: 4901, 4901.99, 4901.99.0000. */
export const validHsCode = (value: unknown): boolean => /^\d{4}(?:[.\s-]?\d{2}){0,3}$/.test(String(value || "").trim());

// Plan 10.4: a blank box means what this kind of product ships as (src/shared/kindDefaults.ts); a printed book is as before.
import { kindShipping } from "../../shared/kindDefaults";

/** The words, tariff code and weight a blank customs box means for this product. */
export const customsDefaultsFor = (product: unknown) => kindShipping(product);
