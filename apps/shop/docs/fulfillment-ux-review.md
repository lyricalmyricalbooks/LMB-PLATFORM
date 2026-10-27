# Publisher fulfillment UX revision

The previous screen exposed competing label and dispatch actions in three locations, kept the address below the item and parcel panels on phones, and always displayed preset, hold and refund forms.

The revision uses one sequential working area: address, books, shipping. Only the current step offers its primary action. Parcel setup and dispatch use focused dialogs; holds and refunds are in More order actions. Customer/payment information is secondary and activity is collapsed. Phones use readable order cards, a Work queue selector and a Filter & sort dialog.

## Verification

- Full Vitest suite and production build.
- Browser checks with mock orders: address inconsistency and correction; address review; packing; parcel/rate dialog; purchased tracking prefill; explicit dispatch; unpaid restrictions.
- Holds block packing; release restores the active step. Refund details lead to a separate final confirmation (no real refund submitted).
- Multiline internal notes and note filtering; mixed-result batch packing retains failed selections.
- Escape closes dialogs and restores focus to the launching control.
- Orders and order detail checked for horizontal overflow at 320, 390, 768 and 1024 pixels; desktop capture at 1440 pixels.

Screenshots use synthetic publisher/customer data. Carrier responses and order persistence are mocked; live Shippo spending, payment, notification delivery and production deployment are not certified by these checks. No backend/payment or Firestore contracts changed in this revision.

[Desktop packing view](screenshots/fulfillment/desktop.png) · [Phone packing view](screenshots/fulfillment/phone.png) · [Phone order list](screenshots/fulfillment/phone-orders.png)

Independent review findings fixed: purchased labels remain printable on held and dispatched orders; a pending refund/cancellation locks further actions. The controlled pending-refund browser check passed. Final validation: 472 tests across 97 files passed; production build passed (existing bundle-size warnings).
