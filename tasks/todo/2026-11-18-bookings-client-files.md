# Bookings plan 4, step 3.2: Client files

Files kept with one client on the client card (services shops), beside Visit notes and photos.

- [x] Pure rules `clientFiles.ts`: kinds (PDF, Word, document, text, spreadsheet, pictures), 20 MB, 30 a client, the
      client's own folder only, names, sizes, the download name.
- [x] Calls `clientFilesApi.ts`: upload as it is (never shrunk), record, rename, delete (record then file), read with
      the signed-in Storage SDK (no download link).
- [x] Rules: `clientFiles` admin only, the path must sit in that client's folder, only the name changes later;
      storage `client-files/<client>/<file>` admin only, the same kinds, 20 MB. Emulator checks incl. another shop.
- [x] Privacy: the owner's export lists the files (no storage path); erase deletes records and files (only paths in
      the folder); the shopper's own copy leaves them out. Photo copies skip the folder.
- [x] Admin: Files (Beta) on the client card: Add files (several at once, "Adding 2 of 3…"), open in a new tab,
      Download, Rename, Delete with a confirm, empty state, full state. Fixture: Ben has three files.
- [x] Tests, help line, release note. Verify: typecheck, lint, vitest, help test; screenshots at 1440 and 390.

## Review
Files are kept as they are (a contract must not be re-compressed), so the limit is 20 MB rather than shrinking. The
storage rule's kinds are checked against the admin's list by a test, so the two can't drift.
