# Writing stockroom records from the admin

Rules for every admin page that changes the stockroom's records (a sale, a void, an expense, stock, a setting). The code
is `stockroomWrite.ts` (the writer), `planSave.ts` (the pure merge plan) and `stockroomMemory.ts` (an in-memory
stockroom for tests). This is a financial ledger: another device's work must never be lost, and a failure must never be
quiet.

## The rules

1. **Never write a record any other way.** No `setDoc`, no `updateDoc`, no direct Realtime Database `set`. Books go
   through `saveBookState`, settings through `updateSetting` (or `saveSetting` with its `base`). The old stockroom app and
   this layer write the same documents in the same shapes, so each reads the other's records.
2. **Say what changes, not what the book becomes.** `saveBookState(bookId, mutate)` hands `mutate` a private copy of the
   book as it is now. Edit it (or return a new object). The layer re-reads, merges with anything another device saved,
   and writes in one transaction. Do not keep your own copy of a book between calls and save that: it is stale by then.
3. **Add rows, void rows; never delete a row.** A sale is voided (`voided: true`), not removed. A deleted row cannot be
   told apart from one another device has not seen yet. Give every new row what the old app gives it (`sheetsId` or
   `uid` for a sale, `id` for ledger/expense/store rows): the merge matches rows by those.
4. **Put the rule in `mutate`, not in the page.** Throw from `mutate` to refuse (not enough copies, missing field): nothing
   is written and the error reaches your `catch`. `mutate` runs once, before any write, with no side effects other than on
   its copy (no toasts, no network).
5. **Show the result. Always.** Every call returns a result; never discard it. `describeResult(result)` gives the tone and
   one plain sentence. At minimum:
   - `saved` / `unchanged`: replace what the page shows with `result.state` (it includes other devices' rows and the
     recomputed stock), not with what you asked to save.
   - `saved` with `conflicts`: the same entry was changed on two devices, this device's version was kept and the other
     is in `conflicts[].remote`. Tell the person, with `describeResult` (tone `warn`). Do not hide it.
   - `refused`: not allowed (staff, paused plan, unknown item). Say so; do not retry.
   - `failed`: nothing was changed. Say so. `offline`, `read-failed`, `write-failed` may be tried again; `too-big`,
     `unreadable`, `two-copies`, `moved` need a person.
6. **A failed save leaves things as they were.** The layer never changes your local state; if you showed the change
   optimistically, put the screen back to the book as it was when the result is `refused` or `failed`.
7. **Money pages show a saving state and block a second tap** until the result arrives. Two quick saves are safe (they
   merge), but a double-tapped "Record sale" is two sales.
8. **Staff and authors.** The rules let only the shop owner (and, per book, the book's own author for a few parts) write.
   Hide write buttons for everyone else, and still handle `refused`: the rules are the authority, the button is manners.
9. **Settings that every device shares (`catalog`, `taxCenter`) are merged key by key.** Use `updateSetting`, which reads
   the current text and uses it as the merge base. `saveSetting` for those two refuses without `base` (the exact text
   you read, or `null` if there was none). Everything else is a plain overwrite, as in the old app.
10. **One writer, one source of truth for derived values.** The layer rebuilds every derived value with the stockroom's
    own `recomputeAfters` (`apps/stockroom/src/lib/recompute-afters.js`, the function its every save runs): revenue and
    channel totals, store tallies, the on-hand count and each row's running `after`, before the write and again after a
    merge. A page never works those out itself. `deriveStock` (on-hand only) is for tests.
11. **The Google Sheet is not updated from here.** The old app sends each sale and void to the press's Google Sheet from
    its own device; the admin can't. A row added or voided here reaches the Sheet only through the stockroom's rebuild.

## What the layer does for you

- Reads the plan, the mode flags and the catalogue fresh from the server on every save (never a remembered value).
- Writes only the parts that changed, as `{ data: <JSON text>, ts }`; one transaction for all parts of a book.
- A book flagged for the older store is saved there (also compare-and-write, with the same merge); a book with records in
  both stores is refused (`two-copies`) so the admin never writes to a copy no screen reads.
- Refuses a stored part it cannot parse (never treats it as empty) and a book too big for one record.
- Keeps the bookkeeper's key-free Tax Centre copy in step after a Tax Centre save, as the old app does.
- `failed` results carry `pending`, the change as prepared. An offline queue can keep it and call
  `commitBookState(pending)` later; that re-checks the plan, flags and store and merges with whatever was saved since.

## What it does not do (yet)

- **No audit trail.** The old stockroom keeps none per save (its rules have no audit collection), and this layer cannot add
  one without a rules change. `written` (the parts stored) is in every result for a page that wants to show it.
- **No offline queue.** Designed for (`pending`, `commitBookState`), not built.
- **Recording and voiding a sale** are built (`recordSale.ts`, `SaleWriter.tsx`); see the Sales records page.
- **No backups, mode flags, book deletion, receipts or fair sales.** Add them here, behind the same result types, when a
  page needs them.
- **Not exercised against the live database.** The tests use in-memory fakes with the same commit behaviour; the
  Firestore transaction and Realtime Database transaction code (`liveStockroomIO`) has not been run against an emulator.

## Testing a page that writes

Use `MemoryStockroom` (`device()` for each device, `beforeCommit` to make another device write between your read and
your commit, `failCommit`, `offline`, `role: "staff"`) and `createStockroomWriter(memory.device())`. Read the result
back the way the old app does (`assembleParts` then `stitchState` over `memory.parts`), as `stockroomWrite.test.ts` does.
