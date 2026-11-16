// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";
import { ZonePage } from "./ZonePage";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
beforeEach(() => { container = document.createElement("div"); document.body.replaceChildren(container); });

const render = (props: Partial<Parameters<typeof ZonePage>[0]> = {}) => {
  const onSave = vi.fn();
  const onCancel = vi.fn();
  act(() => {
    createRoot(container).render(
      <ZonePage zone={{ id: "z1", name: "", countries: [], regions: [], rates: [] }} otherZones={[]} home="CA" isNew profileName="General"
        onSave={onSave} onCancel={onCancel} {...props} />,
    );
  });
  return { onSave, onCancel };
};
const button = (text: string) => [...container.querySelectorAll("button")].find((b) => b.textContent?.replace("✓ ", "").trim() === text)!;
const click = (el: Element) => act(() => { (el as HTMLElement).click(); });
const type = (el: HTMLInputElement, value: string) => act(() => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
});

it("will not save until a place is picked, then names itself and adds the first price", () => {
  const { onSave } = render();
  expect(container.textContent).toContain("Pick at least one place");
  click(button("Add zone"));
  expect(onSave).not.toHaveBeenCalled();

  click(button("Canada"));
  expect(container.querySelector<HTMLInputElement>("input[placeholder='Canada']")?.value).toBe("Canada");
  type(container.querySelector<HTMLInputElement>("input[placeholder='12.00']")!, "12");
  click(button("Add zone"));
  expect(onSave).toHaveBeenCalledTimes(1);
  const [zone, rate] = onSave.mock.calls[0];
  expect(zone).toMatchObject({ id: "z1", name: "Canada", countries: ["CA"], regions: [], continents: [], restOfWorld: false });
  expect(rate).toMatchObject({ name: "Standard shipping", type: "flat", base: 12, additional: 0 });
});

it("search picks a state, and a country held by another zone shows where it lives", () => {
  const { onSave } = render({ otherZones: [{ name: "Home", countries: ["CA"] }] });
  expect(container.textContent).toContain("In Home");
  type(container.querySelector<HTMLInputElement>("input[type='search']")!, "nunavut");
  const hit = container.querySelector(".zp-hit")!;
  expect(hit.textContent).toContain("Nunavut");
  click(hit);
  click(button("Add zone"));
  expect(onSave.mock.calls[0][0]).toMatchObject({ name: "Nunavut", regions: ["CA-NU"], countries: [] });
  expect(onSave.mock.calls[0][1]).toBeNull();
});

it("an existing zone keeps its own name and can be taken back to the profile", () => {
  const { onSave, onCancel } = render({ isNew: false, zone: { id: "z2", name: "Close by", countries: ["US"], regions: [], rates: [{}] } });
  expect(container.querySelector("h1, h2")?.textContent).toBeTruthy();
  click(button("Europe"));
  click(button("Save zone"));
  expect(onSave.mock.calls[0][0].name).toBe("Close by");
  expect(onSave.mock.calls[0][0].countries).toContain("FR");
  click(button("Cancel"));
  expect(onCancel).toHaveBeenCalled();
});

it("opened for Everywhere else, it is already picked", () => {
  const { onSave } = render({ presetEverywhereElse: true });
  expect(container.querySelector("input[type='search']")).toBeNull();
  click(button("Add zone"));
  expect(onSave.mock.calls[0][0]).toMatchObject({ name: "Everywhere else", restOfWorld: true, countries: [] });
});

it("puts Canada and the United States first, open to their provinces and states", () => {
  render();
  const top = container.querySelector("[aria-label='Canada and the United States']")!;
  expect([...top.querySelectorAll(":scope > li .zp-row-name")].map((n) => n.textContent)).toEqual(["Canada", "United States"]);
  expect(container.querySelector("[aria-label='Provinces in Canada']")?.textContent).toContain("Ontario");
  expect(container.querySelector("[aria-label='States in United States']")?.textContent).toContain("Texas");
  expect(container.querySelectorAll("[aria-label='Provinces in Canada']")).toHaveLength(1);
});
