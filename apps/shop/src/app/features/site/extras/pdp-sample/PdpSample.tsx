// A product's free sample (Digital D3b, Beta): an audio or video sample plays in the page (nothing loads until the
// shopper presses play), a PDF opens in a new tab. Shown whenever the product has a sample; the product decides.
import { BookOpen } from "lucide-react";
import { getCopy } from "../../storeCopy";
import { regionProps } from "../../storefrontRegions";
import type { ProductSample } from "./sample";

export default function PdpSample({ design, sample, title }: { design: any; sample: ProductSample; title: string }) {
  const heading = getCopy(design, sample.kind === "audio" ? "pdpSampleListen" : sample.kind === "video" ? "pdpSampleWatch" : "pdpSampleRead");
  return (
    <div {...regionProps("productSample")} className="fm-pdp-sample w-full flex flex-col gap-2 text-left">
      {sample.kind === "read" ? (
        <a href={sample.url} target="_blank" rel="noopener" className="fm-pdp-meta inline-flex items-center gap-2 underline underline-offset-4 min-h-[44px]">
          <BookOpen size={16} aria-hidden="true" />
          {heading}
        </a>
      ) : (
        <>
          <p className="fm-pdp-meta">{heading}</p>
          {sample.kind === "audio"
            ? <audio src={sample.url} controls preload="none" className="w-full" aria-label={`${heading}: ${title}`} />
            : <video src={sample.url} controls preload="none" playsInline className="w-full rounded-xl bg-black" aria-label={`${heading}: ${title}`} />}
        </>
      )}
    </div>
  );
}
