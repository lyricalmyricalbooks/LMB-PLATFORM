// The download link for digital items in paid orders (ebooks, PDFs): checks the order's token, that it is paid and not
// cancelled or disputed, that the item is on it as the digital edition, the pre-order release and the download count,
// then hands out a short-lived signed file link. Moved out of index.js as is
// (functions/CLAUDE.md › Cloud Functions › Action table): index.js passes in its own Firebase wrapper, db and
// catalog helpers, so the vm-based handler tests' fakes still apply, and keeps the `exports.downloadDigitalAsset =` line.

const pdfStamp = require("./pdfStamp");
const { mediaKind, nextPlayCount, PLAY_LINK_MINUTES } = require("./shared/digitalFiles");

function digitalDownloadEndpoint({
  onRequest, admin, db, crypto, catalogDigital, digitalDelivery, isPhysicalItem, preorderActive, applyCors = () => false,
}) {
  // ──────────────────────────────────────────────────────────────
  // 4. HTTP Endpoint: Secure Digital Ebook Asset Downloads
  // ──────────────────────────────────────────────────────────────
  const downloadDigitalAsset = onRequest(
    async (req, res) => {
      const { orderId, itemId, token } = req.query; // plus optional variantId and file (which of the files, from 0)
      // `play=1` (Digital D3): a short link to play an audio or video file in the page, answered as JSON.
      const play = req.query.play === "1";
      if (play && applyCors(req, res)) return;
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
        // An order the owner still has to look at (Settings › Payments › Check big orders, or a risky payment) opens its
        // files only after "It looks fine": an e-book is as easy to resell as a gift card. The private record says so.
        if (order.review?.status === "needs_review") {
          const operations = (await db.collection("order-operations").doc(String(orderId)).get()).data?.() || {};
          if (!operations.reviewCleared) {
            res.status(403).send("The shop is checking this order. Your download opens as soon as they confirm it; there's nothing you need to do.");
            return;
          }
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
        // The edition's own files, else the book's; `file` picks one of them (0, the first, when left out).
        const target = ready.find(c => digitalDelivery.filesFor(book, c.variantId).length) || ready[0];
        const files = digitalDelivery.filesFor(book, target.variantId);
        const fileIndex = req.query.file === undefined || req.query.file === "" ? 0 : Number(req.query.file);
        if (!Number.isInteger(fileIndex) || fileIndex < 0) {
          res.status(400).send("Missing download parameters");
          return;
        }
        if (!files.length) {
          res.status(400).send("This publication does not have a digital download configured.");
          return;
        }
        if (!files[fileIndex]) {
          res.status(404).send("This file is no longer part of the product. Please open your order again for the current files.");
          return;
        }
        const fileName = files[fileIndex].file;

        const bucket = admin.storage().bucket();
        const file = bucket.file(`digital-assets/${fileName}`);

        const exists = await file.exists();
        if (!exists[0]) {
          res.status(404).send("Digital asset file not found in storage.");
          return;
        }

        if (play) {
          await playLink({ res, file, fileName, orderId: String(orderId), key: digitalDelivery.fileCountKey(digitalDelivery.countKey(target.bookId, target.variantId), files, fileIndex) });
          return;
        }

        // Each book + edition on the order can be fetched a limited number of times (counted atomically);
        // Order detail › Reset downloads gives the buyer a fresh allowance.
        const orderRef = db.collection("orders").doc(String(orderId));
        const key = digitalDelivery.fileCountKey(digitalDelivery.countKey(target.bookId, target.variantId), files, fileIndex);
        const limit = digitalDelivery.downloadLimitFrom((await db.collection("settings").doc("website").get()).data?.());
        const claim = await db.runTransaction(async tx => {
          const fresh = await tx.get(orderRef);
          const current = fresh.exists ? fresh.data() : {};
          const decision = digitalDelivery.nextDownloadCount(current.downloadCounts, key, limit);
          if (decision.ok) tx.update(orderRef, { downloadCounts: decision.next });
          return decision;
        });
        if (!claim.ok) {
          // The owner sees it once on the Alerts page (Digital D2, `downloadLimitReached`); Reset downloads clears it.
          if (!order.downloadLimitReached?.[key]) {
            await orderRef.update({ downloadLimitReached: { ...(order.downloadLimitReached || {}), [key]: new Date().toISOString() } })
              .catch(err => console.warn("Could not note the used-up download for the owner:", err?.message || err));
          }
          res.status(429).send(`This download has been used ${claim.used} times, which is the limit. Please reply to your order email and we will reset it.`);
          return;
        }

        // A fresh, short-lived link per click, saved as an attachment named after the book.
        // One file: named after the product. Several: each keeps the name the owner gave it.
        const filename = digitalDelivery.downloadFilename(files.length > 1 ? digitalDelivery.fileLabel(files[fileIndex]) : (book.title || target.line.title), fileName);
        // A stamped PDF (Digital D2b): the buyer's name and email on each page, made once per order and file.
        const served = await stampedCopy({ bucket, book, file, fileName, order, orderId: String(orderId) });
        const [signedUrl] = await served.getSignedUrl({
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

  // Listen and watch (Digital D3): plays never use the download limit, but each order file gets `MAX_PLAYS` links a day
  // (kept in `orders/<id>/plays/counts`, today's only, so a play never wakes the order's own triggers; no rule opens it to
  // browsers). The link opens in the page (inline) and lasts `PLAY_LINK_MINUTES`; the player asks for
  // a fresh one when it runs out. A file that isn't audio or video only downloads.
  async function playLink({ res, file, fileName, orderId, key }) {
    const kind = mediaKind(fileName);
    if (!kind) {
      res.status(400).json({ error: "This file can't be played here. Download it instead.", code: "not_media" });
      return;
    }
    const countsRef = db.collection("orders").doc(orderId).collection("plays").doc("counts");
    const day = new Date().toISOString().slice(0, 10);
    const claim = await db.runTransaction(async tx => {
      const fresh = await tx.get(countsRef);
      const decision = nextPlayCount((fresh.exists ? fresh.data() : {}).counts, key, day);
      if (decision.ok) tx.set(countsRef, { counts: decision.next });
      return decision;
    });
    if (!claim.ok) {
      res.status(429).json({ error: "This file has been played a lot today. Please try again tomorrow, or download it.", code: "play_limit" });
      return;
    }
    const expires = Date.now() + PLAY_LINK_MINUTES * 60 * 1000;
    const [url] = await file.getSignedUrl({ action: "read", expires, responseDisposition: "inline", responseType: digitalDelivery.contentTypeFor(fileName) });
    res.set("Cache-Control", "no-store");
    res.json({ url, kind, expiresAt: new Date(expires).toISOString() });
  }

  // The file to hand out: the original, or for a product with `stampPdf` a copy of a PDF (≤ MAX_STAMP_BYTES) with the
  // buyer's name and email at the foot of each page, kept at digital-stamped/<order>/<file> so the next download reuses
  // it (a new version is a new file name, so it is stamped afresh). Anything that goes wrong sends the original.
  async function stampedCopy({ bucket, book, file, fileName, order, orderId }) {
    if (book?.stampPdf !== true || !pdfStamp.isPdf(fileName)) return file;
    try {
      const copy = bucket.file(`digital-stamped/${orderId.replace(/[^A-Za-z0-9_-]/g, "_")}/${fileName}`);
      if ((await copy.exists())[0]) return copy;
      const [meta] = await file.getMetadata();
      if (!(Number(meta?.size) > 0) || Number(meta.size) > pdfStamp.MAX_STAMP_BYTES) return file;
      const [bytes] = await file.download();
      const stamped = await pdfStamp.stampPdf(bytes, { name: order.customer?.name, email: order.customer?.email, orderId: order.orderId || orderId });
      await copy.save(Buffer.from(stamped), { contentType: "application/pdf", resumable: false });
      return copy;
    } catch (err) {
      console.warn("Sending the PDF without the buyer's name:", err?.message || err);
      return file;
    }
  }

  return { downloadDigitalAsset };
}

module.exports = { digitalDownloadEndpoint };
