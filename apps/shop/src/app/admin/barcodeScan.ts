// Scanning a barcode with the phone's or computer's camera (code plan 12.12). Uses the browser's own barcode reader
// (BarcodeDetector) where there is one (Chrome on Android, Mac). Everywhere else (iPhone, iPad, Firefox, Windows) a copy
// of the same reader (barcodeFallback.ts: the barcode-detector package, MIT) is loaded the first time someone opens Scan,
// from the shop's own address, never from another company's server. No picture leaves the device either way.

/** Codes worth reading on a book, a box or a label. */
export const SCAN_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"] as const;

type DetectorLike = { detect(source: unknown): Promise<{ rawValue?: string; format?: string }[]> };
type DetectorCtor = { new (options?: { formats?: string[] }): DetectorLike; getSupportedFormats?: () => Promise<string[]> };

const detectorCtor = (): DetectorCtor | null => {
  const w = globalThis as { BarcodeDetector?: DetectorCtor };
  return typeof w.BarcodeDetector === "function" ? w.BarcodeDetector : null;
};

/** True when this device has a camera the page may ask for (the reader itself is always available, see loadReader). */
export const scanSupported = (): boolean =>
  typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

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

export type Reader = { read(video: unknown): Promise<string> };

/** Turns what the camera read into the code wanted, or "" to keep looking. */
export type CleanCode = (raw: unknown, format?: string) => string;

/** Wraps any BarcodeDetector-shaped reader: the first readable code wins, cleaned by its own format. */
export function readerFrom(detector: DetectorLike, clean: CleanCode = cleanScan): Reader {
  return {
    async read(video) {
      const found = await detector.detect(video);
      for (const item of found) {
        const code = clean(item.rawValue, item.format);
        if (code) return code;
      }
      return "";
    },
  };
}

/** The browser's own reader, or null when it has none or it reads none of our formats (Chrome on Windows says so). */
export async function nativeReader(wanted: readonly string[] = SCAN_FORMATS, clean: CleanCode = cleanScan): Promise<Reader | null> {
  const Ctor = detectorCtor();
  if (!Ctor) return null;
  try {
    if (Ctor.getSupportedFormats) {
      const formats = await Ctor.getSupportedFormats();
      if (!wanted.some((f) => formats.includes(f))) return null;
    }
    return readerFrom(new Ctor({ formats: [...wanted] }), clean);
  } catch {
    return null;
  }
}

/** A reader for the formats above: the browser's own, else the bundled copy (loaded only now). */
export async function loadReader(loadFallback: () => Promise<Reader> = async () => (await import("./barcodeFallback")).fallbackReader()): Promise<Reader> {
  return (await nativeReader()) || loadFallback();
}

/** A reader for other codes (a booking's check-in QR code): the browser's own, else the bundled copy. */
export async function loadCodeReader(formats: readonly string[], clean: CleanCode): Promise<Reader> {
  return (await nativeReader(formats, clean)) || (await import("./barcodeFallback")).fallbackReader(formats, clean);
}
