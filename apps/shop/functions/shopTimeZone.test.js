// One server runs every shop: the day a discount code ends on is the day of the shop the code is running for.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
const require = createRequire(import.meta.url);
const { readShopConfig } = require("./shopConfig");
const { shopTimeZoneOf } = require("./shared/shopTimeZone");

describe("the shop's time zone on the server", () => {
  it("comes from the shop's record, Eastern time when missing or unknown", () => {
    expect(readShopConfig({}).timeZone).toBe("America/Toronto");
    expect(readShopConfig({ SHOP_TIME_ZONE: "America/Los_Angeles" }).timeZone).toBe("America/Los_Angeles");
    expect(readShopConfig({ SHOP_TIME_ZONE: "somewhere" }).timeZone).toBe("America/Toronto");
    expect(shopTimeZoneOf("America/Chicago")).toBe("America/Chicago");
  });
  it("no server file fixes the shop's day to Toronto", () => {
    const fs = require("node:fs");
    const allowed = { "index.js": 2, "clientErrors.js": 1 }; // two housekeeping timetables and the platform's own error budget
    for (const name of fs.readdirSync(__dirname).filter((n) => n.endsWith(".js") && !n.includes(".test."))) {
      const count = (fs.readFileSync(`${__dirname}/${name}`, "utf8").match(/"America\/Toronto"/g) || []).length;
      expect([name, count]).toEqual([name, allowed[name] || 0]);
    }
  });
});
