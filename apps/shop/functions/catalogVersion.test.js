// settings/catalogVersion (catalogVersion.js): stamped after every catalog write, retried in-process, and the
// triggers deploy without `--force` (the deploy workflow never passes it).
import { describe, expect, it } from "vitest";
const fs = require("fs");
const path = require("path");
const { bumpCatalogVersion, touchesCatalogFile, RETRY_DELAYS_MS } = require("./catalogVersion");

const FieldValue = { serverTimestamp: () => "SERVER_TIME" };

function fakeDb(failures) {
  const writes = [];
  let calls = 0;
  const db = {
    collection: c => ({ doc: d => ({ set: async data => {
      calls++;
      if (calls <= failures) throw new Error(`unavailable ${calls}`);
      writes.push({ path: `${c}/${d}`, data });
    } }) }),
  };
  return { db, writes, calls: () => calls };
}

describe("bumpCatalogVersion", () => {
  it("stamps the server time and where the change came from", async () => {
    const { db, writes } = fakeDb(0);
    await bumpCatalogVersion(db, FieldValue, "books/abc");
    expect(writes).toEqual([{ path: "settings/catalogVersion", data: { changedAt: "SERVER_TIME", source: "books/abc" } }]);
  });

  it("retries a failed write before giving up", async () => {
    const slept = [];
    const { db, writes, calls } = fakeDb(2);
    await bumpCatalogVersion(db, FieldValue, "pages/p", { sleep: async ms => { slept.push(ms); } });
    expect(calls()).toBe(3);
    expect(slept).toEqual(RETRY_DELAYS_MS.slice(0, 2));
    expect(writes).toHaveLength(1);
  });

  it("throws after the last try so the failure is logged", async () => {
    const { db, calls } = fakeDb(99);
    await expect(bumpCatalogVersion(db, FieldValue, "settings/website", { sleep: async () => {} })).rejects.toThrow("unavailable");
    expect(calls()).toBe(RETRY_DELAYS_MS.length + 1);
  });
});

describe("touchesCatalogFile", () => {
  it("counts a write only when a published version is involved", () => {
    const published = { status: "published", title: "A" };
    const draft = { status: "draft", title: "A" };
    expect(touchesCatalogFile(draft, { ...draft, title: "B" })).toBe(false); // editing a draft
    expect(touchesCatalogFile(undefined, draft)).toBe(false); // creating a draft
    expect(touchesCatalogFile(draft, undefined)).toBe(false); // deleting a draft
    expect(touchesCatalogFile({ status: "archived" }, { status: "draft" })).toBe(false);
    expect(touchesCatalogFile({ title: "no status" }, { title: "still none" })).toBe(false); // the file never holds these
    expect(touchesCatalogFile(published, { ...published, title: "B" })).toBe(true);
    expect(touchesCatalogFile(draft, published)).toBe(true); // publishing
    expect(touchesCatalogFile(published, draft)).toBe(true); // unpublishing
    expect(touchesCatalogFile(published, undefined)).toBe(true); // deleting a published book
    expect(touchesCatalogFile(undefined, published)).toBe(true);
  });
});

describe("functions deploy without --force", () => {
  it("no function asks for the platform's retry policy", () => {
    // `retry: true` makes `firebase deploy --non-interactive` refuse unless `--force` is passed, and
    // .github/workflows/deploy-firebase.yml deliberately never passes it (it would delete console-made indexes).
    const source = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
    expect(source).not.toMatch(/\bretry\s*:\s*true\b/);
  });
});
