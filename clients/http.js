// One way to call Google's REST APIs: an injected `fetch` and an injected `token()` that returns an OAuth access token
// (the caller decides where it comes from: `gcloud auth print-access-token` on a person's machine, the metadata server
// in a scheduled job). Nothing here reads a key file, an environment variable or the network on its own, so every
// client built on it is tested with a fake `fetch` that checks the exact requests.

export class GoogleError extends Error {
  constructor(message, { status, code, url, body } = {}) {
    super(message);
    this.name = "GoogleError";
    this.status = status;
    this.code = code;
    this.url = url;
    this.body = body;
  }
}

/** True when Google answered "not found" (HTTP 404). */
export const isNotFound = (error) => error instanceof GoogleError && error.status === 404;
/** True when Google answered "already exists" (HTTP 409 ALREADY_EXISTS). */
export const isAlreadyExists = (error) => error instanceof GoogleError && error.status === 409 && error.code !== "ABORTED";

/**
 * `call(method, url, { body, query, auth })` -> parsed JSON ({} for an empty answer). `auth: false` sends no token
 * (public calls such as an API-key sign-in). A non-2xx answer throws a GoogleError with Google's own message.
 */
export function googleHttp({ fetch, token }) {
  if (typeof fetch !== "function") throw new Error("googleHttp needs a fetch");
  // `raw` sends text or bytes as they are (with `contentType`), for uploads; `body` is sent as JSON.
  return async function call(method, url, { body, raw, contentType = "application/octet-stream", query, auth = true, headers = {} } = {}) {
    const target = new URL(url);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value === undefined || value === null) continue;
      for (const one of Array.isArray(value) ? value : [value]) target.searchParams.append(key, String(one));
    }
    const sent = { ...headers };
    if (auth) {
      if (typeof token !== "function") throw new Error("this call needs a token()");
      sent.Authorization = `Bearer ${await token()}`;
    }
    let payload;
    if (raw !== undefined) {
      sent["Content-Type"] = contentType;
      payload = raw;
    } else if (body !== undefined) {
      sent["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
    const response = await fetch(target.toString(), { method, headers: sent, ...(payload === undefined ? {} : { body: payload }) });
    const text = await response.text();
    let parsed = {};
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { raw: text };
      }
    }
    if (!response.ok) {
      const error = Array.isArray(parsed) ? parsed[0]?.error : parsed.error;
      const message = error?.message ?? `${method} ${target.pathname} answered ${response.status}`;
      throw new GoogleError(message, { status: response.status, code: error?.status, url: target.toString(), body: parsed });
    }
    return parsed;
  };
}

/**
 * Waits for a long-running operation (`{ name, done, error, response }`) by asking `pollUrl(name)` until it is done.
 * Resolves to the operation's `response`; an operation that ends in error throws it.
 */
export async function waitForOperation(call, operation, { pollUrl, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), everyMs = 2000, maxPolls = 300 } = {}) {
  let current = operation;
  for (let poll = 0; !current?.done; poll += 1) {
    if (poll >= maxPolls) throw new Error(`Google's operation ${current?.name} did not finish in time; run the step again to carry on`);
    await sleep(everyMs);
    current = await call("GET", pollUrl(current.name));
  }
  if (current.error) throw new GoogleError(current.error.message ?? "Google's operation failed", { code: current.error.code });
  return current.response ?? {};
}
