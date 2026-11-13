// jumpWhenShown keeps retrying on a timer; once the page is gone (no window, as after a test's page is torn down)
// a pending try must stop instead of throwing "window is not defined".
import { expect, it } from "vitest";
import { jumpWhenShown } from "./settingsLayout";

it("does nothing when there is no page", () => {
  expect(typeof window).toBe("undefined");
  expect(() => jumpWhenShown("gs-redirects")).not.toThrow();
});
