# Bookings plan 4, step 4.6: My day on a phone (Beta)

Plan: https://claude.ai/artifact/N7j2zKU7D4gH8uvNrMtqS5

- [x] Server: providers may take payment (`payLink`, `paidAtShop`) and keep a visit note (`visitNote`) on their own
      bookings; the front desk may keep notes. Notes go on the client card (`clientVisits/bk-<booking>`).
- [x] The day's list carries this visit's note and the client's note from last time.
- [x] Next client card (mint tile) with check in and call; rows show last time's note and what is left to pay.
- [x] Take payment dialog: QR code, email the pay link, or paid at the shop. Note dialog.
- [x] Phone layout: row actions wrap under the name; buttons at touch size.
- [x] Tests: server (own bookings only, note saved once, last time on the next visit, empty note removes it) and the
      page rules (next client, starts in, what is left to pay). Help line, release note, CLAUDE.md notes, screenshots.

## Review
The note is one per booking, kept with the owner's visit notes, so the client card stays the one place for history.
Last time's note is read per client on each day load (at most 40 clients); fine for a day list.
