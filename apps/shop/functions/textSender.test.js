import { describe, expect, test } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createTextSender } = require("./textSender.js");
const { readShopConfig } = require("./shopConfig.js");

function door(answers) {
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url, headers: options.headers, body: JSON.parse(options.body) });
    const { status = 200, body } = answers(JSON.parse(options.body), calls.length);
    return { ok: status < 300, status, json: async () => body };
  };
  return { fetch, calls };
}

describe("text sender", () => {
  test("asks the platform's door as this shop, and keeps the status a few minutes per shop", async () => {
    const d = door((b) => (b.op === "texts.status" ? { body: { available: true, price: "1.6¢" } } : { body: { ok: true, id: "SM1", parts: 2 } }));
    const clock = { at: 0 };
    let shop = "fern-comb";
    const sender = createTextSender({ url: "https://platform.example/api/texts", shopId: () => shop, serviceKey: () => "k".repeat(40), fetch: d.fetch, now: () => clock.at });
    expect(await sender.status()).toEqual({ available: true, price: "1.6¢", replies: false });
    await sender.status();
    expect(d.calls).toHaveLength(1);
    expect(d.calls[0].url).toBe("https://platform.example/api/texts/shop");
    expect(d.calls[0].headers["X-Shop-Id"]).toBe("fern-comb");
    expect(d.calls[0].headers.Authorization).toBe(`Bearer ${"k".repeat(40)}`);
    shop = "jo-studio";
    await sender.status();
    expect(d.calls).toHaveLength(2);
    clock.at = 6 * 60_000;
    shop = "fern-comb";
    await sender.status();
    expect(d.calls).toHaveLength(3);
    expect(await sender.send({ to: "4165550199", body: "Hi", kind: "booking-reminder", idempotencyKey: "booking-1-reminder" })).toEqual({ ok: true, id: "SM1", parts: 2 });
    expect(d.calls[3].body).toEqual({ op: "texts.send", args: { to: "4165550199", body: "Hi", kind: "booking-reminder", idempotencyKey: "booking-1-reminder" } });
  });

  test("no door, no key, a refusal or a dropped line never throws", async () => {
    const none = createTextSender({ url: "", shopId: "s", serviceKey: () => "k".repeat(40) });
    expect(await none.status()).toEqual({ available: false, price: "", replies: false });
    expect((await none.send({})).ok).toBe(false);
    const noKey = createTextSender({ url: "https://platform.example/api/texts", shopId: "s", serviceKey: () => "", fetch: async () => { throw new Error("no"); } });
    expect((await noKey.send({})).ok).toBe(false);
    const refused = createTextSender({ url: "https://platform.example/api/texts", shopId: "s", serviceKey: () => "k".repeat(40), fetch: door(() => ({ status: 401, body: { error: { message: "This shop can't send texts through the platform." } } })).fetch });
    expect(await refused.send({})).toEqual({ ok: false, retryable: false, message: "This shop can't send texts through the platform." });
    const dropped = createTextSender({ url: "https://platform.example/api/texts", shopId: "s", serviceKey: () => "k".repeat(40), fetch: async () => { throw new Error("socket hang up"); } });
    expect(await dropped.status()).toEqual({ available: false, price: "", replies: false });
  });

  test("the shop's settings read the door's address, https only", () => {
    expect(readShopConfig({ GCLOUD_PROJECT: "lmb-test-shop", PLATFORM_TEXTS_URL: "https://platform.example/api/texts/" }).platformTextsUrl).toBe("https://platform.example/api/texts");
    expect(readShopConfig({ GCLOUD_PROJECT: "lmb-test-shop", PLATFORM_TEXTS_URL: "http://plain.example" }).platformTextsUrl).toBe("");
  });
});

describe("answers by text (plan 4, 3.4)", () => {
  test("replies come from the door, odd ones are dropped, taken ones are passed back, trouble gives none", async () => {
    const d = door((b) => {
      if (b.op === "texts.status") return { body: { available: true, price: "1.6¢", replies: true } };
      if (b.op === "texts.replies") return { body: { replies: [{ id: "SM1", ref: "bk-1001", word: "yes", at: "x" }, { id: "SM2", ref: "bk-1001", word: "maybe" }, { ref: "bk-1" }] } };
      return { body: { ok: true } };
    });
    const sender = createTextSender({ url: "https://platform.example/api/texts", shopId: "fern-comb", serviceKey: "k".repeat(40), fetch: d.fetch });
    expect((await sender.status()).replies).toBe(true);
    expect(await sender.replies()).toEqual([{ id: "SM1", ref: "bk-1001", word: "yes", at: "x" }]);
    await sender.repliesTaken(["SM1"]);
    expect(d.calls.at(-1).body).toEqual({ op: "texts.repliesTaken", args: { ids: ["SM1"] } });
    const broken = createTextSender({ url: "https://platform.example/api/texts", shopId: "fern-comb", serviceKey: "k".repeat(40), fetch: async () => { throw new Error("down"); } });
    expect(await broken.replies()).toEqual([]);
  });
});
