// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const { SectionBoundary } = await import("./sectionRender");
const Broken = () => { throw new Error("boom"); };
const page = () => h("main", null,
  h("p", null, "Before"),
  h(SectionBoundary, { sectionId: "s1", type: "HeroSection" }, h(Broken)),
  h("p", null, "After"));

afterEach(() => { document.body.innerHTML = ""; window.history.replaceState(null, "", "/"); });

async function render() {
  const el = document.createElement("div");
  document.body.append(el);
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  await act(async () => { createRoot(el).render(page()); });
  errors.mockRestore();
  return el;
}

it("leaves a failing section out for shoppers instead of blanking the page", async () => {
  const el = await render();
  expect(el.textContent).toBe("BeforeAfter");
});

it("shows a placeholder in the Studio preview", async () => {
  window.history.replaceState(null, "", "/?preview=true");
  const el = await render();
  expect(el.querySelector("[data-section-error='s1']")?.textContent).toMatch(/HeroSection could not be displayed/);
  expect(el.textContent).toContain("After");
});
