// Starts one app's Vite dev server for the demo (run by demo/run.js from inside apps/shop or apps/stockroom). It uses
// the app's own Vite and vite.config, and only changes two things: the port, and /shop-profile.js, which is answered
// with the demo profile instead of the app's own file. The emulator switch arrives as Vite settings in the environment
// (config.js viteEnv).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { HOST } from "./config.js";

/** A Vite plugin that answers the page's /shop-profile.js with `script` (never the apps' own src/lib/shop-profile.js). */
export function demoProfilePlugin(script) {
  return {
    name: "demo-shop-profile",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = new URL(req.url ?? "/", "http://demo").pathname;
        if (path !== "/shop-profile.js") return next();
        res.setHeader("Content-Type", "text/javascript; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.end(script);
      });
    },
  };
}

async function main() {
  const port = Number(process.env.DEMO_PORT);
  const script = readFileSync(process.env.DEMO_PROFILE_FILE, "utf8");
  // The app's own Vite (each app has its own node_modules).
  const { createServer } = await import(pathToFileURL(join(process.cwd(), "node_modules", "vite", "dist", "node", "index.js")).href);
  const server = await createServer({
    server: { host: HOST, port, strictPort: true, open: false },
    clearScreen: false,
    logLevel: "warn",
    plugins: [demoProfilePlugin(script)],
  });
  await server.listen();
  console.log(`ready on http://${HOST}:${port}/`);
  const stop = () => server.close().finally(() => process.exit(0));
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(error?.message ?? error);
    process.exit(1);
  });
}
