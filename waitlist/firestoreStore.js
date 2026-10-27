// Stores waitlist sign-ups in the platform project's Firestore, straight from the page, with no server.
// The page may only add a sign-up (waitlist/firestore.rules); it can never read, change or delete one. So `get` finds
// nothing, and a repeat email, which the database refuses because that record exists, counts as done: the first
// sign-up stays as it was.

const FIELD = (value) =>
  typeof value === "number" ? { integerValue: String(value) } : { stringValue: String(value ?? "") };

/** `host` is only set by the emulator test. */
export function firestoreStore({ projectId, apiKey, host = "https://firestore.googleapis.com", fetch = globalThis.fetch }) {
  const collection = `${host}/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/waitlist`;
  return {
    get: async () => null,
    async put(id, record) {
      const fields = Object.fromEntries(Object.entries(record).map(([key, value]) => [key, FIELD(value)]));
      const url = `${collection}?documentId=${encodeURIComponent(id)}${apiKey ? `&key=${encodeURIComponent(apiKey)}` : ""}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields }),
      });
      if (response.ok || response.status === 409) return;
      throw new Error(`The waitlist store answered ${response.status}`);
    },
  };
}
