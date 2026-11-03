import { afterEach, describe, expect, it } from "vitest";
import { cleanScan, loadReader, nativeReader, scanSupported } from "./barcodeScan";

afterEach(() => { delete (globalThis as any).BarcodeDetector; });

describe("barcode scanning", () => {
  it("keeps a real ISBN or EAN as digits and drops anything else", () => {
    expect(cleanScan("978-0-306-40615-7")).toBe("9780306406157");
    expect(cleanScan(" 9780306406157 \n")).toBe("9780306406157");
    expect(cleanScan("0306406152")).toBe("0306406152");
    expect(cleanScan("080442957x")).toBe("080442957X");
    expect(cleanScan("96385074")).toBe("96385074");
    expect(cleanScan("123")).toBe("");
    expect(cleanScan("hello")).toBe("");
    expect(cleanScan(null)).toBe("");
  });
  it("keeps a label's own code with its letters", () => {
    expect(cleanScan(" TEE-M 01 ", "code_128")).toBe("TEE-M01");
  });
  it("hides the button only where there is no camera to ask for", () => {
    expect(scanSupported()).toBe(false);
  });
  it("uses the bundled reader where the browser has none of its own (iPhone, Firefox)", async () => {
    expect(await nativeReader()).toBeNull();
    const bundled = { read: async () => "bundled" };
    expect(await loadReader(async () => bundled)).toBe(bundled);
  });
  it("uses the bundled reader when the browser's own reads none of our codes (Chrome on Windows)", async () => {
    (globalThis as any).BarcodeDetector = class { static async getSupportedFormats() { return ["qr_code"]; } async detect() { return []; } };
    expect(await nativeReader()).toBeNull();
  });
  it("prefers the browser's own reader and never loads the bundled one then", async () => {
    (globalThis as any).BarcodeDetector = class { static async getSupportedFormats() { return ["ean_13", "qr_code"]; } async detect() { return [{ rawValue: "9780306406157", format: "ean_13" }]; } };
    const reader = await loadReader(async () => { throw new Error("must not load"); });
    expect(await reader.read({})).toBe("9780306406157");
  });
  it("reads the first readable code from what the camera sees", async () => {
    (globalThis as any).BarcodeDetector = class { async detect() { return [{ rawValue: "junk" }, { rawValue: "9780306406157" }]; } };
    expect(await (await nativeReader())!.read({})).toBe("9780306406157");
    (globalThis as any).BarcodeDetector = class { async detect() { return []; } };
    expect(await (await nativeReader())!.read({})).toBe("");
  });
  it("keeps a label's own code, letters and all, when the reader says it is a code 128", async () => {
    (globalThis as any).BarcodeDetector = class { async detect() { return [{ rawValue: "TEE-M01", format: "code_128" }]; } };
    expect(await (await nativeReader())!.read({})).toBe("TEE-M01");
  });
});
