// The bundled barcode reader for browsers without their own (iPhone, iPad, Firefox, Windows). Loaded only from
// barcodeScan.loadReader, the first time someone opens Scan, so it never weighs on the shop or the rest of the admin.
// The reader's engine file is served from the shop's own address (Vite copies it into the build); the package's default
// would fetch it from a public CDN, which we don't want for a shop's admin.
import { BarcodeDetector, prepareZXingModule } from "barcode-detector/ponyfill";
import engineUrl from "zxing-wasm/reader/zxing_reader.wasm?url";
import { readerFrom, SCAN_FORMATS, type Reader } from "./barcodeScan";

let ready = false;

export function fallbackReader(): Reader {
  if (!ready) {
    prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? engineUrl : prefix + path) } });
    ready = true;
  }
  return readerFrom(new BarcodeDetector({ formats: [...SCAN_FORMATS] }));
}
