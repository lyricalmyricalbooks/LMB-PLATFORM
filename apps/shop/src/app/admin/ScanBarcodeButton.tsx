import { useEffect, useRef, useState } from "react";
import { ScanLine } from "lucide-react";
import { Dialog } from "./riso/components";
import { makeReader, scanSupported } from "./barcodeScan";

/** A "Scan" button that fills a code field from the camera. Hidden where the browser can't read barcodes. */
export function ScanBarcodeButton({ onCode, label = "Scan with the camera" }: { onCode: (code: string) => void; label?: string }) {
  const [open, setOpen] = useState(false);
  const [problem, setProblem] = useState("");
  const video = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!open) return;
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer = 0;
    setProblem("");
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
        const el = video.current;
        if (!el) return;
        el.srcObject = stream;
        await el.play();
        const reader = makeReader();
        const look = async () => {
          if (stopped || !reader) return;
          try {
            const code = await reader.read(el);
            if (code) { setOpen(false); onCode(code); return; }
          } catch { /* a frame that can't be read is just skipped */ }
          timer = window.setTimeout(look, 250);
        };
        look();
      } catch {
        setProblem("The camera isn't available. Allow camera access for this page, or type the code instead.");
      }
    })();
    return () => { stopped = true; window.clearTimeout(timer); stream?.getTracks().forEach(t => t.stop()); };
  }, [open]);

  if (!scanSupported()) return null;
  return (
    <>
      <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" onClick={() => setOpen(true)}>
        <ScanLine size={13} aria-hidden /> {label}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Scan a barcode" description="Hold the barcode inside the picture. It fills in by itself when it's read.">
        <video ref={video} muted playsInline aria-label="Camera" style={{ width: "100%", maxHeight: "50vh", background: "#000" }} />
        {problem && <p className="be-warn" role="alert">{problem}</p>}
      </Dialog>
    </>
  );
}
