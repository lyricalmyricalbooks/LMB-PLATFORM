// Pretend Twilio and an in-memory sent log, for the tests.
export function fakeTextLog() {
  const rows = new Map();
  return {
    rows,
    get: async (key) => rows.get(key) ?? null,
    put: async (key, entry) => void rows.set(key, { ...entry }),
    countSince: async (shopId, since) => [...rows.values()].filter((r) => r.shopId === shopId && r.status === "sent" && r.at >= since).length,
    listMonth: async (month) => [...rows.values()].filter((r) => r.month === month),
  };
}

/** Twilio's Messages endpoint: answers each send with `answer(form)` or a made-up message. */
export function fakeTwilioFetch({ answer = null } = {}) {
  const sent = [];
  const fetch = async (url, options) => {
    const form = Object.fromEntries(new URLSearchParams(options.body));
    sent.push({ url, auth: options.headers.Authorization, form });
    const given = answer ? answer(form, sent.length) : null;
    if (given instanceof Error) throw given;
    const { status = 201, body = { sid: `SM${String(sent.length).padStart(32, "0")}`, num_segments: "1", status: "queued" } } = given ?? {};
    return { ok: status < 300, status, json: async () => body };
  };
  return { fetch, sent };
}

/** Who texted each number last, and the replies waiting for shops, in memory. */
export function fakeTextReplies() {
  const routes = new Map();
  const inbox = new Map();
  return {
    routes, inbox,
    routeGet: async (key) => routes.get(key) ?? null,
    routePut: async (key, value) => void routes.set(key, { ...value }),
    inboxPut: async (id, value) => void inbox.set(id, { ...value }),
    inboxGet: async (id) => inbox.get(id) ?? null,
    inboxList: async (shopId) => [...inbox.entries()].filter(([, r]) => r.shopId === shopId).map(([id, r]) => ({ id, ...r })).sort((a, b) => a.at.localeCompare(b.at)),
    inboxRemove: async (id) => void inbox.delete(id),
  };
}
