import { describe, expect, it } from "vitest";
import { chosenTabOrder, orderTabs } from "./pdpTabOrder";

const tabs = ["description", "artist", "specs", "policies", "reviews"].map((id) => ({ id }));
const ids = (t: { id: string }[]) => t.map((x) => x.id).join(",");

describe("orderTabs", () => {
  it("keeps the built-in order when nothing is chosen", () => {
    expect(orderTabs(tabs, {})).toBe(tabs);
    expect(orderTabs(tabs, undefined)).toBe(tabs);
  });
  it("puts chosen tabs first and the rest after in their built-in order", () => {
    expect(ids(orderTabs(tabs, { pdpTabOrder1: "specs", pdpTabOrder2: "description" }))).toBe("specs,description,artist,policies,reviews");
  });
  it("ignores blanks, repeats and unknown values", () => {
    expect(chosenTabOrder({ pdpTabOrder1: "reviews", pdpTabOrder2: "", pdpTabOrder3: "reviews", pdpTabOrder4: "nope", pdpTabOrder5: "artist" })).toEqual(["reviews", "artist"]);
  });
  it("skips chosen tabs that aren't on this page", () => {
    const some = tabs.filter((t) => t.id !== "artist");
    expect(ids(orderTabs(some, { pdpTabOrder1: "artist", pdpTabOrder2: "reviews" }))).toBe("reviews,description,specs,policies");
  });
});
