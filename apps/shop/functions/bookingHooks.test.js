// Send bookings to other apps (plan 4, 5.8, bookingHooks.js): only safe addresses, the right event for each change,
// signed bodies, failed deliveries tried again further apart and then dropped, and a hook paused after many failures.
import { describe, expect, test } from "vitest";
import { createRequire } from "module";
import crypto from "crypto";

const realRequire = createRequire(import.meta.url);
const { hooksFor, hookUrlProblem, privateAddress, hookEvent, hookBody, signature, postHook, RETRY_MINUTES, PAUSE_AFTER, SIGNATURE_HEADER } = realRequire("./bookingHooks");

function fakeDb() {
  const store = new Map();
  const ref = (c, id) => ({
    id, async get() { return { id, exists: store.has(`${c}/${id}`), data: () => structuredClone(store.get(`${c}/${id}`)), ref: ref(c, id) }; },
    async set(d) { store.set(`${c}/${id}`, structuredClone(d)); }, async delete() { store.delete(`${c}/${id}`); },
  });
  const query = (c, filters = [], n = 1000) => ({
    where: (f, op, v) => query(c, [...filters, [f, op, v]], n), limit: (m) => query(c, filters, m),
    async get() {
      const docs = [...store.keys()].filter((k) => k.startsWith(`${c}/`)).map((k) => ({ id: k.slice(c.length + 1), data: () => structuredClone(store.get(k)), ref: ref(c, k.slice(c.length + 1)) }))
        .filter((d) => filters.every(([f, op, v]) => (op === "<=" ? d.data()[f] <= v : d.data()[f] === v))).slice(0, n);
      return { docs, empty: !docs.length };
    },
  });
  let made = 0;
  return { store, collection: (c) => ({ doc: (id) => ref(c, id ?? `d${++made}`), ...query(c) }), runTransaction: (fn) => fn({ get: (r) => r.get(), set: (r, d) => r.set(d) }) };
}

const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];
const booking = (over = {}) => ({ status: "confirmed", start: "2026-12-01T15:00:00.000Z", end: "2026-12-01T16:00:00.000Z", minutes: 60, serviceName: "Cut", staffName: "Ana", staffId: "s1", customer: { name: "Jo", email: "jo@example.com", phone: "+14165550199" }, priceMinor: 5000, currency: "CAD", paid: false, accessKey: "secret-key", history: [{ what: "booked" }], ...over });

describe("send bookings to other apps (plan 4, 5.8)", () => {
  test("only an https name on the normal port is taken, and private addresses are never posted to", async () => {
    expect(hookUrlProblem("https://hooks.example.com/catch/123")).toBe("");
    for (const bad of ["http://hooks.example.com/x", "https://127.0.0.1/x", "https://[::1]/x", "https://localhost/x", "https://metadata.google.internal/x", "https://a:b@hooks.example.com/x", "https://hooks.example.com:8080/x", "nonsense"]) {
      expect(hookUrlProblem(bad), bad).not.toBe("");
    }
    for (const ip of ["10.0.0.1", "172.20.1.1", "192.168.1.1", "169.254.169.254", "127.0.0.1", "100.64.0.1", "::1", "fd00::1", "::ffff:10.0.0.1"]) expect(privateAddress(ip), ip).toBe(true);
    expect(privateAddress("93.184.216.34")).toBe(false);
    let posted = 0;
    const got = await postHook({ url: "https://sneaky.example.com/x", secret: "s" }, {}, { fetchImpl: async () => { posted += 1; return { status: 200 }; }, lookup: async () => [{ address: "169.254.169.254" }] });
    expect(got).toEqual({ ok: false, status: 0 });
    expect(posted).toBe(0);
  });

  test("each change is the right event, and the body leaves out keys and history", () => {
    expect(hookEvent(null, booking())).toBe("booking.created");
    expect(hookEvent(booking({ status: "held" }), booking())).toBe("booking.created");
    expect(hookEvent(null, booking({ status: "held" }))).toBe("");
    expect(hookEvent(booking(), booking({ start: "2026-12-02T15:00:00.000Z" }))).toBe("booking.moved");
    expect(hookEvent(booking(), booking({ staffId: "s2" }))).toBe("booking.moved");
    expect(hookEvent(booking(), booking({ note: "changed" }))).toBe("");
    expect(hookEvent(booking(), booking({ status: "cancelled" }))).toBe("booking.cancelled");
    expect(hookEvent(booking(), null)).toBe("booking.cancelled");
    const body = hookBody("booking.moved", "b1", booking({ start: "2026-12-02T15:00:00.000Z" }), { at: "x", shop: "Shop", before: booking() });
    expect(body.booking).toMatchObject({ service: "Cut", staff: "Ana", customer: { name: "Jo" }, priceMinor: 5000 });
    expect(body.was.start).toBe("2026-12-01T15:00:00.000Z");
    expect(JSON.stringify(body)).not.toMatch(/secret-key|history/);
  });

  test("a new booking is posted signed; a failure waits and goes again further apart, then is dropped", async () => {
    const db = fakeDb();
    let clock = Date.parse("2026-11-24T15:00:00.000Z");
    const calls = [];
    let answer = 200;
    const fetchImpl = async (url, init) => { calls.push({ url, init }); return { status: answer }; };
    const h = hooksFor({ db, now: () => new Date(clock), fetchImpl, lookup: publicLookup });
    const added = await h.ownerStep({ step: "add", url: "https://hooks.example.com/catch/1", events: ["booking.created", "booking.cancelled"] });
    expect(added.status).toBe(200);
    const hook = added.json.hooks[0];
    expect(hook.secret).toMatch(/^whsec_/);
    expect((await h.ownerStep({ step: "add", url: "https://hooks.example.com/catch/1" })).problem).toMatch(/already/);

    expect(await h.bookingChanged("b1", null, booking(), "Shop")).toEqual({ sent: 1, queued: 0 });
    const { init } = calls[0];
    const [t, v1] = init.headers[SIGNATURE_HEADER].split(",").map((x) => x.split("=")[1]);
    expect(v1).toBe(crypto.createHmac("sha256", hook.secret).update(`${t}.${init.body}`).digest("hex"));
    expect(signature(hook.secret, init.body, Number(t))).toBe(init.headers[SIGNATURE_HEADER]);
    expect(JSON.parse(init.body)).toMatchObject({ event: "booking.created", id: "b1", shop: "Shop" });
    // Moves aren't wanted by this hook.
    expect(await h.bookingChanged("b1", booking(), booking({ start: "2026-12-03T15:00:00.000Z" }))).toEqual({ sent: 0, queued: 0 });

    answer = 500;
    expect(await h.bookingChanged("b2", null, booking())).toEqual({ sent: 0, queued: 1 });
    expect((await h.ownerStep({ step: "list" })).json.hooks[0].problem).toMatch(/error \(500\)/);
    expect(await h.sweepDeliveries()).toEqual({ sent: 0, dropped: 0 }); // not due yet
    for (let n = 0; n < RETRY_MINUTES.length - 1; n += 1) {
      clock += RETRY_MINUTES[n] * 60_000;
      expect(await h.sweepDeliveries()).toEqual({ sent: 0, dropped: 0 });
    }
    clock += RETRY_MINUTES.at(-1) * 60_000;
    expect(await h.sweepDeliveries()).toEqual({ sent: 0, dropped: 1 });
    expect(calls.filter((c) => JSON.parse(c.init.body).id === "b2")).toHaveLength(1 + RETRY_MINUTES.length);

    // One that fails once then works is delivered by the sweep.
    expect((await h.bookingChanged("b3", booking(), booking({ status: "cancelled" }))).queued).toBe(1);
    answer = 204;
    clock += RETRY_MINUTES[0] * 60_000;
    expect(await h.sweepDeliveries()).toEqual({ sent: 1, dropped: 0 });
    expect((await h.ownerStep({ step: "list" })).json.hooks[0].problem).toBe("");
  });

  test("a hook that keeps failing is paused; test, switch and remove", async () => {
    const db = fakeDb();
    const h = hooksFor({ db, now: () => new Date("2026-11-24T15:00:00.000Z"), fetchImpl: async () => ({ status: 404 }), lookup: publicLookup });
    const { json } = await h.ownerStep({ step: "add", url: "https://hooks.example.com/catch/2" });
    const id = json.hooks[0].id;
    const test = await h.ownerStep({ step: "test", id });
    expect(test.json).toMatchObject({ ok: false });
    expect(test.json.problem).toMatch(/isn't there any more/);
    for (let n = 1; n < PAUSE_AFTER; n += 1) await h.bookingChanged(`b${n}`, null, booking());
    const listed = (await h.ownerStep({ step: "list" })).json.hooks[0];
    expect(listed).toMatchObject({ on: false, paused: true });
    expect(await h.bookingChanged("bx", null, booking())).toEqual({ sent: 0, queued: 0 });
    expect((await h.ownerStep({ step: "switch", id, on: true })).json.hooks[0]).toMatchObject({ on: true, paused: false });
    expect((await h.ownerStep({ step: "remove", id })).json.hooks).toEqual([]);
    expect([...db.store.keys()].filter((k) => k.startsWith("bookingHookQueue/"))).toEqual([]);
    expect((await h.ownerStep({ step: "add", url: "https://hooks.example.com/x", events: [] })).problem).toMatch(/at least one/);
  });
});
