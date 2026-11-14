import { describe, expect, it } from "vitest";
import { readSocialInput, shopSocialLinks, SOCIAL_NETWORKS, socialIconPath } from "./socialAccounts";

describe("readSocialInput", () => {
  it("turns @names into profile links", () => {
    expect(readSocialInput("instagram", "@moth.press").url).toBe("https://www.instagram.com/moth.press/");
    expect(readSocialInput("tiktok", "mothpress").url).toBe("https://www.tiktok.com/@mothpress");
    expect(readSocialInput("youtube", "@moth").url).toBe("https://www.youtube.com/@moth");
    expect(readSocialInput("twitter", "@moth").url).toBe("https://x.com/moth");
    expect(readSocialInput("bluesky", "moth").url).toBe("https://bsky.app/profile/moth.bsky.social");
    expect(readSocialInput("bluesky", "moth.press").url).toBe("https://bsky.app/profile/moth.press");
    expect(readSocialInput("substack", "Moth").url).toBe("https://moth.substack.com");
    expect(readSocialInput("mastodon", ["@moth", "mastodon.social"].join("@")).url).toBe("https://mastodon.social/@moth");
  });
  it("keeps links to the right site, adding https", () => {
    expect(readSocialInput("instagram", "instagram.com/moth").url).toBe("https://instagram.com/moth");
    expect(readSocialInput("facebook", "http://www.facebook.com/moth").url).toBe("https://www.facebook.com/moth");
    expect(readSocialInput("pinterest", "https://ca.pinterest.com/moth/").url).toBe("https://ca.pinterest.com/moth/");
    expect(readSocialInput("threads", "https://www.threads.net/@moth").url).toBe("https://www.threads.net/@moth");
  });
  it("refuses another site's link and names it plainly", () => {
    const r = readSocialInput("instagram", "https://www.facebook.com/moth");
    expect(r.url).toBe("");
    expect(r.problem).toBe("That link isn't your Instagram page.");
    expect(readSocialInput("instagram", "javascript:alert(1)").url).toBe("");
    expect(readSocialInput("goodreads", "moth").problem).toMatch(/Paste the link/);
  });
  it("leaves blank as blank", () => {
    expect(readSocialInput("instagram", "  ")).toEqual({ url: "" });
  });
});

describe("shopSocialLinks", () => {
  it("prefers Settings' own copy, in the networks' order", () => {
    const links = shopSocialLinks({ social: { youtube: "@m", instagram: "m" }, design: { social: { facebook: "https://facebook.com/x" } } });
    expect(links.map((l) => l.key)).toEqual(["instagram", "youtube"]);
  });
  it("falls back to the older Studio links and skips the made-up Instagram and bad entries", () => {
    expect(shopSocialLinks({ design: { social: { instagram: "https://www.instagram.com/yourpress", twitter: "https://x.com/m", tiktok: "https://facebook.com/no" } } })
      .map((l) => l.url)).toEqual(["https://x.com/m"]);
  });
  it("an emptied Settings copy shows nothing, even with old Studio links", () => {
    expect(shopSocialLinks({ social: {}, design: { social: { twitter: "https://x.com/m" } } })).toEqual([]);
  });
  it("every network has an icon", () => {
    for (const n of SOCIAL_NETWORKS) expect(socialIconPath(n.key).length, n.key).toBeGreaterThan(50);
  });
});

describe("icon order", () => {
  it("puts the owner's order first, then the networks' own order", async () => {
    const { orderedNetworks, moveSocial, shopSocialLinks } = await import("./socialAccounts");
    expect(orderedNetworks(["youtube", "instagram"]).slice(0, 3).map((n) => n.key)).toEqual(["youtube", "instagram", "tiktok"]);
    expect(orderedNetworks("junk")[0].key).toBe("instagram");
    const filled = ["instagram", "tiktok", "youtube"];
    expect(moveSocial(undefined, filled, "youtube", -1)).toEqual(["instagram", "youtube", "tiktok"]);
    expect(moveSocial(undefined, filled, "instagram", -1)).toEqual(filled);
    const links = shopSocialLinks({ social: { instagram: "@a", tiktok: "@b" }, socialOrder: ["tiktok"] });
    expect(links.map((l) => l.key)).toEqual(["tiktok", "instagram"]);
    expect(links[0].path).toBeTruthy();
  });
});
