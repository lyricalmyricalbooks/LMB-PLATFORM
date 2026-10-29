// Scanning a barcode with the phone's or computer's camera (code plan 12.12). Uses the browser's own barcode reader
// (BarcodeDetector), so there is nothing to install and no picture leaves the device. Browsers without it (most
// desktop ones today) simply don't show the Scan button; typing the code works as before.

/** Codes worth reading on a book, a box or a label. */
export const SCAN_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"] as const;

type DetectorLike = { detect(source: unknown): Promise<{ rawValue?: string }[]> };
type DetectorCtor = { new (options?: { formats?: string[] }): DetectorLike; getSupportedFormats?: () => Promise<string[]> };

const detectorCtor = (): DetectorCtor | null => {
  const w = globalThis as { BarcodeDetector?: DetectorCtor };
  return typeof w.BarcodeDetector === "function" ? w.BarcodeDetector : null;
};

/** True when this browser can read barcodes from the camera. */
export const scanSupported = (): boolean =>
  !!detectorCtor() && typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

/**
 * The code as the shop stores it: an ISBN or EAN is digits only (a trailing X is kept for a ten-digit ISBN); a label's
 * own code (code 128) keeps its letters, trimmed. Empty text for anything unreadable.
 */
export function cleanScan(raw: unknown, format = ""): string {
  const text = String(raw ?? "").trim();
  if (!text) return "";
  if (format === "code_128") return text.replace(/\s+/g, "").slice(0, 60);
  const digits = text.replace(/[^0-9Xx]/g, "").toUpperCase();
  return /^\d{8}$|^\d{12,13}$|^\d{9}[\dX]$/.test(digits) ? digits : "";
}

/** A reader for the formats above, or null when the browser has none. */
export function makeReader(): { read(video: unknown): Promise<string> } | null {
  const Ctor = detectorCtor();
  if (!Ctor) return null;
  const detector = new Ctor({ formats: [...SCAN_FORMATS] });
  return {
    async read(video) {
      const found = await detector.detect(video);
      for (const item of found) {
        const code = cleanScan(item.rawValue);
        if (code) return code;
      }
      return "";
    },
  };
}
