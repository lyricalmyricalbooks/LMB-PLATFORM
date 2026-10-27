// The SVG filters behind a photo's highlights, shadows, warmth, tint, sharpen and clarity edits (features/site/photoFraming.ts
// `photoTone`). Render it beside every photo that gets `framingStyle` / `motionFraming` / `adjustStyle`: the photo's
// CSS filter points at this element by id. It takes no room (absolute, 0×0) and renders nothing for photos without
// those edits. Photos with the same edits share an id, and identical copies on one page are harmless.
import { photoAdjust, photoClarity, photoTone } from "./photoFraming";

export function PhotoToneDefs({ photo }: { photo: unknown }) {
  const adjust = photoAdjust(photo);
  const tone = photoTone(adjust);
  const clarity = photoClarity(adjust);
  if (!tone && !clarity) return null;
  return (
    <svg aria-hidden="true" focusable="false" width="0" height="0" style={{ position: "absolute", width: 0, height: 0, overflow: "hidden", pointerEvents: "none" }}>
      {tone && <filter id={tone.id} colorInterpolationFilters="sRGB" x="0" y="0" width="100%" height="100%">
        {tone.matrix && <feColorMatrix type="matrix" values={tone.matrix} />}
        {tone.table && (
          <feComponentTransfer>
            <feFuncR type="table" tableValues={tone.table} />
            <feFuncG type="table" tableValues={tone.table} />
            <feFuncB type="table" tableValues={tone.table} />
          </feComponentTransfer>
        )}
        {tone.kernel && <feConvolveMatrix order="3" kernelMatrix={tone.kernel} preserveAlpha="true" edgeMode="duplicate" />}
      </filter>}
      {clarity && (
        // The blur is made opaque again (alpha 1 on its un-premultiplied colour), so the photo's edges, where the blur
        // reaches past the photo, are not brightened.
        <filter id={clarity.id} colorInterpolationFilters="sRGB" x="0" y="0" width="100%" height="100%" primitiveUnits="objectBoundingBox">
          <feGaussianBlur in="SourceGraphic" stdDeviation={clarity.blur} />
          <feColorMatrix type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 0 1" result="fm-soft" />
          <feComposite in="SourceGraphic" in2="fm-soft" operator="arithmetic" k1="0" k2={1 + clarity.k} k3={-clarity.k} k4="0" />
        </filter>
      )}
    </svg>
  );
}
