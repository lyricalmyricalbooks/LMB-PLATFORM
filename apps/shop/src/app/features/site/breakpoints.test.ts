import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { DEVICE_MEDIA, PHONE_MAX, TABLET_MAX, UP_TO } from "./breakpoints";

// Studio's phone/tablet settings must switch at one width everywhere. Built-in page elements
// once switched to phone layout at 639px while sections switched at 767px.
const APP = join(__dirname, "..", "..");
function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) { if (name !== "admin" && name !== "ui") sources(full, out); }
    else if (/\.tsx?$/.test(name) && !/\.test\./.test(name)) out.push(full);
  }
  return out;
}

describe("Studio device breakpoints", () => {
  it("are disjoint and contiguous", () => {
    expect(DEVICE_MEDIA.mobile).toBe(`(max-width:${PHONE_MAX}px)`);
    expect(DEVICE_MEDIA.tablet).toBe(`(min-width:${PHONE_MAX + 1}px) and (max-width:${TABLET_MAX}px)`);
    expect(DEVICE_MEDIA.desktop).toBe(`(min-width:${TABLET_MAX + 1}px)`);
    expect(UP_TO.mobile).toBe(DEVICE_MEDIA.mobile);
  });

  it("no storefront code uses the old 639px/640px phone switch", () => {
    const offenders = sources(APP).filter(file => /(max-width:\s*639px|min-width:\s*640px)/.test(readFileSync(file, "utf8")));
    expect(offenders.map(f => relative(APP, f))).toEqual([]);
  });
});
