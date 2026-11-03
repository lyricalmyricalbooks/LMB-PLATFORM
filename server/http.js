// Between Node's web server and the platform's doors. Every door in the repository (signup/api.js createApi, billing's
// events, the payment and email services' doors, the tips' "turn off" page) takes a plain request and returns a plain
// answer, so this file is the only one that knows about sockets:
//
//   request  { method, path, query, headers, body, rawBody, ip }
//            path     the address without its query ("/api/plans")
//            query    the query as an object ({ shopId: "…" })
//            headers  Node's, names in lower case
//            body     the parsed JSON when the request says it is JSON, else null
//            rawBody  the exact text that came in, for signature checks (Stripe's, Square's, Resend's)
//            ip       the address the connection came from (fair-use limits read x-forwarded-for first)
//   answer   { status, body?, html?, headers? }: `body` is sent as JSON, `html` as a page; `headers` adds headers
//            (a redirect's Location)
//
// Every answer carries the platform's safety headers (security/headers.js) and is never cached. A body over `maxBytes`
// is refused with 413 before it is read in full; a door that throws answers 500 in plain words.
import { createServer } from "node:http";
import { safetyHeaders } from "../security/headers.js";

export const MAX_BODY_BYTES = 1024 * 1024;

export class TooLarge extends Error {
  constructor() {
    super("That's more than this address accepts.");
    this.status = 413;
  }
}

/** Reads a Node request into the doors' request shape. Rejects with TooLarge past `maxBytes`. */
export function readRequest(req, { maxBytes = MAX_BODY_BYTES } = {}) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers["content-length"]);
    if (Number.isFinite(declared) && declared > maxBytes) {
      req.resume();
      reject(new TooLarge());
      return;
    }
    const chunks = [];
    let size = 0;
    let refused = false;
    req.on("data", (chunk) => {
      if (refused) return;
      size += chunk.length;
      if (size > maxBytes) {
        refused = true;
        reject(new TooLarge());
        return;
      }
      chunks.push(chunk);
    });
    req.on("error", reject);
    req.on("end", () => {
      if (refused) return;
      const rawBody = Buffer.concat(chunks).toString("utf8");
      const url = new URL(req.url ?? "/", "http://platform.invalid");
      let body = null;
      if (rawBody && /json/i.test(String(req.headers["content-type"] ?? ""))) {
        try {
          body = JSON.parse(rawBody);
        } catch {
          body = null;
        }
      }
      resolve({
        method: req.method ?? "GET",
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        headers: { ...req.headers },
        body,
        rawBody,
        ip: req.socket?.remoteAddress ?? "",
      });
    });
  });
}

const SAFETY = Object.fromEntries(safetyHeaders({ framing: "DENY" }).map(({ key, value }) => [key, value]));

/** Writes a door's answer: JSON, or a page, with the safety headers. */
export function writeAnswer(res, answer) {
  const status = Number.isInteger(answer?.status) && answer.status >= 100 && answer.status < 600 ? answer.status : 500;
  const page = typeof answer?.html === "string";
  const text = page ? answer.html : JSON.stringify(answer?.body ?? {});
  res.writeHead(status, {
    ...SAFETY,
    // A page here is plain words with inline style and nothing else; JSON loads nothing at all.
    "Content-Security-Policy": page ? "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'" : "default-src 'none'; frame-ancestors 'none'",
    "Cache-Control": "no-store",
    ...(answer?.headers ?? {}),
    "Content-Type": page ? "text/html; charset=utf-8" : "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(text),
  });
  res.end(text);
}

/**
 * A Node web server around one `handle(request) -> answer`. It never shows an error's own words: a door that throws
 * is logged and answers 500.
 */
export function createHttpServer(handle, { maxBytes = MAX_BODY_BYTES, log = console.error } = {}) {
  const server = createServer(async (req, res) => {
    let answer;
    try {
      answer = await handle(await readRequest(req, { maxBytes }));
    } catch (error) {
      if (error instanceof TooLarge) answer = { status: 413, body: { ok: false, message: error.message }, headers: { Connection: "close" } };
      else {
        try {
          log(`${req.method} ${req.url} failed: ${error?.stack ?? error}`);
        } catch {
          // A broken log never stops the answer.
        }
        answer = { status: 500, body: { ok: false, message: "Something went wrong on our side. Try again in a minute." } };
      }
    }
    writeAnswer(res, answer);
  });
  // A slow sender can't hold a connection open for long.
  server.headersTimeout = 20_000;
  server.requestTimeout = 60_000;
  return server;
}
