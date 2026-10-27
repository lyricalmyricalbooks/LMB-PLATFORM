// Admin › Orders › Buy label: createShippingLabel (Shippo rates, purchase, void and refund of a label). Moved out of
// index.js as is (functions/CLAUDE.md › Cloud Functions › Action table). index.js passes in its own Firebase wrappers,
// guards and Shippo helpers, so the vm-based handler tests' fakes still reach this code.
const { labelHandedOver, transactionRefundState, findLabelTransaction, refundEntry, openRefunds, REFUND_WINDOW_DAYS: LABEL_REFUND_WINDOW_DAYS } = require("./labelVoid");
const { labelProblem, shippoTransactionOutcome, shippoDefiniteRefusal, terminal: terminalOrder } = require("./fulfillmentGuard");
const { addressMissing } = require("./shared/addressRules");
const { isPhysicalItem } = require("./shared/localFulfillment");
const { lineCopyGrams, parcelGrams, FALLBACK_COPY_GRAMS } = require("./parcelWeight");
const { labelRatesFor, isPurchasableRate, isSoldRate: isSoldRateName, isCanadaPostRate: isCanadaPostRateName, soldName } = require("./labelRates");
const { needsCustoms, customsItems, customsDeclaration } = require("./customs");

function shippingLabelEndpoints({ onBrowserRequest, SHIPPO_API_TOKEN, applyCors, admin, requireAdmin, db, getShippoToken, callShippo, IS_EMULATOR, originAddress, getStateCode, getCountryCode }) {
  const createShippingLabel = onBrowserRequest(
    { secrets: [SHIPPO_API_TOKEN] },
    async (req, res) => {
      if (applyCors(req, res)) return;

      if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
      }

      // Buying a label spends real money on the Shippo account — admin only.
      const adminUser = await requireAdmin(req, res);
      if (!adminUser) return;

      const { orderId, mode, shipmentId, rateId } = req.body;
      if (!orderId) {
        res.status(400).json({ error: "Missing orderId" });
        return;
      }

      // When mode === "shippoOrder" we only stage a pre-filled order in the
      // Shippo dashboard (no money spent) and return this URL for the admin to
      // finish buying the label on Shippo's site.
      const SHIPPO_DASHBOARD_URL = "https://app.goshippo.com/orders";

      try {
        const orderRef = db.collection("orders").doc(orderId);
        const orderDoc = await orderRef.get();
        if (!orderDoc.exists) {
          res.status(404).json({ error: "Order not found" });
          return;
        }

        const order = orderDoc.data();
        const operationsRef = db.collection("order-operations").doc(orderId);
        const operations = (await operationsRef.get()).data() || {};
        // The owner checked Shippo after an uncertain purchase and confirmed no label was bought
        // (or voided it there): unlock buying a new one. Recorded in the private order history.
        if (mode === "clearPurchaseLock") {
          const now = new Date().toISOString();
          const cleared = await db.runTransaction(async tx => {
            const fresh = (await tx.get(operationsRef)).data() || {};
            if (!fresh.labelPurchasePending) return false;
            tx.set(operationsRef, {
              labelPurchasePending: false,
              labelPurchaseClearedAt: now,
              labelPurchaseClearedBy: adminUser.email || "admin",
              updatedAt: now,
              activity: admin.firestore.FieldValue.arrayUnion({ type: "event", createdAt: now,
                message: `Owner checked Shippo and allowed a new label purchase (pending purchase started ${fresh.labelPurchaseStartedAt || "earlier"} cleared).` }),
            }, { merge: true });
            return true;
          });
          if (!cleared) { res.status(409).json({ error: "No label purchase is waiting to be checked. Reload the order." }); return; }
          res.status(200).json({ cleared: true });
          return;
        }
        // Void a label that won't be used (wrong label, or the order was cancelled/refunded before the parcel
        // left): ask Shippo for the refund (or accept the owner's word that they did it there), take the
        // label off the order and follow the refund (labelRefunds, checked by unpaidPaymentSweep). Never
        // after the parcel was handed over. Rules: functions/labelVoid.js.
        if (mode === "voidLabel") {
          const confirmedElsewhere = req.body.confirmedElsewhere === true;
          if (!order.labelUrl) { res.status(409).json({ error: "This order has no label to void." }); return; }
          if (labelHandedOver(order)) { res.status(409).json({ error: "The parcel has already been handed over, so its label is in use. To fix the tracking number, use Correct tracking instead." }); return; }
          if (operations.labelPurchasePending) { res.status(409).json({ error: "A label purchase is pending. Check Shippo first." }); return; }
          const keepWords = "If you already voided it in Shippo, tick \"I already voided it in Shippo\".";
          let refundStatus = "VOIDED_IN_SHIPPO";
          let refundId = null;
          let transactionId = operations.shippoTransactionId || null;
          if (!confirmedElsewhere) {
            const voidToken = await getShippoToken();
            if (!voidToken) { res.status(500).json({ error: "SHIPPO_API_TOKEN is not configured." }); return; }
            // Labels bought before the transaction number was saved: find it in Shippo by tracking number.
            if (!transactionId && order.trackingNumber) {
              const since = new Date(Date.now() - (LABEL_REFUND_WINDOW_DAYS + 5) * 24 * 60 * 60 * 1000).toISOString().slice(0, 19);
              try {
                for (let page = 1; page <= 5 && !transactionId; page++) {
                  const list = await callShippo(`transactions/?results=100&page=${page}&object_created_gte=${since}`, "GET", null, voidToken);
                  transactionId = findLabelTransaction(list?.results, order.trackingNumber)?.object_id || null;
                  if (!list?.next) break;
                }
              } catch (err) { console.warn("voidLabel: transaction lookup failed:", err.message); }
            }
            if (!transactionId) {
              res.status(409).json({ error: `Shippo has no label with tracking number ${order.trackingNumber || "(none)"} from the last ${LABEL_REFUND_WINDOW_DAYS} days, so it can't be voided from here. ${keepWords}`, needsConfirmation: true });
              return;
            }
            // Read the label first: never ask twice, and never void a label that belongs to another parcel.
            let transaction;
            try { transaction = await callShippo(`transactions/${encodeURIComponent(transactionId)}/`, "GET", null, voidToken); }
            catch (err) { res.status(502).json({ error: `Couldn't reach Shippo to check the label: ${String(err.message || err).replace(/^Shippo API error: /, "").slice(0, 200)}. Try again in a minute.` }); return; }
            if (order.trackingNumber && transaction?.tracking_number && String(transaction.tracking_number).replace(/\s+/g, "") !== String(order.trackingNumber).replace(/\s+/g, "")) {
              res.status(409).json({ error: `The saved Shippo label (${transaction.tracking_number}) doesn't match this order's tracking number (${order.trackingNumber}). Check the order in Shippo. ${keepWords}`, needsConfirmation: true });
              return;
            }
            const already = transactionRefundState(transaction);
            if (already === "rejected") { res.status(409).json({ error: `Shippo already refused a refund for this label (the carrier scanned or used it). ${keepWords}`, needsConfirmation: true }); return; }
            if (already) refundStatus = String(transaction.status || "").toUpperCase();
            else {
              let refund;
              try { refund = await callShippo("refunds/", "POST", { transaction: transactionId, async: false }, voidToken); }
              catch (err) { res.status(409).json({ error: `Shippo would not void the label: ${String(err.message || err).replace(/^Shippo API error: /, "").slice(0, 300)}. Labels can be refunded only if unused and bought in the last ${LABEL_REFUND_WINDOW_DAYS} days. ${keepWords}`, needsConfirmation: true }); return; }
              refundStatus = String(refund?.status || "QUEUED").toUpperCase();
              refundId = refund?.object_id || null;
              if (refundStatus === "ERROR") { res.status(409).json({ error: `Shippo refused to void this label (it may already be used or older than ${LABEL_REFUND_WINDOW_DAYS} days). ${keepWords}`, needsConfirmation: true }); return; }
            }
          }
          const nowIso = new Date().toISOString();
          const by = adminUser.email || "admin";
          const old = { trackingNumber: order.trackingNumber || null, trackingCarrier: order.trackingCarrier || null, labelUrl: order.labelUrl, shippoTransactionId: transactionId };
          const entry = confirmedElsewhere ? null : refundEntry({ transactionId, refundId, trackingNumber: old.trackingNumber, carrier: old.trackingCarrier, status: refundStatus, at: nowIso, by });
          const finished = terminalOrder(order);
          const replaced = await db.runTransaction(async tx => {
            const [freshOrder, freshOps] = await Promise.all([tx.get(orderRef), tx.get(operationsRef)]);
            const current = freshOrder.data() || {};
            const ops = freshOps.data() || {};
            if (!current.labelUrl || current.labelUrl !== order.labelUrl || labelHandedOver(current) || ops.labelPurchasePending) return false;
            const del = admin.firestore.FieldValue.delete();
            const refunds = entry ? [...(Array.isArray(ops.labelRefunds) ? ops.labelRefunds : []), entry].slice(-20) : ops.labelRefunds;
            const words = entry ? (entry.state === "refunded" ? "refunded by Shippo" : "refund requested from Shippo") : "voided in Shippo by the owner";
            tx.update(orderRef, { labelUrl: del, trackingNumber: del, trackingCarrier: del, trackingUrl: del, updatedAt: nowIso,
              activity: admin.firestore.FieldValue.arrayUnion({ type: "note", createdAt: nowIso, message: `Label #${old.trackingNumber || ""} voided${finished ? "" : " so a new one can be bought"}.` }) });
            tx.set(operationsRef, { shippoTransactionId: del, labelTest: del, quotedShipmentId: del, quotedAddress: del, updatedAt: nowIso,
              ...(entry ? { labelRefunds: refunds, labelRefundOpen: openRefunds(refunds).length > 0 } : {}),
              labelHistory: admin.firestore.FieldValue.arrayUnion({ ...old, voidedAt: nowIso, voidedBy: by, refundStatus, refundId }),
              activity: admin.firestore.FieldValue.arrayUnion({ type: "event", createdAt: nowIso, message: `Label #${old.trackingNumber || ""} voided (${words}).` }) }, { merge: true });
            return true;
          });
          if (!replaced) { res.status(409).json({ error: "The order changed. Reload it and try again." }); return; }
          res.status(200).json({ voided: true, refundStatus, refundState: entry ? entry.state : "elsewhere" });
          return;
        }
        const preparationProblem = labelProblem(order, operations);
        if (preparationProblem) { res.status(409).json({ error: preparationProblem }); return; }
        // A transaction claims any money-spending request. Uncertain failures remain
        // locked so retrying cannot silently buy a second label.
        const claimPurchase = async () => db.runTransaction(async tx => {
          const freshOrder = await tx.get(orderRef);
          const freshOperations = await tx.get(operationsRef);
          const current = freshOperations.data() || {};
          const problem = labelProblem(freshOrder.data() || {}, current);
          if (problem) throw new Error(problem);
          if (mode === "purchase" && (current.quotedShipmentId !== shipmentId || current.quotedAddress !== JSON.stringify(freshOrder.data().customer.address))) throw new Error("Label quote changed or expired. Refresh the rates.");
          tx.set(operationsRef, { labelPurchasePending: true, labelPurchaseStartedAt: new Date().toISOString() }, { merge: true });
        });
        const completePurchase = async () => operationsRef.set({ labelPurchasePending: false }, { merge: true });
        // Shippo answered with a definite refusal (status ERROR): no label was bought, so the
        // lock is released (with a history entry) and Shippo's own reasons reach the owner.
        // Anything uncertain (network errors, QUEUED/WAITING) keeps the lock for reconciliation.
        const failedPurchase = async transaction => {
          const outcome = shippoTransactionOutcome(transaction);
          if (outcome.definiteFailure) {
            const now = new Date().toISOString();
            await operationsRef.set({ labelPurchasePending: false, updatedAt: now,
              activity: admin.firestore.FieldValue.arrayUnion({ type: "event", createdAt: now, message: `Shippo refused the label purchase; no label was bought. ${outcome.message}` }) }, { merge: true });
          }
          return new Error(outcome.message);
        };
        // Shippo answered with an HTTP 4xx (expired rate, invalid parcel, wrong key): a definite refusal,
        // nothing was bought, so the lock is released. 5xx and network errors stay uncertain.
        const refusedPurchase = async err => {
          const detail = String(err?.message || "").replace(/^Shippo API error: \d+ - /, "").slice(0, 400);
          const now = new Date().toISOString();
          await operationsRef.set({ labelPurchasePending: false, updatedAt: now,
            activity: admin.firestore.FieldValue.arrayUnion({ type: "event", createdAt: now, message: `Shippo refused the label purchase (HTTP ${err.shippoStatus}); no label was bought. ${detail}` }) }, { merge: true });
          return new Error(`Shippo refused the label purchase${detail ? `: ${detail}` : "."} Nothing was bought. Fix the problem and try again.`);
        };
        const orderMetadata = `Order ${order.orderId || orderId}`.slice(0, 100);
        // Buys one rate. The Shippo transaction id is saved against the order (order-operations) BEFORE the
        // order itself is updated, so an interrupted purchase can be found and reconciled in Shippo.
        const buyRate = async (rateObjectId, shippoOrderId) => {
          const body = { rate: rateObjectId, async: false, metadata: orderMetadata, ...(shippoOrderId ? { order: shippoOrderId } : {}) };
          let transaction;
          try {
            transaction = await callShippo("transactions/", "POST", body, shippoToken, 45000);
          } catch (err) {
            if (!shippoDefiniteRefusal(err)) throw err;
            // A definite refusal bought nothing. If it may be about the linked Shippo Order, buy unlinked once.
            if (!shippoOrderId) throw await refusedPurchase(err);
            console.warn("Shippo refused the label linked to its order; retrying without the link:", err?.message || err);
            try {
              transaction = await callShippo("transactions/", "POST", { rate: rateObjectId, async: false, metadata: orderMetadata }, shippoToken, 45000);
            } catch (retryErr) {
              if (shippoDefiniteRefusal(retryErr)) throw await refusedPurchase(retryErr);
              throw retryErr;
            }
          }
          const save = () => operationsRef.set({ shippoTransactionId: transaction.object_id || null, shippoTransactionStatus: transaction.status || null,
            shippoRateId: rateObjectId, shippoTransactionAt: new Date().toISOString() }, { merge: true });
          try { await save(); } catch { await save(); }
          if (transaction.status !== "SUCCESS") throw await failedPurchase(transaction);
          if (!transaction.label_url || !transaction.tracking_number) {
            throw new Error(`Shippo bought the label (transaction ${transaction.object_id || "unknown"}) but did not return its tracking number and label link. Open it in Shippo; the transaction number is saved on this order.`);
          }
          return transaction;
        };
        // Order update + lock release in one transaction, so the label is never half recorded.
        const recordLabel = async (transaction, carrierFallback) => {
          const now = new Date().toISOString();
          const trackingNumber = transaction.tracking_number;
          const trackingCarrier = transaction.tracking_provider || carrierFallback || "Carrier";
          const labelUrl = transaction.label_url;
          await db.runTransaction(async tx => {
            tx.update(orderRef, { labelUrl, trackingNumber, trackingCarrier, updatedAt: now,
              activity: admin.firestore.FieldValue.arrayUnion({ type: "note", message: `Shipping Label #${trackingNumber} generated via dashboard. Carrier: ${trackingCarrier}.`, createdAt: now }) });
            // A test-mode key (or Shippo's own test flag) makes a sandbox label: no real postage, tracking never tracks.
            tx.set(operationsRef, { labelPurchasePending: false, shippoTransactionId: transaction.object_id || null, labelBoughtAt: now, labelTest: transaction.test === true || /^shippo_test_/.test(String(shippoToken || "")) }, { merge: true });
          });
          return { labelUrl, trackingNumber, trackingCarrier };
        };
        if (order.isTest === true) {
          res.status(400).json({ error: "Test orders are excluded from fulfillment." });
          return;
        }
        if (!order.customer || !order.customer.address) {
          res.status(400).json({ error: "Order has no customer address data" });
          return;
        }
        if (addressMissing(order.customer.address).length) {
          res.status(400).json({ error: "The shipping address is incomplete for this country. Correct it in the order first." });
          return;
        }

        // 1. Resolve Settings (API keys and Origin address)
        const settingsDoc = await db.collection("settings").doc("website").get();
        const settings = settingsDoc.data() || {};

        const shippoToken = await getShippoToken();

        if (!shippoToken) {
          if (!IS_EMULATOR) {
            // Never hand out fake tracking numbers on real orders.
            const reason = mode === "shippoOrder"
              ? "SHIPPO_API_TOKEN is not configured — cannot push the order to Shippo."
              : "SHIPPO_API_TOKEN is not configured — cannot generate a real shipping label.";
            res.status(500).json({ error: reason });
            return;
          }
          if (mode === "shippoOrder") {
            // Dev fallback: skip the API call, just hand back the dashboard URL.
            console.warn("Shippo token missing — skipping order push (Dev Fallback).");
            res.status(200).json({ dashboardUrl: SHIPPO_DASHBOARD_URL, shippoOrderId: null });
            return;
          }
          console.warn("Using dev label generation fallback (mock PDF and tracking).");
          const mockTracking = `MOCK-${Math.floor(10000000 + Math.random() * 90000000)}`;
          const mockLabelUrl = "https://goshippo.com/wp-content/uploads/2016/04/Shippo_Label.pdf";
          
          await claimPurchase();
          await orderRef.update({
            labelUrl: mockLabelUrl,
            trackingNumber: mockTracking,
            trackingCarrier: "USPS (Sandbox)",
            updatedAt: new Date().toISOString(),
            activity: admin.firestore.FieldValue.arrayUnion({ 
                type: "note", 
                message: `Shipping Label #${mockTracking} generated via dashboard (Dev Fallback).`, 
                createdAt: new Date().toISOString() 
              })
          });

          await completePurchase();
          res.status(200).json({
            labelUrl: mockLabelUrl,
            trackingNumber: mockTracking,
            trackingCarrier: "USPS (Sandbox)"
          });
          return;
        }

        const addressFrom = originAddress(settings);

        // 2. Resolve Destination Address
        const dest = order.customer.address;
        const addressTo = {
          name: order.customer.name || "Customer",
          street1: dest.street,
          street2: dest.unit || "",
          city: dest.city,
          state: getStateCode(dest.state),
          zip: dest.zip,
          country: getCountryCode(dest.country),
          phone: order.customer.phone || "",
          email: order.customer.email
        };

        // A Shippo Order for this website order. Labels bought through the API without one show up in the
        // Shippo dashboard with an empty Order column and can't be managed (refunded) from there, so every
        // purchase is linked to one. Reused while the address is unchanged; a new one after a correction.
        const shippoOrderBody = () => {
          const currency = (order.checkoutCurrency || order.currency || "CAD").toUpperCase();
          const orderItems = (order.items || []).filter(item => item && isPhysicalItem(item));
          return {
            to_address: addressTo,
            from_address: addressFrom,
            line_items: orderItems.map(item => {
              const qty = item.quantity || 1;
              return {
                title: String(item.title || "Item").slice(0, 200),
                quantity: qty,
                total_price: ((item.price || 0) * qty).toFixed(2),
                currency,
                weight: String(Math.round(lineCopyGrams(item) * qty)),
                weight_unit: "g",
                sku: String(item.id || item.sku || "")
              };
            }),
            placed_at: order.createdAt || new Date().toISOString(),
            order_number: order.orderId || orderId,
            order_status: "PAID",
            shipping_cost: (order.shipping || 0).toFixed(2),
            shipping_cost_currency: currency,
            subtotal_price: (order.subtotal || 0).toFixed(2),
            total_price: (order.total || 0).toFixed(2),
            total_tax: (order.tax || 0).toFixed(2),
            currency,
            weight: parcelGrams(orderItems.reduce((sum, item) => sum + lineCopyGrams(item) * (item.quantity || 1), 0)),
            weight_unit: "g"
          };
        };
        const addressKey = JSON.stringify(order.customer.address);
        const createShippoOrder = async () => {
          const shippoOrder = await callShippo("orders/", "POST", shippoOrderBody(), shippoToken);
          const id = shippoOrder.object_id || null;
          if (id) {
            const now = new Date().toISOString();
            await Promise.all([
              orderRef.update({ shippoOrderId: id, updatedAt: now }),
              operationsRef.set({ shippoOrderId: id, shippoOrderAddress: addressKey }, { merge: true }),
            ]);
          }
          return id;
        };
        // Never blocks a purchase: if Shippo won't create the Order, the label is still bought (unlinked).
        const linkedShippoOrder = async () => {
          if (order.shippoOrderId && operations.shippoOrderId === order.shippoOrderId && operations.shippoOrderAddress === addressKey) return order.shippoOrderId;
          try { return await createShippoOrder(); }
          catch (err) { console.warn("Could not create the Shippo order for the label:", err?.message || err); return null; }
        };

        if (mode === "purchase") {
          if (!shipmentId || !rateId) {
            res.status(400).json({ error: "Choose a Canada Post rate before buying the label." });
            return;
          }
          const quotedShipment = await callShippo(`shipments/${encodeURIComponent(shipmentId)}/`, "GET", null, shippoToken);
          const chosenRate = (quotedShipment.rates || []).find(rate => rate.object_id === rateId);
          if (!chosenRate || !isPurchasableRate(chosenRate, order)) {
            res.status(400).json({ error: "That rate is no longer available. Refresh the choices and try again." });
            return;
          }
          const shippoOrderId = await linkedShippoOrder();
          await claimPurchase();
          const transaction = await buyRate(chosenRate.object_id, shippoOrderId);
          res.status(200).json(await recordLabel(transaction, chosenRate.provider || "Canada Post"));
          return;
        }

        // Push-to-Shippo mode: stage a pre-filled Order in the Shippo dashboard
        // (no label purchased) and return the site URL for the admin to finish.
        if (mode === "shippoOrder") {
          const shippoOrderId = await createShippoOrder();
          await orderRef.update({
            updatedAt: new Date().toISOString(),
            activity: admin.firestore.FieldValue.arrayUnion({
                type: "note",
                message: "Order pushed to Shippo dashboard for label creation.",
                createdAt: new Date().toISOString()
              })
          });

          res.status(200).json({
            dashboardUrl: SHIPPO_DASHBOARD_URL,
            shippoOrderId,
            orderNumber: order.orderId || orderId
          });
          return;
        }

        // 3. Define Parcel (scale weight by quantity or use custom parameters from req.body)
        const totalQty = (order.items || []).reduce((sum, item) => sum + (item.quantity || 1), 0);
        const customParcel = req.body.parcel || {};
        const parcel = {
          length: customParcel.length ? String(customParcel.length) : "10",
          width: customParcel.width ? String(customParcel.width) : "8",
          height: customParcel.height ? String(customParcel.height) : "2",
          distance_unit: customParcel.distance_unit || "in",
          weight: customParcel.weight ? String(customParcel.weight) : String(Math.round(FALLBACK_COPY_GRAMS * totalQty)),
          // The label dialog sends grams; an older open admin tab may still send "lb".
          mass_unit: ["g", "kg", "oz", "lb"].includes(customParcel.mass_unit) ? customParcel.mass_unit : (customParcel.weight ? "lb" : "g")
        };

        // 3b. Customs paperwork for a parcel that crosses a border (item description, tariff number,
        // value and origin per book; Books › edit › Details › Customs). No money is spent here.
        let customsDeclarationId;
        if (needsCustoms(addressFrom.country, addressTo.country)) {
          const lines = (order.items || []).filter(item => item && isPhysicalItem(item));
          const bookIds = [...new Set(lines.map(item => item.id).filter(Boolean))];
          const bookDocs = await Promise.all(bookIds.map(id => db.collection("books").doc(String(id)).get()));
          const booksById = Object.fromEntries(bookDocs.filter(doc => doc.exists).map(doc => [doc.id, doc.data()]));
          const items = customsItems(order, booksById, addressFrom.country);
          if (items.length) {
            const itemIds = [];
            for (const item of items) itemIds.push((await callShippo("customs/items/", "POST", item, shippoToken)).object_id);
            const declaration = await callShippo("customs/declarations/", "POST",
              customsDeclaration(itemIds, order, addressFrom.name || addressFrom.company, addressFrom.country), shippoToken);
            if (String(declaration.object_status || declaration.object_state || "").toUpperCase() === "INVALID") {
              const why = (declaration.messages || []).map(m => m?.text || m).filter(Boolean).join("; ");
              throw new Error(`Shippo rejected the customs details${why ? `: ${why}` : "."} Check the book's customs fields in Books › edit › Details.`);
            }
            customsDeclarationId = declaration.object_id;
          }
        }

        // 4. Create Shipment on Shippo
        const shipment = await callShippo("shipments/", "POST", {
          address_from: addressFrom,
          address_to: addressTo,
          parcels: [parcel],
          ...(customsDeclarationId ? { customs_declaration: customsDeclarationId } : {}),
          metadata: orderMetadata,
          async: false
        }, shippoToken);

        const rates = shipment.rates || [];
        if (rates.length === 0) {
          throw new Error("No shipping rates returned by Shippo.");
        }

        if (mode === "rates") {
          await operationsRef.set({ quotedShipmentId: shipment.object_id, quotedAddress: JSON.stringify(order.customer.address) }, { merge: true });
          // Canada Post, plus the exact service the customer paid for when checkout sold another carrier's.
          const offered = labelRatesFor(rates, order);
          res.status(200).json({ shipmentId: shipment.object_id, customs: !!customsDeclarationId, rates: offered.map(rate => ({
            id: rate.object_id,
            name: isCanadaPostRateName(rate) ? (rate.servicelevel?.name || "Canada Post") : soldName(rate),
            carrier: rate.provider || "",
            soldService: isSoldRateName(rate, order),
            amount: Number(rate.amount),
            currency: rate.currency || "CAD",
            estimatedDays: Number.isFinite(Number(rate.estimated_days)) ? Number(rate.estimated_days) : null,
            durationTerms: rate.duration_terms || ""
          })) });
          return;
        }

        // 5. Select cheapest rate
        const cheapestRate = rates.reduce((min, rate) => {
          const rateVal = parseFloat(rate.amount);
          const minVal = parseFloat(min.amount);
          return rateVal < minVal ? rate : min;
        }, rates[0]);

        const shippoOrderId = await linkedShippoOrder();
        await claimPurchase();
        // 6. Purchase Rate to create Transaction (Label); its id is saved before the order is updated.
        const transaction = await buyRate(cheapestRate.object_id, shippoOrderId);
        // 7. Update the order and release the lock together
        res.status(200).json(await recordLabel(transaction, cheapestRate.provider));

      } catch (err) {
        console.error("createShippingLabel failed:", err);
        res.status(500).json({ error: err.message });
      }
    }
  );

  return { createShippingLabel };
}

module.exports = { shippingLabelEndpoints };
