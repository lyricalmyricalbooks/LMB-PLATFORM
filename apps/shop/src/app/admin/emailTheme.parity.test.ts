import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as client from "./emailTheme";

const require = createRequire(import.meta.url);
const server = require("../../../functions/emailTheme.js");

describe("Riso email theme", () => {
  it("admin preview mirror matches the server module", () => {
    const strip = (src: string) => src.split("\n").filter((l) => !l.startsWith("//") && !/^(module\.)?export/.test(l)).join("\n");
    const srv = readFileSync(new URL("../../../functions/emailTheme.js", import.meta.url), "utf8");
    const cli = readFileSync(new URL("./emailTheme.ts", import.meta.url), "utf8");
    expect(strip(cli)).toBe(strip(srv));
    for (const theme of ["light", "dark"]) {
      expect(client.risoLayout("<p>Hi</p>", { theme, year: 2026 })).toBe(server.risoLayout("<p>Hi</p>", { theme, year: 2026 }));
    }
  });

  it("supports light and dark, and keeps the accent customizable", () => {
    const light = server.risoLayout("x", { theme: "light", accent: "#1b3fe0" });
    const dark = server.risoLayout("x", { theme: "dark", accent: "#1b3fe0" });
    expect(light).toContain("background:#faf6ec");
    expect(dark).toContain("background:#000000");
    expect(dark).toContain("color:#faf6ec");
    expect(light).toContain("#1b3fe0");
    // the old purple default becomes Riso flare red
    expect(server.risoAccent("#7C3AED")).toBe("#e8402a");
  });

  it("re-points legacy inline styles: square corners, no purple, ink text on the accent", () => {
    const out = server.risoize('<a style="background:#7c3aed;color:#fff;border-radius:8px;">Go</a><div style="font-family:sans-serif;border-radius:16px;">', "", "light");
    expect(out).not.toMatch(/7c3aed|border-radius:\s*[1-9]|sans-serif/i);
    expect(out).toContain("color:#100f0d");
  });
});

describe("order table placement", () => {
  it("puts the table where {{items_table}} sits, and only there", () => {
    const placed = server.placeItemsTable("Hi<br/>{{items_table}}<br/>Bye", "<table>\n<tr></tr>\n</table>");
    expect(placed.body).toBe("Hi<br/><table> <tr></tr> </table><br/>Bye");
    expect(placed.after).toBe("");
    expect(server.placeItemsTable("Hi", "<table></table>")).toEqual({ body: "Hi", after: "<table></table>" });
  });
});

describe("branding that can't break an email", () => {
  it("uses only a #hex accent and an https logo, escaped", () => {
    expect(server.risoAccent('red;"><script>')).toBe("#e8402a");
    expect(server.risoAccent("#1B3FE0")).toBe("#1B3FE0");
    expect(server.safeLogoUrl("javascript:alert(1)")).toBe("");
    expect(server.safeLogoUrl("http://shop.test/logo.png")).toBe("");
    expect(server.safeLogoUrl('https://shop.test/a.png?x=1&y="2"')).toBe("https://shop.test/a.png?x=1&amp;y=&quot;2&quot;");
    const html = server.risoLayout("x", { logoUrl: 'https://x.test/"onerror="alert(1)' });
    expect(html).not.toContain('"onerror="');
    expect(client.safeLogoUrl("https://x.test/l.png")).toBe(server.safeLogoUrl("https://x.test/l.png"));
  });
});
