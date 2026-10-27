// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { PhotoLightbox } from "./PhotoLightbox";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { document.body.innerHTML = ""; });

const labels = { close: "Close", prev: "Prev", next: "Next", dialog: "Photo", count: "{n} / {total}" };

// A transformed parent (motion, zoom, content-visibility) makes `position: fixed` relative to it, so the
// viewer used to sit inside the product column: header on top, big photos cut off. It must live in <body>.
it("opens in <body> inside a theme wrapper, not inside the product page", async () => {
  const page = document.createElement("div");
  page.style.transform = "translateY(0)";
  document.body.append(page);
  await act(async () => {
    createRoot(page).render(h(PhotoLightbox, { photos: [{ url: "a.jpg", alt: "Cover" }], start: 0, labels, onClose: () => {} }));
  });
  const viewer = document.querySelector("[data-fm-lightbox]")!;
  expect(viewer).toBeTruthy();
  expect(page.contains(viewer)).toBe(false);
  expect(viewer.parentElement?.parentElement).toBe(document.body);
  expect(viewer.parentElement?.hasAttribute("data-fm-store")).toBe(true);
  expect(viewer.querySelector("img")?.className).toContain("max-h-[88vh]");
});
