import { expect, it } from "vitest";
import { stepsLeftLine } from "./LaunchChecklist";

it("counts the required steps left in plain words", () => {
  expect(stepsLeftLine(0)).toBe("Everything shoppers need is ready.");
  expect(stepsLeftLine(1)).toBe("1 required step left");
  expect(stepsLeftLine(3)).toBe("3 required steps left");
});
