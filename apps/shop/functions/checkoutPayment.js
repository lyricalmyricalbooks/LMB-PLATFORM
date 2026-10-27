// The payment steps of createStripeCheckoutSession, behind its checkout rate limit: a manual (pay at pickup, e-transfer)
// local order, the one-click marketing unsubscribe, a $0 order completed without a card, and creating the Stripe
// Checkout Session or PaymentIntent for an order. Every total is priced here on the server from the catalog; nothing
// marks a card order paid (only stripeWebhook does). Moved out of index.js as is (functions/CLAUDE.md › Cloud Functions
// › Action table): index.js passes in its own db, Stripe wrapper, pricing and stock helpers, so the vm-based handler
// tests' fakes still apply.

function checkoutPaymentActions({
  ALLOWED_ORIGINS, canViewOrder, checkoutCurrencyOf, checkoutRefusal, clientIpOf, completeOrderWithoutCard,
  crypto, db, encodeAcquisition, FALLBACK_RATES, getCountryCode, getExchangeRates, GiftCardError, holdOwner,
  loadHoldLimits, normMarketingEmail, optOutId, orderRequestIdentity, orderRequestKey, priceOrder,
  PricingError, publicErrorMessage, readAdminSecret, recalculateOrder, refusePreviousAttemptPaid, releaseStock,
  releaseSupersededAttempt, reserveCheckout, reserveStock, serverGeoCountry, StockHoldError, Stripe,
  STRIPE_SECRET_KEY, stripeIntentKey, tokenMatches, withPrivateStripeKeys,
}) {
  // A manual payment method (Settings › Payments › Manual methods) for pickup, local delivery, shipped or e-book
  // orders: priced from the catalog, stock held, and the order created pending until the shop marks it paid.
  async function handleManualLocalOrder(req, res) {
    try {
      const source = req.body.orderDraft;
      if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('Order details are required.');
      if (!Array.isArray(source.items) || !source.items.length || source.items.length > 50) throw new Error('Choose between 1 and 50 books.');
      const items = source.items.map(item => {
        if (typeof item?.id !== 'string' || !item.id || item.id.length > 160 || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) throw new Error('Check the selected books and quantities.');
        // Paid add-ons and gift-card recipient details ride along; priceOrder validates and prices them from the catalog.
        return {
          id: item.id,
          variantId: typeof item.variantId === 'string' ? item.variantId.slice(0, 160) : null,
          quantity: item.quantity,
          ...(Array.isArray(item.addOns) && item.addOns.length ? { addOns: item.addOns.slice(0, 12) } : {}),
          ...(item.giftCardDetails && typeof item.giftCardDetails === 'object' && !Array.isArray(item.giftCardDetails) ? { giftCardDetails: item.giftCardDetails } : {}),
        };
      });
      const contact = source.customer || {};
      if (typeof contact.name !== 'string' || !contact.name.trim() || typeof contact.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) throw new Error('Customer name and email are required.');
      const cleanAddress = value => Object.fromEntries(['street', 'unit', 'city', 'state', 'zip', 'country'].map(key => [key, typeof value?.[key] === 'string' ? value[key].trim().slice(0, 200) : '']));
      // Every manual order (pickup, local delivery, shipped or e-book only) is priced here from the catalog.
      const selection = source.fulfillmentSelection == null ? null : source.fulfillmentSelection;
      if (selection && (!['pickup', 'local_delivery', 'shipping'].includes(selection.method) || typeof selection.optionId !== 'string')) throw new Error('Choose a delivery option.');
      const settingsDoc = await db.collection('settings').doc('website').get();
      const settings = settingsDoc.data() || {};
      const manual = (settings.payments?.manualMethods || []).find(method => method.id === req.body.manualMethodId && method.enabled === true);
      if (!manual) throw new Error('That payment method is no longer available.');
      const now = new Date().toISOString();
      const order = {
        customer: { name: contact.name.trim().slice(0, 200), email: contact.email.trim().toLowerCase().slice(0, 320), phone: typeof contact.phone === 'string' ? contact.phone.trim().slice(0, 80) : '', address: cleanAddress(contact.address), billingAddress: cleanAddress(contact.billingAddress) },
        items,
        ...(selection ? { fulfillmentSelection: { method: selection.method, optionId: selection.optionId.slice(0, 200) } } : {}),
        ...(typeof source.shippingMethod === 'string' && source.shippingMethod ? { shippingMethod: source.shippingMethod.slice(0, 200) } : {}),
        ...(typeof source.cartId === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(source.cartId) ? { cartId: source.cartId } : {}),
        referralSource: typeof source.referralSource === 'string' ? source.referralSource.slice(0, 120) : 'direct',
        ...(encodeAcquisition(source.acquisition) ? { acquisition: encodeAcquisition(source.acquisition) } : {}),
        appliedDiscount: typeof source.appliedDiscount?.code === 'string' ? { code: source.appliedDiscount.code.slice(0, 100) } : null,
        ...(typeof source.orderNote === 'string' ? { orderNote: source.orderNote.slice(0, 500) } : {}),
        ...(typeof source.locale === 'string' ? { locale: source.locale.slice(0, 20) } : {}),
      };
      // Gift cards are taken when the payment is confirmed, which a manual payment may be days later.
      if (Array.isArray(source.giftCards) && source.giftCards.length) throw new Error('Gift cards can be used when paying by card or PayPal, or when they cover the whole order.');
      const priced = await recalculateOrder({ update: async () => {} }, order, checkoutCurrencyOf(req.body.currency) || 'cad');
      const { convertedTotal, settings: ignoredSettings, testMode: ignoredTestMode, ...trusted } = priced;
      const orderId = crypto.randomBytes(12).toString('hex').toUpperCase();
      const trackingKey = crypto.randomBytes(32).toString('hex');
      // The order is placed: stop the "you left something in your bag" reminder now, not
      // only when the thank-you page loads (it may never load) or payment arrives days later.
      for (const cartKey of [order.cartId, `active_${order.customer.email}`].filter(Boolean)) {
        await db.collection('abandoned-carts').doc(cartKey).update({ recovered: true, recoveredAt: now }).catch(() => {});
      }
      if (refusePreviousAttemptPaid(res, await releaseSupersededAttempt(req, order.customer.email, orderId, items))) return;
      // Hold the priced lines (box-set parts and the free gift included), not the browser's raw list.
      const heldItems = Array.isArray(trusted.items) && trusted.items.length ? trusted.items : items;
      await reserveStock(db, orderId, heldItems, Date.now(), holdOwner(order), { limits: true, ip: clientIpOf(req), holdLimits: await loadHoldLimits() });
      try {
        await db.collection('orders').doc(orderId).create({ ...order, ...trusted, orderId, trackingKey, paymentStatus: 'pending', status: 'pending_payment', paymentMethod: manual.name, paymentInstructions: manual.instructions || '', createdAt: now, updatedAt: now, activity: [{ type: 'event', message: 'Order created', createdAt: now }] });
      } catch (createErr) {
        await releaseStock(db, orderId, heldItems);
        throw createErr;
      }
      return res.status(200).json({ orderId, trackingKey, shipping: trusted.shipping, tax: trusted.tax, total: trusted.total, fulfillment: trusted.fulfillment });
    } catch (err) {
      return res.status(400).json({ error: publicErrorMessage(err, "We could not place this order. Please check your details and try again."), ...(["hold_limit", "store_closed", "shipping_rates_changed"].includes(err.code) ? { code: err.code } : {}) });
    }
  }

  // One-click unsubscribe from marketing email (the link in abandoned-cart reminders).
  async function handleUnsubscribe(req, res) {
    const email = normMarketingEmail(req.body.email);
    const key = (await readAdminSecret("marketing")).unsubscribeKey;
    if (!email || !tokenMatches(email, String(req.body.token || ""), key)) return res.status(400).json({ error: "invalid_link" });
    await db.collection("marketing-optout").doc(optOutId(email)).set({ at: new Date().toISOString(), source: "email-link" });
    // The same link also takes the address off the newsletter list (the opt-out record above is kept as proof).
    await db.collection("newsletter").doc(email).delete().catch(() => {});
    return res.status(200).json({ unsubscribed: true });
  }

  // A $0 order (100% discount, free e-book): priced here from the catalog, and completed
  // only when the server's own total is zero. Nothing is charged.
  async function handleCompleteFreeOrder(req, res) {
    try {
      const freeId = req.body.orderId;
      if (typeof freeId !== "string" || !freeId || freeId.includes("/")) return res.status(400).json({ error: "Missing orderId" });
      const freeRef = db.collection("orders").doc(freeId);
      const freeDoc = await freeRef.get();
      if (!freeDoc.exists) return res.status(404).json({ error: "Order not found" });
      const freeOrder = freeDoc.data();
      if (!canViewOrder(freeOrder, { key: orderRequestKey(req), identity: await orderRequestIdentity(req) })) return res.status(403).json({ error: "access_required" });
      if (freeOrder.paymentStatus === "paid") return res.status(200).json({ paid: true });
      if (freeOrder.paymentStatus !== "unpaid" || freeOrder.paymentMethod !== "Free" || freeOrder.isTest === true || checkoutRefusal(freeOrder)) {
        return res.status(400).json({ error: "This order can't be completed without payment." });
      }
      // The shopper's own earlier attempt gives back its holds first, so it can't block this one.
      if (refusePreviousAttemptPaid(res, await releaseSupersededAttempt(req, freeOrder.customer?.email, freeId, freeOrder.items))) return;
      const priced = await recalculateOrder(freeRef, freeOrder, checkoutCurrencyOf(req.body.currency) || "cad", freeId);
      // A test-mode gift card is a rehearsal: it can't pay for a real order on its own.
      if (priced.testCardUsed) return res.status(400).json({ error: "Gift card error: This test gift card can only be used with a test card payment.", code: "gift_card_rejected" });
      if (Math.round(Number(priced.total) * 100) !== 0) {
        return res.status(400).json({ error: "This order has a total to pay. Review your bag and choose a payment method.", code: "total_changed" });
      }
      const paidNow = await completeOrderWithoutCard(freeId, priced.giftCardAmount > 0 ? "Order paid in full with a gift card." : "Free order completed — nothing to charge.", { req });
      if (!paidNow) return res.status(409).json({ error: "Your gift card balance changed. Review your order and try again.", code: "gift_card_rejected" });
      return res.status(200).json({ paid: true });
    } catch (err) {
      return res.status(400).json({ error: publicErrorMessage(err, "We could not complete this order. Please check your details and try again."), ...(err.code && /^(gift_card|discount_|hold_limit|store_closed|shipping_rates_changed)/.test(err.code) ? { code: err.code.startsWith("gift_card") ? "gift_card_rejected" : err.code } : {}) });
    }
  }

  // Card payment for an order: re-prices it, holds its stock and opens a Stripe Checkout Session (hosted or
  // embedded) or a PaymentIntent (Payment Element). The webhook, never this step, marks the order paid.
  async function handleStripeCheckout(req, res) {
    const { orderId, currency: reqCurrency, returnUrl, embedded, paymentElement } = req.body;
    const checkoutCurrency = checkoutCurrencyOf(reqCurrency);
    if (!checkoutCurrency) {
      res.status(400).json({ error: "Unsupported currency." });
      return;
    }
    if (!orderId) {
      res.status(400).json({ error: "Missing orderId" });
      return;
    }

    try {
      const orderRef = db.collection("orders").doc(orderId);
      const orderDoc = await orderRef.get();
      if (!orderDoc.exists) {
        res.status(404).json({ error: "Order not found" });
        return;
      }

      const order = orderDoc.data();
      if (!canViewOrder(order, { key: orderRequestKey(req), identity: await orderRequestIdentity(req) })) return res.status(403).json({ error: "access_required" });
      if (order.isTest === true) {
        res.status(400).json({ error: "Test orders cannot enter checkout." });
        return;
      }
      const refusal = checkoutRefusal(order);
      if (refusal === "paid") {
        res.status(400).json({ error: "Order has already been paid" });
        return;
      }
      if (refusal) {
        res.status(409).json({ error: "This order was cancelled. Please start a new order from your bag.", code: "order_closed" });
        return;
      }

      // 1–4. Server pricing: catalog items, add-ons, box sets, discount (code or automatic),
      //      shipping, tax and gift cards. Client-supplied prices are never trusted.
      let priced;
      try {
        priced = await priceOrder(order, { orderId });
      } catch (pricingErr) {
        if (pricingErr instanceof PricingError) return res.status(400).json({ error: pricingErr.message, ...(pricingErr.code ? { code: pricingErr.code } : {}) });
        throw pricingErr;
      }
      const { items, settings, appliedDiscount, fulfillment, shippingEstimate } = priced;
      const subtotalTrusted = priced.subtotal;
      const discountAmount = priced.discount;
      const shippingCost = priced.shipping;
      const shippingMethodCharged = priced.shippingMethod;
      const taxCost = priced.tax;
      const giftCardAmount = priced.giftCardAmount;
      const giftCardRedemptions = priced.giftCardRedemptions;
      const finalTotal = priced.total;
      const rates = await getExchangeRates();
      const exchangeRate = rates[checkoutCurrency] || FALLBACK_RATES[checkoutCurrency] || 1.0;

      // The connecting address is the right-most non-proxy hop (clientIpOf), never the client-typed left-most one. The
      // country comes from the platform's own geo header only; no shopper address is sent to a third-party lookup (#109).
      const clientIp = clientIpOf(req);
      const ipCountry = serverGeoCountry(req);

      const shippingCountryCode = getCountryCode((fulfillment?.method === 'pickup' ? fulfillment.address : order.customer?.address)?.country || order.customer?.billingAddress?.country || '');
      const ipCountryMatchesShipping = !ipCountry || ipCountry.toUpperCase() === shippingCountryCode.toUpperCase();
      const testMode = settings.payments?.testMode || false;
      const stripeSettings = await withPrivateStripeKeys(settings.payments?.stripe);

      // 5. Stripe checkout parameters
      const stripeSecret = testMode 
        ? stripeSettings.testSecretKey 
        : (stripeSettings.secretKey || STRIPE_SECRET_KEY.value());

      if (!stripeSecret) {
        throw new Error(testMode 
          ? "Stripe Test Secret Key is not configured in settings." 
          : "Stripe Secret Key is not configured.");
      }

      const stripe = new Stripe(stripeSecret);
      // The discount is spread over the discountable lines; gift cards are always face value.
      const discountableSubtotal = items.filter(item => item.giftCard !== true).reduce((sum, item) => sum + item.price * item.quantity, 0);
      const discountFactor = discountableSubtotal > 0 ? (discountableSubtotal - discountAmount) / discountableSubtotal : 1;

      const lineItems = items.map(item => {
        const convertedPrice = item.price * exchangeRate;
        const itemPriceInCents = Math.round(convertedPrice * (item.giftCard === true ? 1 : discountFactor) * 100);
        let title = item.title;
        if (item.variantName) {
          title += ` (${item.variantName})`;
        }
        return {
          price_data: {
            currency: checkoutCurrency,
            product_data: {
              name: title,
              images: item.photoUrl ? [item.photoUrl] : [],
            },
            unit_amount: itemPriceInCents,
          },
          quantity: item.quantity,
        };
      });

      if (shippingCost > 0) {
        lineItems.push({
          price_data: {
            currency: checkoutCurrency,
            product_data: {
              name: "Shipping & Handling",
            },
            unit_amount: Math.round(shippingCost * exchangeRate * 100),
          },
          quantity: 1,
        });
      }

      if (taxCost > 0) {
        lineItems.push({
          price_data: {
            currency: checkoutCurrency,
            product_data: {
              name: "Estimated Sales Tax",
            },
            unit_amount: Math.round(taxCost * exchangeRate * 100),
          },
          quantity: 1,
        });
      }

      // Gift cards pay part of the order: the card is charged only what is left.
      const giftCardMinor = Math.round(giftCardAmount * exchangeRate * 100);
      const chargeMinor = lineItems.reduce((sum, li) => sum + li.price_data.unit_amount * li.quantity, 0) - giftCardMinor;
      if (giftCardMinor > 0 && !paymentElement) {
        res.status(400).json({ error: "Gift cards can be used with the card form on the checkout page.", code: "gift_card_rejected" });
        return;
      }
      if (giftCardMinor > 0 && chargeMinor < 1) {
        res.status(400).json({ error: "Your gift card covers this order. Review your bag and place the order again.", code: "nothing_to_charge" });
        return;
      }

      // The shopper's earlier attempt already has their money: refuse before this order is touched.
      if (refusePreviousAttemptPaid(res, await releaseSupersededAttempt(req, order.customer?.email, orderId, order.items))) return;

      // A retry on the same order replaces its earlier unfinished PaymentIntent, so two tabs can't both pay.
      // Checked before the order is re-priced: a refused retry must leave the amounts (and gift cards)
      // of the payment that is still in progress exactly as they were.
      if (paymentElement) {
        if (order.stripePaymentIntentId) {
          try {
            const previous = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId);
            if (["succeeded", "processing", "requires_capture"].includes(previous.status)) {
              res.status(409).json({ error: "This order already has a payment in progress. Check your order status before paying again.", code: "payment_in_progress" });
              return;
            }
            if (["requires_payment_method", "requires_confirmation", "requires_action"].includes(previous.status)) {
              try {
                await stripe.paymentIntents.cancel(previous.id);
              } catch (cancelErr) {
                // A simultaneous request may have cancelled it first; only a still-live intent blocks a new one.
                const again = await stripe.paymentIntents.retrieve(previous.id);
                if (again.status !== "canceled") throw cancelErr;
              }
            }
          } catch (err) {
            // Unsure whether the earlier payment is still live: never open a second one beside it.
            console.warn(`Could not settle previous PaymentIntent for ${orderId}:`, err.message);
            res.status(409).json({ error: "This order already has a payment in progress. Check your order status before paying again.", code: "payment_in_progress" });
            return;
          }
        }
      }

      await orderRef.update({
        // Lower-case so "one use per customer" cannot be dodged by changing the email's capitalisation.
        ...(order.customer?.email ? { "customer.email": String(order.customer.email).trim().toLowerCase() } : {}),
        items: items.map(({ shippingProfileId, ...rest }) => rest),
        subtotal: subtotalTrusted,
        discount: discountAmount,
        appliedDiscount: appliedDiscount,
        shipping: shippingCost,
        ...(shippingMethodCharged ? { shippingMethod: shippingMethodCharged } : {}),
        shippingEstimate,
        fulfillment,
        tax: taxCost,
        giftCardAmount,
        giftCardRedemptions,
        total: finalTotal,
        checkoutCurrency: checkoutCurrency.toUpperCase(),
        exchangeRate: exchangeRate,
        stripeMode: testMode ? "test" : "live",
        clientIp: clientIp,
        ipCountry: ipCountry || null,
        ipCountryMatchesShipping: ipCountryMatchesShipping,
        updatedAt: new Date().toISOString()
      });

      // Sandbox sessions rehearse payment only; they do not reserve or consume live stock or gift cards.
      if (!testMode) {
        try {
          await reserveCheckout(orderId, items, order, giftCardRedemptions, testMode, req);
        } catch (holdErr) {
          if (holdErr instanceof StockHoldError || holdErr instanceof GiftCardError) {
            res.status(409).json({ error: holdErr.message, code: holdErr instanceof GiftCardError ? "gift_card_rejected" : holdErr.code });
            return;
          }
          throw holdErr;
        }
      }

      // Payment Element on the checkout page: charge the same server-priced
      // total through a PaymentIntent instead of a Checkout Session.
      if (paymentElement) {
        const amount = chargeMinor;
        const intent = await stripe.paymentIntents.create({
          amount,
          currency: checkoutCurrency,
          automatic_payment_methods: { enabled: true },
          // No receipt_email: the shop's own "Order confirmed" email is the customer's
          // one confirmation (Stripe's receipt duplicated it).
          description: `Order ${orderId}`,
          metadata: { order_id: orderId, checkout: "payment_element" },
        }, { idempotencyKey: stripeIntentKey(orderId, amount, checkoutCurrency, order.stripePaymentIntentId) });
        // The webhook marks the order paid only for exactly this amount and currency.
        await orderRef.update({ stripePaymentIntentId: intent.id, expectedAmountMinor: amount, expectedCurrency: checkoutCurrency, chargedGiftCards: giftCardRedemptions, updatedAt: new Date().toISOString() });
        // stripeMode lets the browser check its card form uses the same Stripe mode.
        res.status(200).json({ clientSecret: intent.client_secret, amount, currency: checkoutCurrency, stripeMode: testMode ? "test" : "live" });
        return;
      }

      // The storefront passes its own checkout URL (it may live under a
      // sub-path, e.g. GitHub Pages). Only accept it if it belongs to an
      // allowed origin; otherwise fall back to origin + /checkout.
      let checkoutBase = `${req.headers.origin || "http://localhost:5173"}/checkout`;
      if (
        typeof returnUrl === "string" &&
        ALLOWED_ORIGINS.some(o => returnUrl === o || returnUrl.startsWith(`${o}/`))
      ) {
        checkoutBase = returnUrl;
      }
      const joiner = checkoutBase.includes("?") ? "&" : "?";

      await orderRef.update({
        expectedAmountMinor: lineItems.reduce((sum, li) => sum + li.price_data.unit_amount * li.quantity, 0),
        expectedCurrency: checkoutCurrency,
        chargedGiftCards: giftCardRedemptions,
        updatedAt: new Date().toISOString(),
      });
      // Same order, amount and minute = the same session (a double click can't open two).
      const sessionAmount = lineItems.reduce((sum, li) => sum + li.price_data.unit_amount * li.quantity, 0);
      const sessionMinute = Math.floor(Date.now() / 60000);
      const session = await stripe.checkout.sessions.create({
        line_items: lineItems,
        mode: "payment",
        client_reference_id: orderId,
        customer_email: order.customer.email,
        // Let Stripe select eligible methods from Dashboard configuration.
        // Delayed methods remain unpaid until the success webhook settles them.
        payment_intent_data: {
          metadata: { order_id: orderId },
        },
        // Shorten the unpaid-stock-hold window: session dies after 30 minutes.
        expires_at: sessionMinute * 60 + 31 * 60,
        // Embedded mode keeps the card form on the storefront's checkout page;
        // the webhook still receives checkout.session.completed either way.
        ...(embedded
          ? {
            ui_mode: "embedded",
            return_url: `${checkoutBase}${joiner}success=true&order_id=${orderId}&session_id={CHECKOUT_SESSION_ID}`,
          }
          : {
            success_url: `${checkoutBase}${joiner}success=true&order_id=${orderId}&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${checkoutBase}${joiner}canceled=true`,
          }),
      }, { idempotencyKey: `cs-${orderId}-${checkoutCurrency}-${sessionAmount}-${embedded ? "e" : "h"}-${sessionMinute}` });

      // Save the session now so a missed webhook can still be recovered from the order alone.
      await orderRef.update({ stripeCheckoutSessionId: session.id, updatedAt: new Date().toISOString() });

      res.status(200).json({
        sessionId: session.id,
        url: session.url || null,
        clientSecret: embedded ? session.client_secret : null,
      });
    } catch (err) {
      console.error("Stripe Session Creation Failed:", err);
      res.status(500).json({ error: publicErrorMessage(err, "Something went wrong. Please try again.") });
    }
  }

  return { handleManualLocalOrder, handleUnsubscribe, handleCompleteFreeOrder, handleStripeCheckout };
}

module.exports = { checkoutPaymentActions };
