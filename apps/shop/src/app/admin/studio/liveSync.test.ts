import { describe, expect, it } from "vitest";
import { decideRemoteChange } from "./studioWorkflow";

const saved = { accentColor: "#000", heroPage: { sections: [] }, copy: { cartTitle: "Bag" } };
const remote = (draft: any, rev = 5) => ({ draft, rev });

describe("live sync — what a save from another tab does here (3.2)", () => {
  it("ignores anything not newer than this tab's revision (including its own saves)", () => {
    expect(decideRemoteChange({ localRev: 5, remote: remote({ ...saved, accentColor: "#f00" }, 5), design: saved, savedDraft: saved }).kind).toBe("ignore");
    expect(decideRemoteChange({ localRev: 6, remote: remote({ ...saved, accentColor: "#f00" }, 5), design: saved, savedDraft: saved }).kind).toBe("ignore");
  });
  it("only moves the revision when the content is the same", () => {
    expect(decideRemoteChange({ localRev: 4, remote: remote(saved), design: { ...saved, accentColor: "#fff" }, savedDraft: saved }).kind).toBe("rebase");
  });
  it("takes theirs when nothing is unsaved here", () => {
    expect(decideRemoteChange({ localRev: 4, remote: remote({ ...saved, accentColor: "#f00" }), design: saved, savedDraft: saved }).kind).toBe("adopt");
  });
  it("combines edits to different settings", () => {
    const d = decideRemoteChange({ localRev: 4, remote: remote({ ...saved, accentColor: "#f00" }), design: { ...saved, copy: { cartTitle: "Your bag" } }, savedDraft: saved });
    expect(d).toMatchObject({ kind: "merge", merged: { accentColor: "#f00", copy: { cartTitle: "Your bag" } } });
  });
  it("reports settings both changed, keeping this tab's value", () => {
    const d = decideRemoteChange({ localRev: 4, remote: remote({ ...saved, accentColor: "#f00", copy: { cartTitle: "Basket" } }), design: { ...saved, accentColor: "#0f0" }, savedDraft: saved });
    expect(d).toMatchObject({ kind: "conflict", paths: ["accentColor"], merged: { accentColor: "#0f0", copy: { cartTitle: "Basket" } } });
  });
});
