import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { MEDIA_UPLOAD_ROOT, mediaUploadPath, newMediaId, studioUploadPath, uploadErrorMessage } from "./studio/mediaUpload";

// Every browser upload must land in a Storage folder the admin may write (storage.rules),
// otherwise the upload is refused in production — Studio uploads once silently failed this way.
const ROOT = join(__dirname, "..", "..", "..");
const rules = readFileSync(join(ROOT, "storage.rules"), "utf8");
const writable = [...rules.matchAll(/match \/([\w-]+)\/\{allPaths=\*\*\}\s*\{[^}]*allow write: if isAdmin\(\)/g)].map(m => m[1]);

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sources(full, out);
    else if (/\.tsx?$/.test(name) && !/\.test\./.test(name)) out.push(full);
  }
  return out;
}

describe("upload paths", () => {
  it("reads the admin-writable folders from storage.rules", () => {
    expect(writable).toEqual(expect.arrayContaining(["products", "assets"]));
  });

  it("every literal upload path starts in an admin-writable folder", () => {
    const offenders: string[] = [];
    for (const file of sources(join(ROOT, "src"))) {
      const text = readFileSync(file, "utf8");
      const patterns = [
        /uploadFile\(\s*[^,()]+,\s*[`'"]([\w-]+)\//g,
        /const path = [`'"]([\w-]+)\//g,
        /UPLOAD_ROOT = [`'"]([\w-]+)\//g,
      ];
      for (const pattern of patterns) for (const m of text.matchAll(pattern)) {
        if (!writable.includes(m[1])) offenders.push(`${relative(ROOT, file)}: ${m[1]}/`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("Studio images get dated, safe paths under assets/", () => {
    const path = studioUploadPath("Été Banner (final).JPG", new Date(Date.UTC(2026, 9, 8, 12)));
    expect(path).toMatch(/^assets\/studio\/2026\/10\/\d+-ete-banner-final\.jpg$/);
    expect(writable).toContain(path.split("/")[0]);
    expect(studioUploadPath("....")).toMatch(/\/\d+-image$/);
  });

  it("Media library copies go under assets/media/<id>/, one file per width", () => {
    const path = mediaUploadPath("m1abc", 1728400000000, 960, "summer-960w.webp");
    expect(path).toBe("assets/media/m1abc/1728400000000-960w.webp");
    expect(mediaUploadPath("m/../x", 1, 0, "anim.GIF")).toBe("assets/media/mx/1-original.gif");
    expect(MEDIA_UPLOAD_ROOT).toBe("assets/media");
    expect(writable).toContain(path.split("/")[0]);
    expect(newMediaId()).toMatch(/^m[\w]+$/);
  });

  it("explains failed uploads in plain words", () => {
    expect(uploadErrorMessage({ code: "storage/unauthorized" })).toMatch(/sign in again/);
    expect(uploadErrorMessage(new Error("x"))).toMatch(/try again/);
    expect(uploadErrorMessage({ code: "permission-denied" })).toMatch(/isn't switched on yet/);
  });
});
