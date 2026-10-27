import { describe, expect, it } from "vitest";
import { dataUrlToFile, firstBodyImage, imageSources, pageBodyStats, pastedImageSources, replaceImageSources } from "./pageBody";

const BODY = `<h2>Open call</h2><p>Submissions are&nbsp;now closed.</p>
<p class="ql-align-center"><img src="https://cdn.example/a.webp" alt="Cover spread" width="50%"></p>
<p><img src="data:image/png;base64,iVBORw0KGgo="></p><iframe class="ql-video" src="https://www.youtube.com/embed/x"></iframe>`;

describe("pageBodyStats", () => {
  it("counts words, pictures, missing descriptions, pasted pictures and videos", () => {
    expect(pageBodyStats(BODY)).toEqual({ words: 6, minutes: 1, images: 2, missingAlt: 1, pasted: 1, videos: 1 });
  });
  it("is empty for an empty page", () => {
    expect(pageBodyStats("")).toEqual({ words: 0, minutes: 0, images: 0, missingAlt: 0, pasted: 0, videos: 0 });
    expect(pageBodyStats("<p><br></p>").words).toBe(0);
  });
  it("treats a blank alt as missing", () => {
    expect(pageBodyStats(`<img src="https://x/y.jpg" alt="  ">`).missingAlt).toBe(1);
  });
});

describe("picture sources", () => {
  it("lists distinct sources and picks the first uploaded one", () => {
    expect(imageSources(BODY)).toHaveLength(2);
    expect(firstBodyImage(BODY)).toBe("https://cdn.example/a.webp");
    expect(firstBodyImage(`<img src="data:image/png;base64,AA==">`)).toBe("");
    expect(pastedImageSources(BODY)).toEqual(["data:image/png;base64,iVBORw0KGgo="]);
  });
  it("replaces only the mapped sources and keeps other attributes", () => {
    const out = replaceImageSources(BODY, { "data:image/png;base64,iVBORw0KGgo=": "https://cdn.example/p.webp" });
    expect(out).toContain(`<img src="https://cdn.example/p.webp">`);
    expect(out).toContain(`alt="Cover spread" width="50%"`);
    expect(pastedImageSources(out)).toEqual([]);
  });
});

describe("dataUrlToFile", () => {
  it("turns a base64 picture into a File with a matching extension", () => {
    const file = dataUrlToFile("data:image/jpeg;base64,/9j/4AAQ", "pic")!;
    expect(file.name).toBe("pic.jpg");
    expect(file.type).toBe("image/jpeg");
    expect(file.size).toBe(6);
  });
  it("refuses anything that isn't a picture", () => {
    expect(dataUrlToFile("data:text/html,<b>x</b>")).toBeNull();
    expect(dataUrlToFile("https://x/y.png")).toBeNull();
  });
});
