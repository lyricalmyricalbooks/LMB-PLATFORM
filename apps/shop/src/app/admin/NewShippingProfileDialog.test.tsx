import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NewShippingProfileDialog } from "./NewShippingProfileDialog";

describe("New shipping profile window", () => {
  it("opens on the worldwide template with its prices filled in", () => {
    const html = renderToStaticMarkup(
      <NewShippingProfileDialog open onClose={() => {}} profiles={[{ id: "general-profile", name: "General", zones: [] }]} onCreate={async () => true} />,
    );
    expect(html).toContain("New shipping profile");
    expect(html).toContain("Copy another profile");
    expect(html).toContain("Rest of world");
    expect(html).toContain('value="8.00"');
    expect(html).toContain("Create profile");
  });
  it("is laid out like the Masthead pages: no description or hint paragraphs", () => {
    const html = renderToStaticMarkup(
      <NewShippingProfileDialog open onClose={() => {}} profiles={[{ id: "general-profile", name: "General", zones: [] }]} onCreate={async () => true} />,
    );
    expect(html).not.toContain("rp-card-desc");
    expect(html).not.toMatch(/<p class="rp-hint/);
    expect(html).toContain('class="rp-wb-seg"');
  });
  it("hides Copy another profile when there is nothing to copy", () => {
    const html = renderToStaticMarkup(<NewShippingProfileDialog open onClose={() => {}} profiles={[]} onCreate={async () => true} />);
    expect(html).not.toContain("Copy another profile");
  });
});
