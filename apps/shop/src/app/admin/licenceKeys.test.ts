import { describe, expect, test } from "vitest";
import { createRequire } from "module";
import { addKeys, cleanKeys, MAX_KEYS, MAX_KEY_LENGTH } from "./licenceKeys";

const server = createRequire(import.meta.url)("../../../functions/licenceKeys.js");

describe("licence keys in the editor", () => {
  test("pasted keys are cleaned exactly as the server does", () => {
    const text = ` a \r\nb\n\nb\n${"x".repeat(250)}\n\u0007c\u0007\n`;
    expect(cleanKeys(text)).toEqual(server.cleanKeys(text));
    expect([MAX_KEYS, MAX_KEY_LENGTH]).toEqual([server.MAX_KEYS, server.MAX_KEY_LENGTH]);
  });
  test("adding skips keys already waiting and stops at the cap", () => {
    expect(addKeys(["a"], ["a", "b"])).toEqual({ available: ["a", "b"], added: 1, skipped: 1 });
    const full = Array.from({ length: MAX_KEYS }, (_, i) => `k${i}`);
    expect(addKeys(full, ["new"]).added).toBe(0);
  });
});
