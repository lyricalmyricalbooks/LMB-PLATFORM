# Cart, returns and catalog review

Cart: open the bag, enter country/postal code and choose Estimate shipping. Profile
quotes appear cheapest first and update the estimated total. Checkout retains the
destination and independently prices the order and live carrier options. Cart quotes
exclude discounts/tax and do not promise carrier eligibility.

Returns: open the requested order. Approve with a confirmed return address/instructions,
or decline with an explanation. Record parcel receipt, then inspect every physical line.
Confirm the complete received quantity and resellable/damaged/mixed condition. For mixed
lines, enter the resellable count. Confirm the full-order refund: only eligible physical
copies restock. The refund includes shipping, tax and digital items. Customer tracking
shows the approved instructions and progress; private condition checks stay in Operations.
Provider-pending refunds await provider completion. Manual money must go back externally
before the publisher records its refund. Partial refunds remain a provider workflow.

Catalog: choose Show books needing publish review. Select the records, then Publish or
Move to draft. Review the per-book issues and selection, acknowledge, and apply. Bad
prices or missing titles cannot be published. Content warnings can be consciously
accepted; a genuine title containing Copy/Test stays visible if it is published.
Single-book Published saves use the same review. Books loads every catalog record.
Bulk failures retain the failed selections. Drafting preserves the records and stock.

## Deployment

1. Review current published test/duplicate records and move confirmed unwanted records
   to draft before releasing the removal of title-based hiding. This change performs
   no automatic live catalog writes. Duplicate published slugs use immutable book IDs.
2. Deploy the Functions bundle, including cartShippingPreview, manageReturn, refundOrder,
   Stripe/PayPal webhooks and reconciliation paths. Return refund completion and
   selective stock handling share the existing helper across these functions.
3. Deploy the frontend and freshly generated sitemap/prerender output. Existing rules
   already protect order-operations and customer reads; no new collection/index is used.
4. Verify the deployed profile estimate, secure tracking and approved full-order return
   on a sandbox order. Separately confirm actual provider refund and inventory outcomes.

## Validation

Local unit/handler tests exercise server-priced estimates, draft/unavailable destinations,
admin and App Check authority, return sequencing, private summaries, mixed-condition stock,
idempotent receipt/refund restocking, pending refund completion and manual records. Browser
fixtures exercise the actual components at 1280x1000 and 390x844 with mocked providers.
The actual checkout handoff retains France/75001 without creating an order or payment.
No live payment, refund, label purchase, email delivery or deployment is claimed.
