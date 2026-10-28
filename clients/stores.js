// Firestore stores for the platform services' own records, in the platform project, with the shapes of their fakes:
// the email service's sent log (services/email/fakes.js `fakeSentLog`) and the payment service's account record
// (services/payments/fakes.js `fakeAccounts`).

/** emailSent/<key>: { shopId, kind, status, at, … }. */
export function firestoreSentLog(firestore) {
  // A document id can't hold "/" (clients/firestore.js escapes everything else in the address).
  const id = (key) => String(key).replace(/\//g, "_");
  return {
    get: (key) => firestore.get(`emailSent/${id(key)}`),
    put: (key, entry) => firestore.set(`emailSent/${id(key)}`, entry),
    async findSent(shopId, kind) {
      const rows = await firestore.query("emailSent", { where: [["shopId", "==", shopId], ["kind", "==", kind], ["status", "==", "sent"]], limit: 1 });
      return rows[0]?.data ?? null;
    },
    async countSince(shopId, since) {
      // Equality filters only, which need no extra index; the date is compared here. A shop's sent emails are read
      // in full, so this suits the daily-limit check while shops are small; an index on (shopId, status, at) replaces
      // it once one shop sends tens of thousands.
      const rows = await firestore.query("emailSent", { where: [["shopId", "==", shopId], ["status", "==", "sent"]], limit: 20000 });
      return rows.filter((row) => row.data.at >= since).length;
    },
  };
}

/** paymentAccounts/<shopId>: { provider, accountId, mode, createdAt }. */
export function firestoreAccounts(firestore) {
  return {
    get: (shopId) => firestore.get(`paymentAccounts/${shopId}`),
    set: (shopId, record) => firestore.set(`paymentAccounts/${shopId}`, record),
  };
}
