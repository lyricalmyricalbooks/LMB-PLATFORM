import { afterEach, describe, expect, it, vi } from "vitest";

const success = vi.fn();
const error = vi.fn();
vi.mock("react-hot-toast", () => ({ default: { success: (...a: any[]) => success(...a), error: (...a: any[]) => error(...a) } }));

import { copyText } from "./clipboard";

afterEach(() => { success.mockReset(); error.mockReset(); vi.unstubAllGlobals(); });

describe("copyText", () => {
  it("reports success only after the clipboard accepted the text", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    expect(await copyText("SAVE10")).toBe(true);
    expect(success).toHaveBeenCalledWith("Code copied");
  });
  it("reports a failure instead of a false success", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    expect(await copyText("SAVE10", "Link")).toBe(false);
    expect(success).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
  });
});
