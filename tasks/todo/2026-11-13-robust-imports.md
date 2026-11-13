# Make imports from other shop systems robust (13 November 2026)

Julian: "make the import from other ecommerce shops more robust and work better" and "make it compatible with the
most popular e commerce platforms".

Method: write each popular system's export the way it really comes out (every column, the odd rows real shops have),
run it through the readers, fix what breaks, and keep the files as tests (`apps/shop/testdata/moves/`,
`realExports.test.ts`). Each file is also imported a second time over the first run's result: it must add nothing.

## Steps
- [x] Read the importers (shopMove.ts, catalogImport.ts, pastOrders.ts, spreadsheetFile.ts) and their tests
- [x] Sample files: products (six layouts), orders (five), customers (two)
- [x] PR 1, reading: guarded codes ('0123), gift card products left out, hidden/draft/archived marked, http and bare
      file-name photos, lost photos said, ISBN from the product-code column, product sets and outside links named,
      category addresses, `&amp;` in names, a list of SKUs not taken as one, another currency said, sale on one edition
      said, weights, European prices (1.250,00), two-byte text without its marker, shipping and line prices in order
      files, lifetime spend in a till's customer list
- [ ] PR 2, saving: take back a product import (only the drafts it made, untouched since), customers too; save big
      files several at a time with a clear count
- [ ] PR 3, screen: preview and result on a phone, in the bento look; book-only words only for book shops
- [ ] Shops that sell in US dollars: past orders and price notes still say Canadian dollars

## Review
(filled in at the end)
