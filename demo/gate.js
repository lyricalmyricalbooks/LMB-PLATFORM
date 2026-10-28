// The sample press's gate (plan 7.7): the only thing a visitor reaches. One small web server per public port
// (hosted.js GATE_PORTS). On the shop's and the stockroom's ports it serves the built app, with /shop-profile.js
// answered by the sample profile (which adds the "Nothing you do here is saved" bar). On the emulators' ports it passes
// each request on to the emulator on this computer, after gateRefusal has turned away the back doors. Plain Node, no
// packages.
import { createServer, request as forward } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import { HOST } from "./config.js";
import { GATE_PORTS, gateRefusal } from "./hosted.js";

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon", ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8", ".xml": "application/xml", ".webmanifest": "application/manifest+json",
};

/** The file for a page address inside `root`, or index.html (the apps route in the page). Never outside `root`. */
export function fileFor(root, pathname) {
  const clean = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, "");
  const file = join(root, clean);
  if (file !== root && !file.startsWith(root.endsWith(sep) ? root : root + sep)) return join(root, "index.html");
  return existsSync(file) && statSync(file).isFile() ? file : join(root, "index.html");
}

function appHandler(root, profile) {
  return (req, res) => {
    const pathname = new URL(req.url ?? "/", "http://gate").pathname;
    if (pathname === "/shop-profile.js") {
      res.writeHead(200, { "Content-Type": TYPES[".js"], "Cache-Control": "no-store" });
      return res.end(profile);
    }
    const file = fileFor(root, pathname);
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(req.method === "HEAD" ? undefined : readFileSync(file));
  };
}

function emulatorHandler(to) {
  return (req, res) => {
    const upstream = forward({ host: HOST, port: to, method: req.method, path: req.url, headers: req.headers }, (answer) => {
      res.writeHead(answer.statusCode ?? 502, answer.headers);
      answer.pipe(res);
    });
    upstream.on("error", () => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    req.pipe(upstream);
  };
}

/**
 * Starts the gate on `listenHost` (every address: "0.0.0.0"). `apps` names each app's built folder and profile script:
 * { shop: { root, profile }, stockroom: { root, profile } }. Returns the servers, to close them.
 */
export function startGate({ listenHost = "0.0.0.0", apps, log = () => {} }) {
  return Object.entries(GATE_PORTS).map(([port, entry]) => {
    const handle = entry.kind === "app" ? appHandler(apps[entry.name].root, apps[entry.name].profile) : emulatorHandler(entry.to);
    const server = createServer((req, res) => {
      const refused = gateRefusal(Number(port), { method: req.method, url: req.url, headers: req.headers });
      if (refused) {
        log(`refused (${refused}): ${req.method} :${port}${req.url}`);
        res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
        return res.end("The sample press is read-only. Nothing you do here is saved.");
      }
      handle(req, res);
    });
    server.listen(Number(port), listenHost);
    return server;
  });
}
