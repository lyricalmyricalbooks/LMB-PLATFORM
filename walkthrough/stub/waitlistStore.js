// The walkthrough's stand-in for the waitlist page's store (waitlist/firestoreStore.js): sign-ups go to the walkthrough
// server and stay in its memory until it stops. Same two calls as the real one.
export function firestoreStore() {
  return {
    get: async () => null,
    async put(id, record) {
      const response = await fetch("/walkthrough/waitlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, record }) });
      if (!response.ok) throw new Error(`The walkthrough's waitlist answered ${response.status}`);
    },
  };
}
