import { afterEach, describe, expect, it } from "vitest";
import { cleanScan, makeReader, scanSupported } from "./barcodeScan";

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
  it("is unsupported when the browser has no barcode reader, so the button stays hidden", () => {
    expect(scanSupported()).toBe(false);
    expect(makeReader()).toBeNull();
  });
  it("reads the first readable code from what the camera sees", async () => {
    (globalThis as any).BarcodeDetector = class { async detect() { return [{ rawValue: "junk" }, { rawValue: "9780306406157" }]; } };
    expect(await makeReader()!.read({})).toBe("9780306406157");
    (globalThis as any).BarcodeDetector = class { async detect() { return []; } };
    expect(await makeReader()!.read({})).toBe("");
  });
});
