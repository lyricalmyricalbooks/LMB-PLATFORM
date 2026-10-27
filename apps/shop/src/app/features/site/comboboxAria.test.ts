import { expect, test } from "vitest";
import { comboboxInputProps, optionId } from "./comboboxAria";

test("#79 an open list names the highlighted option for screen readers", () => {
  const p = comboboxInputProps({ open: true, listId: "l1", activeIndex: 2, count: 5 });
  expect(p.role).toBe("combobox");
  expect(p["aria-expanded"]).toBe(true);
  expect(p["aria-controls"]).toBe("l1");
  expect(p["aria-activedescendant"]).toBe(optionId("l1", 2));
});

test("#79 a closed list, or no highlight, names no option", () => {
  expect(comboboxInputProps({ open: false, listId: "l1", activeIndex: 2, count: 5 })["aria-activedescendant"]).toBeUndefined();
  expect(comboboxInputProps({ open: true, listId: "l1", activeIndex: -1, count: 5 })["aria-activedescendant"]).toBeUndefined();
  expect(comboboxInputProps({ open: true, listId: "l1", activeIndex: 9, count: 5 })["aria-activedescendant"]).toBeUndefined();
  expect(comboboxInputProps({ open: false, listId: "l1", activeIndex: 0, count: 5 })["aria-expanded"]).toBe(false);
});
