import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CLIENT_FILE_TYPES, MAX_CLIENT_FILE_BYTES, cleanClientFile, cleanFileName, downloadName, fileProblem, fileTypeOf, ownFilePath, sizeWords, sortFiles, storedFileName, type ClientFile } from "./clientFiles";

const A = "a".repeat(64);
const B = "b".repeat(64);
const path = `client-files/${A}/file-1-x.pdf`;

describe("client files (Bookings plan 4, 3.2)", () => {
  it("keeps only paths inside the client's own folder", () => {
    expect(ownFilePath(A, path)).toBe(true);
    expect(ownFilePath(A, `client-files/${B}/file-1-x.pdf`)).toBe(false);
    expect(ownFilePath(A, `client-files/${A}/../x.pdf`)).toBe(false);
    expect(ownFilePath(A, `client-photos/${A}/x.jpg`)).toBe(false);
    expect(ownFilePath("x", path)).toBe(false);
  });

  it("works out the type from the browser or from the name's ending", () => {
    expect(fileTypeOf({ name: "Waiver.PDF", type: "" })).toBe("application/pdf");
    expect(fileTypeOf({ name: "brief.docx", type: "application/octet-stream" })).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(fileTypeOf({ name: "photo", type: "image/jpeg" })).toBe("image/jpeg");
    expect(fileTypeOf({ name: "setup.exe", type: "application/x-msdownload" })).toBe("");
    expect(fileTypeOf({ name: "page.html", type: "text/html" })).toBe("");
  });

  it("refuses programs, empty files and files over 20 MB in plain words", () => {
    expect(fileProblem({ name: "a.pdf", type: "application/pdf", size: 100 })).toBe("");
    expect(fileProblem({ name: "a.exe", size: 100 })).toMatch(/isn't a PDF/);
    expect(fileProblem({ name: "a.pdf", size: 0 })).toMatch(/empty/);
    expect(fileProblem({ name: "a.pdf", size: MAX_CLIENT_FILE_BYTES + 1 })).toMatch(/over 20 MB/);
  });

  it("cleans the record a save writes", () => {
    const ok = cleanClientFile({ client: A, email: " Ben@Example.com ", name: "  Signed\nwaiver.pdf ", path, size: 2048.4, type: "application/pdf", addedAt: "2026-11-23T10:00:00.000Z" });
    expect(ok).toEqual({ file: { client: A, email: "ben@example.com", name: "Signed waiver.pdf", path, size: 2048, type: "application/pdf", addedAt: "2026-11-23T10:00:00.000Z" } });
    expect(cleanClientFile({ client: A, email: "b@e.co", name: "x", path: `client-files/${B}/f.pdf`, size: 1, type: "application/pdf", addedAt: "" })).toHaveProperty("problem");
    expect(cleanClientFile({ client: A, email: "b@e.co", name: "x", path, size: 1, type: "text/html", addedAt: "" })).toHaveProperty("problem");
    expect(cleanClientFile({ client: A, email: "b@e.co", name: "x", path, size: MAX_CLIENT_FILE_BYTES + 1, type: "application/pdf", addedAt: "" })).toHaveProperty("problem");
  });

  it("names, sizes and sorts files for the list", () => {
    expect(cleanFileName("", "Fallback")).toBe("Fallback");
    expect(cleanFileName("x".repeat(200))).toHaveLength(120);
    expect(storedFileName("My Brief.DOCX", 5, "a-b_c!")).toBe("file-5-abc.docx");
    expect(storedFileName("noending", 5, "")).toBe("file-5-x.bin");
    expect(sizeWords(300)).toBe("1 KB");
    expect(sizeWords(320 * 1024)).toBe("320 KB");
    expect(sizeWords(4.2 * 1024 * 1024)).toBe("4.2 MB");
    expect(sizeWords(15 * 1024 * 1024)).toBe("15 MB");
    const f = (id: string, addedAt: string): ClientFile => ({ id, client: A, email: "b@e.co", name: id, path, size: 1, type: "application/pdf", addedAt });
    expect(sortFiles([f("old", "2026-01-01"), f("new", "2026-11-01")]).map((x) => x.id)).toEqual(["new", "old"]);
    expect(downloadName({ name: "Waiver: 2026", path })).toBe("Waiver- 2026.pdf");
    expect(downloadName({ name: "Waiver.pdf", path })).toBe("Waiver.pdf");
  });

  it("storage takes exactly the kinds the admin offers", () => {
    const rules = readFileSync(new URL("../../../storage.rules", import.meta.url), "utf8");
    const line = /match \/client-files\/[\s\S]*?contentType\.matches\("([^"]+)"\)/.exec(rules)?.[1] || "";
    const allowed = new RegExp(`^(?:${line.replace(/\[\.\]/g, "\\.")})$`);
    for (const type of Object.keys(CLIENT_FILE_TYPES)) expect(allowed.test(type), type).toBe(true);
    for (const type of ["text/html", "application/x-msdownload", "image/svg+xml", "application/javascript"]) expect(allowed.test(type), type).toBe(false);
  });
});
