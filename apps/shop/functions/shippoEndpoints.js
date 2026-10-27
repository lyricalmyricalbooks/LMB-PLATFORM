// Shippo endpoints: Settings › Shipping's Shippo connection (config, dynamic rates, saved key), live carrier rates at
// checkout, the checkout address check and address finder, and the tracking webhook. Moved out of index.js as is
// (functions/CLAUDE.md › Cloud Functions › Action table): index.js passes in its own Firebase wrappers, db, guards and
// Shippo helpers, so the vm-based handler tests' fakes still apply, and keeps each `exports.<name> =` line.

function shippoEndpoints({
  onBrowserRequest, onRequest, db, applyCors, requireAdmin, hitLimit, LIMITS, IS_EMULATOR, RESEND_API_KEY,
  SHIPPO_API_TOKEN, SHIPPO_CONFIG_DOC, ADDRESS_ACTIONS, FALLBACK_COPY_GRAMS, addressKeyProblem, addressMissing,
  advancesTracking, bundleComponents, callShippo, catalogDigital, catalogFormat, checkoutRate,
  cleanLiveRateExtra, getCountryCode, getShippoToken, getStateCode, handleAddressLookup, isPhysicalItem,
  itemWeightGrams, liveRateExtra, originAddress, parcelGrams, publicErrorMessage, readAdminSecret,
  withLiveRateExtra,
}) {
  // ──────────────────────────────────────────────────────────────
  // 7. HTTP Endpoint: Validate Address via Shippo (Secure)
  // ──────────────────────────────────────────────────────────────
  // "live" or "test" from the key's own prefix (shippo_live_… / shippo_test_…); null when it is neither.
  const shippoKeyMode = key => /^shippo_live_/.test(String(key || "")) ? "live" : /^shippo_test_/.test(String(key || "")) ? "test" : null;

  const getShippoConfig = onBrowserRequest({ secrets: [SHIPPO_API_TOKEN] }, async (req, res) => {
    if (applyCors(req, res)) return;
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const adminUser = await requireAdmin(req, res);
    if (!adminUser) return;

    try {
      const configDoc = await SHIPPO_CONFIG_DOC.get();
      const config = configDoc.exists ? configDoc.data() : {};
      const fallbackToken = await getShippoToken();
      res.status(200).json({
        configured: Boolean(fallbackToken),
        source: configDoc.exists && config?.apiToken ? "firebase" : fallbackToken ? "environment" : null,
        lastFour: config?.lastFour || (fallbackToken ? fallbackToken.slice(-4) : null),
        // Which Shippo account the key in use belongs to: a test key buys sandbox labels with no postage.
        mode: shippoKeyMode(fallbackToken),
        verifiedAt: config?.apiToken ? config?.verifiedAt || null : null,
        updatedAt: config?.updatedAt || null,
        dynamicRatesEnabled: config?.dynamicRatesEnabled ?? false,
        dynamicRateCountries: Array.isArray(config?.dynamicRateCountries) ? config.dynamicRateCountries : [],
        liveRateExtra: { enabled: config?.liveRateExtra?.enabled === true, amount: Number(config?.liveRateExtra?.amount) || 0 },
      });
    } catch (err) {
      console.error("getShippoConfig failed:", err);
      res.status(500).json({ error: "Unable to load Shippo configuration." });
    }
  });

  const setShippoDynamicRates = onBrowserRequest(async (req, res) => {
    if (applyCors(req, res)) return;
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const adminUser = await requireAdmin(req, res);
    if (!adminUser) return;

    const enabled = Boolean(req.body?.enabled);
    const dynamicRateCountries = Array.isArray(req.body?.countries)
      ? [...new Set(req.body.countries.map(country => String(country).trim().toUpperCase()).filter(country => /^[A-Z]{2}$/.test(country)))].slice(0, 250)
      : null;
    let extra;
    try {
      extra = cleanLiveRateExtra(req.body?.extra);
    } catch (err) {
      res.status(400).json({ error: err.message });
      return;
    }

    try {
      const configDoc = await SHIPPO_CONFIG_DOC.get();
      const current = configDoc.exists ? configDoc.data() : {};
      await SHIPPO_CONFIG_DOC.set({
        ...current,
        dynamicRatesEnabled: enabled,
        ...(dynamicRateCountries ? { dynamicRateCountries } : {}),
        ...(extra ? { liveRateExtra: extra } : {}),
        updatedAt: new Date().toISOString(),
        updatedBy: adminUser.email,
      });
      res.status(200).json({
        success: true,
        dynamicRatesEnabled: enabled,
        dynamicRateCountries: dynamicRateCountries ?? current.dynamicRateCountries ?? [],
        liveRateExtra: extra ?? current.liveRateExtra ?? { enabled: false, amount: 0 },
      });
    } catch (err) {
      console.error("setShippoDynamicRates failed:", err);
      res.status(500).json({ error: "Unable to update Shippo dynamic rates setting." });
    }
  });

  const getShippoRates = onBrowserRequest(
    { secrets: [SHIPPO_API_TOKEN] },
    async (req, res) => {
      if (applyCors(req, res)) return;

      if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
      }
      if (!(await hitLimit(db, "shippo", req, LIMITS.shippo))) return res.status(429).json({ error: "Too many tries. Please wait a few minutes and try again." });

      const { address, items } = req.body;
      if (!address || !items || !Array.isArray(items)) {
        res.status(400).json({ error: "Missing address or items" });
        return;
      }
      // Same bounds as the other cart endpoints: one Firestore read is made per line, so the list is capped
      // and every id must be a plain document id before anything is read (#107).
      if (items.length > 50 || !items.every(item => item && typeof item === "object" && typeof item.id === "string" && item.id && item.id.length <= 160 && !item.id.includes("/"))) {
        res.status(400).json({ error: "Check the selected books." });
        return;
      }

      try {
        const configDoc = await SHIPPO_CONFIG_DOC.get();
        const config = configDoc.exists ? configDoc.data() : {};
        if (config.dynamicRatesEnabled !== true) {
          res.status(400).json({ error: "Dynamic rates are disabled" });
          return;
        }

        const destinationCountry = getCountryCode(address.country);
        const enabledCountries = Array.isArray(config.dynamicRateCountries) ? config.dynamicRateCountries : [];
        if (!enabledCountries.includes(destinationCountry)) {
          res.status(200).json({ rates: [], useRegularRates: true });
          return;
        }

        const shippoToken = await getShippoToken();
        if (!shippoToken) {
          res.status(400).json({ error: "Shippo is not configured" });
          return;
        }

        const settingsDoc = await db.collection("settings").doc("website").get();
        const settings = settingsDoc.data() || {};

        const addressFrom = originAddress(settings);

        const addressTo = {
          name: address.name || "Customer",
          street1: address.street,
          street2: address.unit || "",
          city: address.city,
          state: getStateCode(address.state),
          zip: address.zip,
          country: getCountryCode(address.country),
        };

        const totalQty = items.reduce((sum, item) => sum + (item.quantity || 1), 0);
        if (totalQty === 0) {
          res.status(200).json({ rates: [] });
          return;
        }

        const bookRefs = items.map(item => db.collection("books").doc(item.id));
        const bookDocs = await Promise.all(bookRefs.map(ref => ref.get()));

        // Same parcel weight as the charge path (resolveShipping): physical items only,
        // catalog weights read as grams ("450 g", "0.5 kg", bare numbers = grams).
        let totalWeightG = 0;
        for (const [index, item] of items.entries()) {
          const bookDoc = bookDocs[index];
          if (!bookDoc.exists) continue;
          const book = bookDoc.data();
          const variant = item.variantId ? (book.variants || []).find(v => v.id === item.variantId) || null : null;
          const line = { format: catalogFormat(book, variant), digital: catalogDigital(book, variant), isDigital: catalogDigital(book, variant) };
          if (!isPhysicalItem(line)) continue;
          const qty = Math.max(1, Math.min(99, Math.floor(Number(item.quantity) || 1)));
          let grams = Number(itemWeightGrams(book, variant));
          // A box set without its own weight weighs what its books weigh (as priceOrder does).
          const parts = bundleComponents(book);
          if (!(grams > 0) && parts.length) {
            const partDocs = await Promise.all(parts.map(part => db.collection("books").doc(part.id).get()));
            const partWeights = partDocs.map((doc, i) => {
              if (!doc.exists) return null;
              const partBook = doc.data();
              const partVariant = parts[i].variantId ? (partBook.variants || []).find(v => v.id === parts[i].variantId) || null : null;
              return itemWeightGrams(partBook, partVariant);
            });
            if (partWeights.every(w => w != null)) grams = partWeights.reduce((sum, w, i) => sum + w * parts[i].quantity, 0);
          }
          totalWeightG += (Number.isFinite(grams) && grams > 0 ? grams : FALLBACK_COPY_GRAMS) * qty;
        }
        if (totalWeightG === 0) {
          res.status(200).json({ rates: [], useRegularRates: true });
          return;
        }

        const parcel = {
          length: "10",
          width: "8",
          height: "2",
          distance_unit: "in",
          weight: parcelGrams(totalWeightG),
          mass_unit: "g"
        };

        const shipment = await callShippo("shipments/", "POST", {
          address_from: addressFrom,
          address_to: addressTo,
          parcels: [parcel],
          async: false
        }, shippoToken);

        const rates = shipment.rates || [];
        const extra = liveRateExtra(config);
        const formattedRates = rates.map(checkoutRate).map((rate) => extra ? { ...rate, price: withLiveRateExtra(rate.price, extra), base: withLiveRateExtra(rate.base, extra) } : rate);

        res.status(200).json({ rates: formattedRates });
      } catch (err) {
        console.error("getShippoRates failed:", err);
        res.status(500).json({ error: publicErrorMessage(err, "Something went wrong. Please try again.") });
      }
    }
  );

  const saveShippoConfig = onBrowserRequest(async (req, res) => {
    if (applyCors(req, res)) return;
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const adminUser = await requireAdmin(req, res);
    if (!adminUser) return;

    const apiToken = typeof req.body?.apiToken === "string" ? req.body.apiToken.trim() : "";
    if (apiToken.length < 20 || apiToken.length > 250 || /\s/.test(apiToken)) {
      res.status(400).json({ error: "Enter a valid Shippo API key without spaces." });
      return;
    }
    const mode = shippoKeyMode(apiToken);
    if (!mode) {
      res.status(400).json({ error: "That doesn't look like a Shippo API key. Live keys start with shippo_live_ and test keys with shippo_test_." });
      return;
    }
    // Ask Shippo before saving: a typo'd key must never replace a working one.
    try {
      await callShippo("carrier_accounts/?results=1", "GET", null, apiToken, 8000);
    } catch (err) {
      if ([401, 403].includes(Number(err?.shippoStatus))) {
        res.status(400).json({ error: "Shippo did not accept this key. Copy it again from Shippo › Settings › API; nothing was saved." });
      } else {
        res.status(502).json({ error: "Couldn't reach Shippo to check the key, so it was not saved. Try again in a minute." });
      }
      return;
    }

    try {
      const updatedAt = new Date().toISOString();
      await SHIPPO_CONFIG_DOC.set({
        apiToken,
        lastFour: apiToken.slice(-4),
        mode,
        verifiedAt: updatedAt,
        updatedAt,
        updatedBy: adminUser.email,
      }, { merge: true });
      const saved = (await SHIPPO_CONFIG_DOC.get()).data() || {};
      res.status(200).json({
        configured: true,
        source: "firebase",
        lastFour: apiToken.slice(-4),
        mode,
        verifiedAt: updatedAt,
        updatedAt,
        dynamicRatesEnabled: saved.dynamicRatesEnabled ?? false,
        dynamicRateCountries: Array.isArray(saved.dynamicRateCountries) ? saved.dynamicRateCountries : [],
      });
    } catch (err) {
      console.error("saveShippoConfig failed:", err);
      res.status(500).json({ error: "Unable to save the Shippo API key." });
    }
  });

  // The Google key for the checkout address finder (admin-only adminSecrets/addressLookup), read at most
  // once a minute per instance: the finder asks on nearly every keystroke.
  let addressKeyCache = { at: 0, key: "" };

  async function readAddressLookupKey(fresh = false) {
    if (!fresh && Date.now() - addressKeyCache.at < 60 * 1000) return addressKeyCache.key;
    const key = String((await readAdminSecret("addressLookup")).googlePlacesKey || "").trim();
    addressKeyCache = { at: Date.now(), key: addressKeyProblem(key) ? "" : key };
    return addressKeyCache.key;
  }

  // One counter for the whole shop (rate limits are keyed by connection): caps what the key can cost per day.
  const SHOP_WIDE_REQUEST = { headers: { "x-forwarded-for": "shop-wide" } };

  const validateAddress = onBrowserRequest(
    { secrets: [SHIPPO_API_TOKEN] },
    async (req, res) => {
      if (applyCors(req, res)) return;

      if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
      }
      // Checkout address finder (Google Places through the shop's key) shares this endpoint.
      if (ADDRESS_ACTIONS.includes(req.body?.action)) {
        const out = await handleAddressLookup(req.body, {
          readKey: readAddressLookupKey,
          allow: async () => (await hitLimit(db, "address", req, LIMITS.address))
            && (await hitLimit(db, "address-shop-day", SHOP_WIDE_REQUEST, LIMITS.addressShopDay)),
          isAdmin: async () => Boolean(await requireAdmin(req, res)),
        });
        if (out) res.status(out.status).json(out.body);
        return;
      }

      if (!(await hitLimit(db, "shippo", req, LIMITS.shippo))) return res.status(429).json({ error: "Too many tries. Please wait a few minutes and try again." });

      const { address } = req.body;
      if (!address || addressMissing(address).length) {
        res.status(400).json({ error: "Missing address fields" });
        return;
      }

      try {
        const shippoToken = await getShippoToken();

        if (!shippoToken) {
          if (IS_EMULATOR) {
            console.warn("Using dev address verification fallback (emulator only).");
            const isTestInvalid = (address.street || "").toLowerCase().includes("invalid");
            if (isTestInvalid) {
              res.status(200).json({
                isValid: false,
                messages: [{
                  code: "address_not_found",
                  text: "The street address 'invalid' is not recognized by carrier databases.",
                  source: "USPS"
                }]
              });
            } else {
              res.status(200).json({ isValid: true, messages: [] });
            }
            return;
          }
          // In production a missing token must not silently "verify" every
          // address. Let checkout proceed, but flag the order as unverified.
          console.error("SHIPPO_API_TOKEN missing in production — address NOT verified.");
          res.status(200).json({
            isValid: true,
            unverified: true,
            messages: [{ code: "verification_unavailable", text: "Address verification service is not configured; address was not verified." }]
          });
          return;
        }

        const countryCode = getCountryCode(address.country);
        const stateCode = getStateCode(address.state);

        const shippoRes = await callShippo("addresses/", "POST", {
          name: address.name || "Customer",
          street1: address.street,
          street2: address.unit || "",
          city: address.city,
          state: stateCode,
          zip: address.zip,
          country: countryCode,
          validate: true
        }, shippoToken);

        const validationResults = shippoRes.validation_results || {};
        const isValid = validationResults.is_valid === true;

        res.status(200).json({
          isValid,
          messages: validationResults.messages || []
        });
      } catch (err) {
        console.error("validateAddress failed:", err);
        res.status(500).json({ error: publicErrorMessage(err, "Something went wrong. Please try again.") });
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // 12. HTTP Endpoint: Shippo Webhook Status Updates (Carrier Integration)
  // ──────────────────────────────────────────────────────────────
  const shippoWebhook = onRequest(
    { secrets: [RESEND_API_KEY, SHIPPO_API_TOKEN] },
    async (req, res) => {
      if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
      }

      const payload = req.body || {};
      const trackingNum = payload.data?.tracking_number;
      const carrier = payload.data?.carrier;

      if (!trackingNum) {
        console.warn("Shippo webhook invoked without tracking number.");
        res.status(400).send("Missing tracking number");
        return;
      }

      try {
        const snap = await db.collection("orders").where("trackingNumber", "==", trackingNum).limit(1).get();
        if (snap.empty) {
          console.log(`Shippo webhook: No order matches tracking number ${trackingNum}`);
          res.status(200).json({ success: true, message: "No matching order found" });
          return;
        }

        const orderDoc = snap.docs[0];
        const order = orderDoc.data();
        const orderId = orderDoc.id;
        // Only paid orders move to delivered; a refunded or cancelled order stays as it is.
        if (order.paymentStatus !== "paid") {
          res.status(200).json({ success: true, message: "Order is not in a deliverable state" });
          return;
        }

        // The webhook body is unsigned, so the status is read back from Shippo itself:
        // a forged "DELIVERED" for a known tracking number changes nothing.
        let trackingStatus = null;
        try {
          const token = await getShippoToken();
          const carrierCode = String(carrier || order.trackingCarrier || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
          if (token && carrierCode) {
            const track = await callShippo(`tracks/${encodeURIComponent(carrierCode)}/${encodeURIComponent(trackingNum)}`, "GET", null, token);
            trackingStatus = track?.tracking_status?.status || null;
          }
        } catch (err) {
          console.warn(`Shippo webhook: could not confirm tracking ${trackingNum}:`, err.message);
        }
        if (!trackingStatus) {
          res.status(200).json({ success: true, message: "Tracking status could not be confirmed with Shippo" });
          return;
        }

        const prevFulfillmentStatus = order.fulfillmentStatus;
        let nextFulfillmentStatus = null;
        let orderStatus = order.status;

        if (trackingStatus === "DELIVERED") {
          nextFulfillmentStatus = "delivered";
          orderStatus = "completed";
        } else if (trackingStatus === "OUT_FOR_DELIVERY") {
          nextFulfillmentStatus = "out_for_delivery";
        }

        // Forward only: "delivered" stays delivered, and nothing moves back to "out for delivery".
        // The check runs again inside the write so two quick updates cannot undo each other.
        let advanced = false;
        if (nextFulfillmentStatus && advancesTracking(prevFulfillmentStatus, nextFulfillmentStatus)) {
          advanced = await db.runTransaction(async tx => {
            const fresh = (await tx.get(orderDoc.ref)).data() || {};
            if (!advancesTracking(fresh.fulfillmentStatus, nextFulfillmentStatus)) return false;
            const newNote = {
              type: "event",
              message: `Shippo tracking update: ${trackingStatus.replace(/_/g, " ")}.`,
              createdAt: new Date().toISOString()
            };
            tx.update(orderDoc.ref, {
              fulfillmentStatus: nextFulfillmentStatus,
              status: orderStatus,
              activity: [...(fresh.activity || []), newNote],
              updatedAt: new Date().toISOString()
            });
            return true;
          });
        }
        // No customer email here: a shipped parcel's only email is the shipping one (see onOrderUpdated 2b).
        if (advanced) console.log(`Shippo tracking moved order ${orderId} to ${nextFulfillmentStatus}`);

        res.status(200).json({ success: true });
      } catch (err) {
        console.error("shippoWebhook error:", err);
        res.status(500).json({ error: err.message });
      }
    }
  );

  return { getShippoConfig, setShippoDynamicRates, getShippoRates, saveShippoConfig, validateAddress, shippoWebhook };
}

module.exports = { shippoEndpoints };
