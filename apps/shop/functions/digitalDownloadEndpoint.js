// The download link for digital items in paid orders (ebooks, PDFs): checks the order's token, that it is paid and not
// cancelled or disputed, that the item is on it as the digital edition, the pre-order release and the download count,
// then hands out a short-lived signed file link. Moved out of index.js as is
// (functions/CLAUDE.md › Cloud Functions › Action table): index.js passes in its own Firebase wrapper, db and
// catalog helpers, so the vm-based handler tests' fakes still apply, and keeps the `exports.downloadDigitalAsset =` line.

function digitalDownloadEndpoint({
  onRequest, admin, db, crypto, catalogDigital, digitalDelivery, isPhysicalItem, preorderActive,
}) {
  // ──────────────────────────────────────────────────────────────
  // 4. HTTP Endpoint: Secure Digital Ebook Asset Downloads
  // ──────────────────────────────────────────────────────────────
  const downloadDigitalAsset = onRequest(
    async (req, res) => {
      const { orderId, itemId, token } = req.query;
      if (!orderId || !itemId || !token) {
        res.status(400).send("Missing download parameters");
        return;
      }

      try {
        const orderDoc = await db.collection("orders").doc(orderId).get();
        if (!orderDoc.exists) {
          res.status(404).send("Order not found");
          return;
        }

        const order = orderDoc.data();
        // The token is a random secret generated at payment time and only ever
        // delivered to the buyer's inbox — possession proves entitlement.
        const expected = order.downloadToken || "";
        const provided = String(token);
        const valid =
          expected.length > 0 &&
          expected.length === provided.length &&
          crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
        if (!valid) {
          res.status(403).send("Unauthorized access");
          return;
        }

        const refusal = digitalDelivery.downloadRefusal(order);
        if (refusal) {
          res.status(refusal.status).send(refusal.message);
          return;
        }

        // The order's own lines for this book, plus box-set parts (a part's book id is a valid itemId).
        const variantParam = req.query.variantId === undefined ? undefined : String(req.query.variantId);
        const candidates = digitalDelivery.deliveryCandidates(order, String(itemId), variantParam);
        if (!candidates.length) {
          res.status(404).send("Item not found in this order");
          return;
        }

        const bookDoc = await db.collection("books").doc(String(itemId)).get();
        if (!bookDoc.exists) {
          res.status(404).send("Product details not found");
          return;
        }

        const book = bookDoc.data();
        // Only a digital edition unlocks the file: a paperback of the same book does not.
        // Older orders saved no format, so their line is checked against the catalog.
        const bought = candidates.filter(({ line, variantId, bundle }) => {
          const recorded = !bundle && (line.digital !== undefined || line.isDigital !== undefined || line.format !== undefined);
          if (recorded) return !isPhysicalItem(line);
          const variant = variantId ? (book.variants || []).find(v => v.id === variantId) || null : null;
          return catalogDigital(book, variant);
        });
        if (!bought.length) {
          res.status(403).send("This order does not include the digital edition.");
          return;
        }
        // A pre-ordered e-book unlocks on its publication date (the live catalog decides, so a
        // release the publisher brings forward unlocks early too). Only lines bought as a
        // pre-order wait: turning pre-order on later for a new edition never locks earlier buyers out.
        const ready = bought.filter(({ line, bundle }) => !((bundle ? bundle.preorder : line.preorder) === true && preorderActive(book)));
        if (!ready.length) {
          res.status(403).send(book.publishDate ? `This pre-order can be downloaded from ${String(book.publishDate).slice(0, 10)}.` : "This pre-order can be downloaded once the book is released.");
          return;
        }
        // One file per digital edition: the edition's own file, else the book's.
        const target = ready.find(c => digitalDelivery.pickFileName(book, c.variantId)) || ready[0];
        const fileName = digitalDelivery.pickFileName(book, target.variantId);
        if (!fileName) {
          res.status(400).send("This publication does not have a digital download configured.");
          return;
        }

        const bucket = admin.storage().bucket();
        const file = bucket.file(`digital-assets/${fileName}`);

        const exists = await file.exists();
        if (!exists[0]) {
          res.status(404).send("Digital asset file not found in storage.");
          return;
        }

        // Each book + edition on the order can be fetched a limited number of times (counted atomically);
        // Order detail › Reset downloads gives the buyer a fresh allowance.
        const orderRef = db.collection("orders").doc(String(orderId));
        const key = digitalDelivery.countKey(target.bookId, target.variantId);
        const claim = await db.runTransaction(async tx => {
          const fresh = await tx.get(orderRef);
          const current = fresh.exists ? fresh.data() : {};
          const decision = digitalDelivery.nextDownloadCount(current.downloadCounts, key);
          if (decision.ok) tx.update(orderRef, { downloadCounts: decision.next });
          return decision;
        });
        if (!claim.ok) {
          res.status(429).send(`This download has been used ${claim.used} times, which is the limit. Please reply to your order email and we will reset it.`);
          return;
        }

        // A fresh, short-lived link per click, saved as an attachment named after the book.
        const filename = digitalDelivery.downloadFilename(book.title || target.line.title, fileName);
        const [signedUrl] = await file.getSignedUrl({
          action: "read",
          expires: Date.now() + digitalDelivery.SIGNED_URL_MINUTES * 60 * 1000,
          responseDisposition: digitalDelivery.contentDisposition(filename),
          responseType: digitalDelivery.contentTypeFor(fileName),
        });

        res.redirect(signedUrl);
      } catch (err) {
        console.error("Download redirection failed:", err);
        res.status(500).send("Sorry, the download could not be prepared right now. Please try again in a few minutes, or reply to your order email for help.");
      }
    }
  );

  return { downloadDigitalAsset };
}

module.exports = { digitalDownloadEndpoint };
