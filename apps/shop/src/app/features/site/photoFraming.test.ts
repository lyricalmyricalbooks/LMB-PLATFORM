import { describe, expect, it } from "vitest";
import { DEFAULT_ADJUST, STRAIGHTEN_COVERS, photoClarity, photoTone, straightenScale, adjustStyle, adjustToSave, dragFraming, framingStyle, framingToSave, motionFraming, photoAdjust, photoFraming } from "./photoFraming";
import { shopFrameShapes } from "../../admin/photoCrop";
import { PHOTO_RATIOS } from "./photoShapes";

describe("photo crop & placement", () => {
  it("leaves photos without framing exactly as before", () => {
    expect(photoFraming({ url: "a.jpg" })).toBeNull();
    expect(framingStyle({ url: "a.jpg" })).toEqual({});
    expect(framingStyle(undefined, { x: 20, y: 80 })).toEqual({ objectPosition: "20% 80%" });
    expect(motionFraming(null, 1.05)).toEqual({ style: {}, hover: { scale: 1.05 } });
    expect(adjustStyle({ url: "a.jpg" })).toEqual({});
  });

  it("treats a centred, unzoomed framing as none", () => {
    expect(photoFraming({ framing: { x: 50, y: 50, zoom: 1 } })).toBeNull();
    expect(framingToSave({ x: 50, y: 50, zoom: 1 })).toBeUndefined();
  });

  it("places and zooms around the chosen point, beating the frame's own placement", () => {
    const photo = { framing: { x: 30, y: 10, zoom: 1.5 } };
    expect(framingStyle(photo, { x: 50, y: 50 })).toEqual({ objectPosition: "30% 10%", transform: "scale(1.5)", transformOrigin: "30% 10%" });
    expect(framingStyle({ framing: { x: 0, y: 100, zoom: 1 } })).toEqual({ objectPosition: "0% 100%" });
    expect(motionFraming(photo, 2)).toEqual({ style: { objectPosition: "30% 10%", transformOrigin: "30% 10%", scale: 1.5 }, hover: { scale: 3 } });
  });

  it("cleans up bad saved values", () => {
    expect(photoFraming({ framing: { x: -20, y: "140", zoom: 9 } })).toEqual({ x: 0, y: 100, zoom: 3 });
    expect(photoFraming({ framing: { x: "nope", y: 20, zoom: 0.2 } })).toEqual({ x: 50, y: 20, zoom: 1 });
    expect(photoFraming({ framing: "x" })).toBeNull();
  });

  it("moves the point in view against the drag, slower when zoomed", () => {
    const start = { x: 50, y: 50, zoom: 1 };
    expect(dragFraming(start, 100, 0, 400, 400)).toEqual({ x: 25, y: 50, zoom: 1 });
    expect(dragFraming({ ...start, zoom: 2 }, 0, -100, 400, 400)).toEqual({ x: 50, y: 62.5, zoom: 2 });
    expect(dragFraming(start, -10000, 0, 400, 400).x).toBe(100);
    expect(dragFraming(start, 10, 10, 0, 0)).toBe(start);
  });
});

describe("quick photo edits", () => {
  it("saves nothing when nothing changed and cleans up bad values", () => {
    expect(adjustToSave({ ...DEFAULT_ADJUST })).toBeUndefined();
    expect(photoAdjust({ adjust: { brightness: 400, contrast: "20", saturation: -5, flipX: "yes" } }))
      .toEqual({ brightness: 150, contrast: 50, saturation: 0, highlights: 0, shadows: 0, warmth: 0, tint: 0, sharpen: 0, clarity: 0, flipX: false, flipY: false });
  });

  it("draws light and colour as a CSS filter, on top of the crop", () => {
    const photo = { framing: { x: 30, y: 10, zoom: 1.5 }, adjust: { brightness: 120, saturation: 0 } };
    expect(framingStyle(photo)).toEqual({
      objectPosition: "30% 10%", transform: "scale(1.5)", transformOrigin: "30% 10%", filter: "brightness(1.2) saturate(0)",
    });
    // A colour edit alone leaves the frame's own placement alone.
    expect(framingStyle({ adjust: { contrast: 90 } })).toEqual({ filter: "contrast(0.9)" });
    expect(adjustStyle(photo)).toEqual({ filter: "brightness(1.2) saturate(0)" });
  });

  it("mirrors about the frame's centre and keeps the chosen point in view", () => {
    expect(framingStyle({ adjust: { flipX: true } })).toEqual({ objectPosition: "50% 50%", transform: "scale(-1, 1)", transformOrigin: "50% 50%" });
    expect(framingStyle({ framing: { x: 30, y: 50, zoom: 2 }, adjust: { flipX: true } })).toEqual({
      objectPosition: "70% 50%",
      transform: "scale(2) translate(20%, 0%) scale(-1, 1) translate(-20%, 0%)",
      transformOrigin: "30% 50%",
    });
    expect(adjustStyle({ adjust: { flipY: true } })).toEqual({ transform: "scale(1, -1)" });
    // Motion: translate → scale → scaleX, so the centre shift scales with the zoom (resting and on hover).
    expect(motionFraming({ framing: { x: 30, y: 50, zoom: 2 }, adjust: { flipX: true } }, 1.5)).toEqual({
      style: { objectPosition: "70% 50%", transformOrigin: "30% 50%", scale: 2, x: "80%", scaleX: -1 },
      hover: { scale: 3, x: "120%" },
    });
  });
});

describe("straighten and show whole", () => {
  it("saves a turn and the whole-photo fit only when used, and cleans them up", () => {
    expect(photoFraming({ framing: { x: 50, y: 50, zoom: 1, rotate: 0, fit: "cover", background: "#fff" } })).toBeNull();
    expect(photoFraming({ framing: { rotate: "40" } })).toEqual({ x: 50, y: 50, zoom: 1, rotate: 10 });
    expect(photoFraming({ framing: { rotate: -2.345 } })).toEqual({ x: 50, y: 50, zoom: 1, rotate: -2.3 });
    expect(photoFraming({ framing: { fit: "contain", background: "#FFAA00" } })).toEqual({ x: 50, y: 50, zoom: 1, fit: "contain", background: "#ffaa00" });
    expect(photoFraming({ framing: { fit: "contain", background: "red; x" } })).toEqual({ x: 50, y: 50, zoom: 1, fit: "contain" });
    expect(framingToSave({ x: 50, y: 50, zoom: 1, background: "#000000" })).toBeUndefined();
  });

  it("turns about the frame's centre on top of the crop, enlarged to keep the frame filled", () => {
    const s = straightenScale(3);
    expect(framingStyle({ framing: { rotate: 3 } })).toEqual({ objectPosition: "50% 50%", transform: `rotate(3deg) scale(${s})`, transformOrigin: "50% 50%" });
    expect(framingStyle({ framing: { x: 30, y: 50, zoom: 2, rotate: -3 } })).toEqual({
      objectPosition: "30% 50%",
      transform: `translate(20%, 0%) rotate(-3deg) scale(${s}) translate(-20%, 0%) scale(2)`,
      transformOrigin: "30% 50%",
    });
    // Whole photo, its bars coloured: enlarged too, so the bars still fill the frame once turned.
    expect(framingStyle({ framing: { fit: "contain", background: "#ffffff", rotate: 2 } })).toEqual({
      objectFit: "contain", backgroundColor: "#ffffff", objectPosition: "50% 50%", transform: `rotate(2deg) scale(${straightenScale(2)})`, transformOrigin: "50% 50%",
    });
    expect(adjustStyle({ framing: { rotate: 2 }, adjust: { flipX: true } })).toEqual({ transform: "rotate(2deg) scale(-1, 1)" });
  });

  it("enlarges enough for every frame up to 2:1, either way up", () => {
    for (const deg of [0.5, 3, 10]) {
      const t = (deg * Math.PI) / 180;
      for (const { value } of PHOTO_RATIOS) {
        const [w, h] = value.split(":").map(Number);
        const r = Math.max(w / h, h / w);
        if (r > STRAIGHTEN_COVERS) continue; // panorama strips: the documented exception
        expect(straightenScale(deg)).toBeGreaterThanOrEqual(Math.cos(t) + r * Math.sin(t) - 0.001);
      }
    }
    expect(straightenScale(0)).toBe(1);
  });

  it("puts the turn in front of motion's own transform", () => {
    const framed = motionFraming({ framing: { rotate: 4 } }, 1.1);
    expect(framed.style).toMatchObject({ scale: 1, transformOrigin: "50% 50%" });
    const turn = `rotate(4deg) scale(${straightenScale(4)})`;
    expect(framed.transformTemplate!({}, "scale(1.1)")).toBe(`${turn} scale(1.1)`);
    expect(framed.transformTemplate!({}, "none")).toBe(turn);
    expect(motionFraming({ framing: { x: 20, y: 50, zoom: 1.5 } }).transformTemplate).toBeUndefined();
  });
});

describe("Lightroom-style tone edits", () => {
  it("draws clarity as its own SVG filter, sized to the photo", () => {
    const photo = { adjust: { clarity: 50, brightness: 110 } };
    expect(photoClarity(photoAdjust(photo))).toEqual({ id: "fm-clarity-50", k: 0.25, blur: 0.015 });
    expect(framingStyle(photo).filter).toBe("url(#fm-clarity-50) brightness(1.1)");
    expect(photoTone(photoAdjust(photo))).toBeNull();
    expect(photoClarity(photoAdjust({ adjust: { sharpen: 20 } }))).toBeNull();
  });

  it("draws highlights, shadows, warmth, tint and sharpen as one SVG filter the CSS filter points at", () => {
    const photo = { adjust: { warmth: 50, shadows: 40, sharpen: 50, contrast: 110 } };
    const tone = photoTone(photoAdjust(photo))!;
    expect(tone.id).toBe("fm-tone-0-40-50-0-50");
    expect(framingStyle(photo).filter).toBe("url(#fm-tone-0-40-50-0-50) contrast(1.1)");
    expect(adjustStyle(photo).filter).toBe("url(#fm-tone-0-40-50-0-50) contrast(1.1)");
    expect(tone.matrix).toBe("1.075 0 0 0 0 0 1 0 0 0 0 0 0.925 0 0 0 0 0 1 0");
    expect(tone.kernel).toBe("0 -0.3 0 -0.3 2.2 -0.3 0 -0.3 0");
    expect(photoTone(photoAdjust({ adjust: { brightness: 120 } }))).toBeNull();
    expect(photoTone(photoAdjust({ adjust: { highlights: -30 } }))!.id).toBe("fm-tone-m30-0-0-0-0");
  });

  it("keeps black and white fixed and never turns the tone curve back", () => {
    for (const [highlights, shadows] of [[100, 100], [-100, -100], [100, -100], [-100, 100]]) {
      const table = photoTone(photoAdjust({ adjust: { highlights, shadows } }))!.table!.split(" ").map(Number);
      expect(table[0]).toBe(0);
      expect(table[table.length - 1]).toBe(1);
      for (let i = 1; i < table.length; i++) expect(table[i]).toBeGreaterThanOrEqual(table[i - 1]);
    }
    const lifted = photoTone(photoAdjust({ adjust: { shadows: 100 } }))!.table!.split(" ").map(Number);
    expect(lifted[4]).toBeGreaterThan(0.25); // a dark quarter-tone comes up
  });
});

describe("every edited photo has its tone filter beside it", () => {
  it("renders PhotoToneDefs in each file that styles a photo with the edits", async () => {
    const { readFileSync, readdirSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const files: string[] = [];
    const walk = (dir: string) => readdirSync(dir).forEach((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.tsx$/.test(name) && !/\.test\./.test(name)) files.push(path);
    });
    walk("src/app");
    const users = files.filter((f) => /(?:framingStyle|motionFraming)\(/.test(readFileSync(f, "utf8")) || f.endsWith("PhotoLightbox.tsx"));
    expect(users.length).toBeGreaterThan(5);
    for (const f of users) {
      const src = readFileSync(f, "utf8");
      // One beside each framed photo; the enlarged viewer's photos (adjustStyle) get theirs inside PhotoLightbox.
      const framed = (src.match(/(?:framingStyle|motionFraming)\(/g) || []).length;
      const defs = (src.match(/<PhotoToneDefs /g) || []).length;
      expect({ file: f, defs: defs >= Math.max(1, framed) }).toEqual({ file: f, defs: true });
    }
  });
});

describe("shop frame shapes for the crop preview", () => {
  it("follows Studio's card and book-page shapes", () => {
    expect(shopFrameShapes({}).map((s) => [s.id, s.aspect])).toEqual([["card", "1 / 1"], ["page", "3 / 4"]]);
    const shapes = shopFrameShapes({ catalogLayoutStyle: "modern", storefront: { imageAspectRatio: "2:3" }, productPage: { productImageAspect: "4:5" } });
    expect(shapes.map((s) => [s.id, s.aspect])).toEqual([["card", "2 / 3"], ["page", "4 / 5"], ["square", "1 / 1"]]);
  });
});
