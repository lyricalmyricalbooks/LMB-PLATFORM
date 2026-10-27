// Books › edit › Images › Crop & edit. Drag the photo (or use the arrow keys) to choose what stays in view,
// zoom to crop its edges, straighten it or show it whole, adjust light, colour and detail or mirror it, and see it in the shop's own frame shapes. Nothing
// is changed in the uploaded file: the choices are saved on the photo as `framing` and `adjust` and drawn by the
// shop (features/site/photoFraming.ts).
import React, { useEffect, useRef, useState } from "react";
import { Dialog, PrimaryButton, SecondaryButton } from "./riso/components";
import {
  ADJUST_RANGES, DEFAULT_ADJUST, DEFAULT_FRAMING, MAX_STRAIGHTEN, MAX_ZOOM, MIN_ZOOM, adjustToSave, dragFraming, framingStyle, framingToSave,
  isDefaultAdjust, photoAdjust, photoFraming, type AdjustLevel, type PhotoAdjust, type PhotoFraming,
} from "../features/site/photoFraming";
import { PhotoToneDefs } from "../features/site/PhotoToneDefs";
import { smallPhotoUrl } from "../features/site/photoSources";
import { shopFrameShapes } from "./photoCrop";

export function PhotoCropDialog({ photo, label, design, onSave, onClose }: {
  photo: { url: string; altText?: string; framing?: unknown; adjust?: unknown } | null;
  label: string;
  design: unknown;
  onSave: (edit: { framing: PhotoFraming | undefined; adjust: PhotoAdjust | undefined }) => void;
  onClose: () => void;
}) {
  const [framing, setFraming] = useState<PhotoFraming>(DEFAULT_FRAMING);
  const [adjust, setAdjust] = useState<PhotoAdjust>(DEFAULT_ADJUST);
  const [comparing, setComparing] = useState(false);
  const [levelling, setLevelling] = useState(false);
  const shapes = shopFrameShapes(design);
  const [shapeId, setShapeId] = useState(shapes[0].id);
  const shape = shapes.find((s) => s.id === shapeId) || shapes[0];
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; start: PhotoFraming; id: number } | null>(null);

  useEffect(() => {
    if (!photo) return;
    setFraming(photoFraming(photo) || DEFAULT_FRAMING);
    setAdjust(photoAdjust(photo) || DEFAULT_ADJUST);
  }, [photo]);
  if (!photo) return null;

  // Show original (press and hold): the crop stays, the light/colour/detail edits come off while held.
  const shown = comparing ? { framing } : { framing, adjust };
  const edited = !isDefaultAdjust(adjust);
  const set = (next: Partial<PhotoFraming>) => setFraming((f) => ({ ...f, ...next }));
  const tweak = (next: Partial<PhotoAdjust>) => setAdjust((a) => ({ ...a, ...next }));
  // Sliders read as changes from normal (+20, −15); double-click one to put it back.
  const level = (key: AdjustLevel, name: string) => {
    const change = adjust[key] - DEFAULT_ADJUST[key];
    return (
      <label className="be-crop-field">
        <span>{name} · {change > 0 ? "+" : ""}{change}</span>
        <input type="range" min={ADJUST_RANGES[key][0]} max={ADJUST_RANGES[key][1]} step={1} value={adjust[key]}
          onChange={(e) => tweak({ [key]: Number(e.target.value) })}
          onDoubleClick={() => tweak({ [key]: DEFAULT_ADJUST[key] })} />
      </label>
    );
  };
  const holdOriginal = {
    onPointerDown: () => setComparing(true),
    onPointerUp: () => setComparing(false),
    onPointerLeave: () => setComparing(false),
    onPointerCancel: () => setComparing(false),
    onKeyDown: (e: React.KeyboardEvent) => { if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); setComparing(true); } },
    onKeyUp: (e: React.KeyboardEvent) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); setComparing(false); } },
    onBlur: () => setComparing(false),
  };
  const turn = (deg: number) => setFraming((f) => ({ ...f, rotate: Math.round(Math.min(MAX_STRAIGHTEN, Math.max(-MAX_STRAIGHTEN, deg)) * 10) / 10 }));
  const rotate = framing.rotate || 0;
  const whole = framing.fit === "contain";
  // Bars around a photo shown whole: the frame's own colour (none saved), white, black or any colour.
  const BARS: { label: string; value?: string }[] = [{ label: "Frame colour" }, { label: "White", value: "#ffffff" }, { label: "Black", value: "#000000" }];
  const nudge = (dx: number, dy: number) => setFraming((f) => ({
    ...f,
    x: Math.min(100, Math.max(0, Math.round((f.x + dx) * 10) / 10)),
    y: Math.min(100, Math.max(0, Math.round((f.y + dy) * 10) / 10)),
  }));

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={`Crop & edit · ${label}`}
      description="Drag the photo to choose what stays in view, zoom in to crop its edges, straighten it or show it whole, and adjust its light, colour and detail. Your uploaded file is never changed, so you can come back and reset it any time."
      footerStart={<SecondaryButton size="sm" onClick={() => { setFraming(DEFAULT_FRAMING); setAdjust(DEFAULT_ADJUST); }}>Reset all</SecondaryButton>}
      footer={<>
        <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
        <PrimaryButton onClick={() => { onSave({ framing: framingToSave(framing), adjust: adjustToSave(adjust) }); onClose(); }}>Apply</PrimaryButton>
      </>}
    >
      <div className="be-crop">
        <div className="be-crop-main">
          <div className="be-crop-shapes" role="radiogroup" aria-label="Frame shape">
            {shapes.map((s) => (
              <button key={s.id} type="button" role="radio" aria-checked={s.id === shape.id}
                className={`rp-btn rp-btn-sm ${s.id === shape.id ? "rp-btn-primary" : "rp-btn-secondary"}`}
                onClick={() => setShapeId(s.id)}>{s.label}</button>
            ))}
          </div>
          <div
            ref={stage}
            className="be-crop-stage"
            // Never taller than 60% of the window: the width shrinks to keep the frame's shape.
            style={{ aspectRatio: shape.aspect, width: `min(100%, calc(60vh * (${shape.aspect})))` }}
            tabIndex={0}
            role="application"
            aria-label={`Photo position: ${Math.round(framing.x)}% across, ${Math.round(framing.y)}% down. Drag, or use the arrow keys (Shift for bigger steps); [ and ] straighten.`}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.currentTarget.setPointerCapture?.(e.pointerId);
              drag.current = { x: e.clientX, y: e.clientY, start: framing, id: e.pointerId };
            }}
            onPointerMove={(e) => {
              const d = drag.current, el = stage.current;
              if (!d || !el || e.pointerId !== d.id) return;
              setFraming(dragFraming(d.start, e.clientX - d.x, e.clientY - d.y, el.clientWidth, el.clientHeight));
            }}
            onPointerUp={() => { drag.current = null; }}
            onPointerCancel={() => { drag.current = null; }}
            onKeyDown={(e) => {
              const step = e.shiftKey ? 10 : 2;
              const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
              const m = moves[e.key];
              if (m) { e.preventDefault(); nudge(m[0], m[1]); }
              else if (e.key === "+" || e.key === "=") { e.preventDefault(); set({ zoom: Math.min(MAX_ZOOM, Math.round((framing.zoom + 0.1) * 100) / 100) }); }
              else if (e.key === "-") { e.preventDefault(); set({ zoom: Math.max(MIN_ZOOM, Math.round((framing.zoom - 0.1) * 100) / 100) }); }
              else if (e.key === "[" || e.key === "]") { e.preventDefault(); turn(rotate + (e.key === "]" ? 1 : -1) * (e.shiftKey ? 1 : 0.1)); }
            }}
          >
            <PhotoToneDefs photo={shown} />
            <img src={smallPhotoUrl(photo, 1600)} alt={photo.altText || ""} draggable={false} style={framingStyle(shown)} />
            <span className={`be-crop-grid${levelling ? " be-crop-grid-fine" : ""}`} aria-hidden="true" />
            {comparing && <span className="be-crop-original">Original</span>}
          </div>
          <div className="be-crop-tools">
            <button type="button" className="rp-btn rp-btn-sm rp-btn-secondary" disabled={!edited} aria-pressed={comparing} {...holdOriginal}>
              Hold to see the original
            </button>
          </div>
          <p className="be-note">{shape.note}. The shape follows your Studio settings for each place.</p>
        </div>
        <div className="be-crop-side">
          <details className="be-crop-group" open>
          <summary className="be-crop-heading">Crop</summary>
          <label className="be-crop-field">
            <span>Zoom · {Math.round(framing.zoom * 100)}%</span>
            <input type="range" min={MIN_ZOOM} max={MAX_ZOOM} step={0.01} value={framing.zoom} onChange={(e) => set({ zoom: Number(e.target.value) })} />
          </label>
          <label className="be-crop-field">
            <span>Left ↔ right · {Math.round(framing.x)}%</span>
            <input type="range" min={0} max={100} step={0.5} value={framing.x} onChange={(e) => set({ x: Number(e.target.value) })} />
          </label>
          <label className="be-crop-field">
            <span>Top ↕ bottom · {Math.round(framing.y)}%</span>
            <input type="range" min={0} max={100} step={0.5} value={framing.y} onChange={(e) => set({ y: Number(e.target.value) })} />
          </label>
          <label className="be-crop-field">
            {/* A fine grid shows while the slider is in use, to line the book's edges up against. */}
            <span>Straighten · {rotate > 0 ? "+" : ""}{rotate.toFixed(1)}°</span>
            <input type="range" min={-MAX_STRAIGHTEN} max={MAX_STRAIGHTEN} step={0.1} value={rotate}
              onChange={(e) => turn(Number(e.target.value))}
              onDoubleClick={() => turn(0)}
              onPointerDown={() => setLevelling(true)} onPointerUp={() => setLevelling(false)}
              onFocus={() => setLevelling(true)} onBlur={() => setLevelling(false)} />
          </label>
          <div className="be-crop-tools" role="radiogroup" aria-label="Fit in the frame">
            {([[false, "Fill the frame"], [true, "Show whole photo"]] as const).map(([w, name]) => (
              <button key={name} type="button" role="radio" aria-checked={whole === w}
                className={`rp-btn rp-btn-sm ${whole === w ? "rp-btn-primary" : "rp-btn-secondary"}`}
                onClick={() => set(w ? { fit: "contain" } : { fit: undefined, background: undefined })}>{name}</button>
            ))}
          </div>
          {whole && (
            <div className="be-crop-tools" role="radiogroup" aria-label="Colour around the photo">
              {BARS.map((b) => (
                <button key={b.label} type="button" role="radio" aria-checked={framing.background === b.value}
                  className={`rp-btn rp-btn-sm ${framing.background === b.value ? "rp-btn-primary" : "rp-btn-secondary"}`}
                  onClick={() => set({ background: b.value })}>
                  {b.value && <span className="be-crop-swatch" style={{ background: b.value }} aria-hidden="true" />}{b.label}
                </button>
              ))}
              <label className="rp-btn rp-btn-sm rp-btn-secondary be-crop-colour">
                <input type="color" value={framing.background || "#ffffff"} onChange={(e) => set({ background: e.target.value })} />
                Other colour
              </label>
            </div>
          )}
          <div className="be-crop-tools">
            <button type="button" className="rp-btn rp-btn-sm rp-btn-ghost" disabled={framing.x === 50 && framing.y === 50}
              onClick={() => set({ x: 50, y: 50 })}>Centre</button>
            <button type="button" className="rp-btn rp-btn-sm rp-btn-ghost" onClick={() => setFraming(DEFAULT_FRAMING)}>Reset crop</button>
          </div>
          </details>
          <details className="be-crop-group" open>
          <summary className="be-crop-heading">Light</summary>
          {level("brightness", "Brightness")}
          {level("contrast", "Contrast")}
          {level("highlights", "Highlights")}
          {level("shadows", "Shadows")}
          </details>
          <details className="be-crop-group" open>
          <summary className="be-crop-heading">Colour</summary>
          {level("warmth", "Warmth")}
          {level("tint", "Tint")}
          {level("saturation", "Saturation")}
          <div className="be-crop-tools">
            <button type="button" aria-pressed={adjust.saturation === 0}
              className={`rp-btn rp-btn-sm ${adjust.saturation === 0 ? "rp-btn-primary" : "rp-btn-secondary"}`}
              onClick={() => tweak({ saturation: adjust.saturation === 0 ? 100 : 0 })}>Black &amp; white</button>
          </div>
          </details>
          <details className="be-crop-group">
          <summary className="be-crop-heading">Detail &amp; mirror</summary>
          {level("sharpen", "Sharpen")}
          {level("clarity", "Clarity")}
          <div className="be-crop-tools">
            <button type="button" aria-pressed={adjust.flipX}
              className={`rp-btn rp-btn-sm ${adjust.flipX ? "rp-btn-primary" : "rp-btn-secondary"}`}
              onClick={() => tweak({ flipX: !adjust.flipX })}>Flip ↔</button>
            <button type="button" aria-pressed={adjust.flipY}
              className={`rp-btn rp-btn-sm ${adjust.flipY ? "rp-btn-primary" : "rp-btn-secondary"}`}
              onClick={() => tweak({ flipY: !adjust.flipY })}>Flip ↕</button>
          </div>
          </details>
          <div className="be-crop-tools">
            <button type="button" className="rp-btn rp-btn-sm rp-btn-ghost" onClick={() => setAdjust(DEFAULT_ADJUST)}>Reset edits</button>
          </div>
          <div className="be-crop-previews" aria-label="How it looks in each place">
            {shapes.map((s) => (
              <figure key={s.id}>
                <div className="be-crop-thumb" style={{ aspectRatio: s.aspect }}>
                  <PhotoToneDefs photo={shown} />
                  <img src={smallPhotoUrl(photo, 480)} alt="" draggable={false} style={framingStyle(shown)} />
                </div>
                <figcaption>{s.label}</figcaption>
              </figure>
            ))}
          </div>
          <p className="be-note">The enlarged photo viewer on the book page shows the whole photo, with your straighten, light, colour, detail and flip edits.</p>
        </div>
      </div>
    </Dialog>
  );
}
