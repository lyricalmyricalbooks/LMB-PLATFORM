import { describe, expect, it } from "vitest";
import sync from "./sellsSync";
const { sellsAnswer, syncSells } = sync;

function fakes(websiteSells = undefined) {
  const writes = { website: [], stockroom: [] };
  return {
    writes,
    readWebsiteSells: async () => websiteSells,
    writeWebsiteSells: async answer => { writes.website.push(answer); },
    writeStockroomWords: async answer => { writes.stockroom.push(answer); },
    warn: () => {},
  };
}

describe("what the shop sells reaches the storefront and the stockroom (plan 12.14)", () => {
  it("reads the Settings answer before the sign-up answer", () => {
    expect(sellsAnswer({ sells: "clothing", publishes: "books" })).toBe("clothing");
    expect(sellsAnswer({ publishes: "zines" })).toBe("zines");
    expect(sellsAnswer(null)).toBe("");
  });

  it("a change goes to both", async () => {
    const f = fakes("books");
    expect(await syncSells({ before: { publishes: "books" }, after: { publishes: "books", sells: "clothing" }, ...f })).toEqual({ website: true, stockroom: true });
    expect(f.writes).toEqual({ website: ["clothing"], stockroom: ["clothing"] });
  });

  it("an older shop gets the storefront copy on its next edit, without touching the stockroom", async () => {
    const f = fakes(undefined);
    await syncSells({ before: { publishes: "jewelry" }, after: { publishes: "jewelry", done: { x: "1" } }, ...f });
    expect(f.writes).toEqual({ website: ["jewelry"], stockroom: [] });
  });

  it("nothing to do: no answer, or both already in step", async () => {
    const none = fakes();
    await syncSells({ before: null, after: { done: {} }, ...none });
    const same = fakes("music");
    await syncSells({ before: { sells: "music" }, after: { sells: "music" }, ...same });
    expect([none.writes, same.writes]).toEqual([{ website: [], stockroom: [] }, { website: [], stockroom: [] }]);
  });

  it("a failed storefront copy still updates the stockroom", async () => {
    const f = fakes("books");
    f.writeWebsiteSells = async () => { throw new Error("offline"); };
    expect(await syncSells({ before: { sells: "books" }, after: { sells: "shoes" }, ...f })).toEqual({ website: false, stockroom: true });
  });
});
