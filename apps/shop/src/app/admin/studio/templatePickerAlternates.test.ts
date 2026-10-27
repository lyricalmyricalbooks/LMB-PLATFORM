import { describe, expect, it } from "vitest";
import { currentOption, pickerOptions } from "./templatePicker";

describe("page picker with alternate templates (2.8)", () => {
  const options = pickerOptions({
    templates: [{ id: "productPage", label: "Product" }, { id: "collectionPage", label: "Collection" }, { id: "productPage~poetry", label: "Book page · Poetry" }, { id: "collectionPage~photo", label: "Collection page · Photo" }],
    books: [{ slug: "night", title: "Night Pages" }],
    collections: [{ slug: "zines", label: "Zines" }],
  });
  it("lists each alternate under its kind of page", () => {
    expect(options.find(o => o.templateId === "productPage~poetry")).toMatchObject({ group: "Book pages", hint: "Template" });
    expect(options.find(o => o.templateId === "collectionPage~photo")).toMatchObject({ group: "Collections" });
  });
  it("shows the alternate as the current page while it is being edited", () => {
    expect(currentOption(options, { templateId: "productPage~poetry", showGlobal: false, productSlug: "night" })?.label).toBe("Book page · Poetry");
    expect(currentOption(options, { templateId: "productPage", showGlobal: false, productSlug: "night" })?.label).toBe("Night Pages");
  });
});

describe("preview route with a template (2.8)", async () => {
  const { previewRoute } = await import("./studioWorkflow");
  it("maps ?template= to the alternate, and default/none to the default template", () => {
    expect(previewRoute("/books/night?template=poetry&preview=true", "/")).toMatchObject({ templateId: "productPage~poetry", product: "night" });
    expect(previewRoute("/books/night?template=default&preview=true", "/")).toMatchObject({ templateId: "productPage" });
    expect(previewRoute("/collections/zines?template=photo", "/")).toMatchObject({ templateId: "collectionPage~photo" });
    expect(previewRoute("/books/night?template=Bad%20Id", "/")).toMatchObject({ templateId: "productPage" });
  });
});
