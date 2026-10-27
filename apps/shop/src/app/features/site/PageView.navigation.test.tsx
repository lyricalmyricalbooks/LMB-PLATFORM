// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router";
import { expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ data: { settings: { design: {}, policies: {} }, books: [], pages: [
  { id: "about", slug: "about", title: "About", body: "About body", status: "published" },
  { id: "contact", slug: "contact", title: "Contact", body: "Contact body", status: "published" },
  { id: "draft", slug: "draft", title: "Private draft", body: "Private", status: "draft" },
], loading: false, fresh: true }, fetch: vi.fn(() => new Promise(() => {})) }));
vi.mock("./useSiteData", () => ({ useSiteData: () => state.data }));
vi.mock("../../admin/api", () => ({ adminApi: { getPageBySlug: state.fetch } }));
vi.mock("./StoreFooter", () => ({ StoreFooter: () => <footer>Footer</footer> }));
vi.mock("./StoreHeader", () => ({ StoreHeader: () => <header>Shop navigation</header> }));
vi.mock("./StorefrontThemeStyle", () => ({ StorefrontThemeStyle: () => null }));
vi.mock("./NotFoundPage", () => ({ NotFoundContent: () => <p>Missing page</p> }));
vi.mock("../../lib/seo", () => ({ useSEO: () => {} }));
vi.mock("../../components/sectionRender", () => ({ TemplateSections: () => null, GlobalSections: () => null }));
vi.mock("../../components/SectionComponents", async () => {
  const { createContext, useContext } = await import("react");
  const CurrentPageContext = createContext<any>({});
  return { CurrentPageContext, PageContentSection: () => {
    const page = useContext(CurrentPageContext);
    return <main>{page.title} {page.body}</main>;
  } };
});
import { PageView } from "./PageView";

it("switches published pages immediately without a loading screen or duplicate read", async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  const root = createRoot(container);
  let navigate!: ReturnType<typeof useNavigate>;
  function Navigation() { navigate = useNavigate(); return null; }
  try {
    await act(async () => root.render(<MemoryRouter initialEntries={["/page/about"]}><Navigation />
      <Routes><Route path="/page/:slug" element={<PageView />} /></Routes></MemoryRouter>));
    expect(container.textContent).toContain("About body");
    expect(container.querySelector("header")).not.toBeNull();
    await act(async () => navigate("/page/contact"));
    expect(container.textContent).toContain("Contact body");
    expect(container.textContent).not.toContain("About body");
    expect(container.querySelector("header")).not.toBeNull();
    await act(async () => navigate(-1));
    expect(container.textContent).toContain("About body");
    await act(async () => navigate("/page/contact"));
    state.data.pages[1].body = "Updated Studio body";
    await act(async () => navigate("/page/contact?preview=true"));
    expect(container.textContent).toContain("Updated Studio body");
    await act(async () => navigate("/page/draft"));
    // The missing-page content, inside the one shop header and footer (Studio 2.0 · 2.1).
    expect(container.textContent).toBe("Shop navigationMissing pageFooter");
    expect(state.fetch).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); }
});

it("retains navigation on a cold load and renders policies without a separate page read", async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  const root = createRoot(container);
  const original = state.data;
  try {
    state.data = { ...original, pages: [], loading: true };
    await act(async () => root.render(<MemoryRouter initialEntries={["/page/about"]}>
      <Routes><Route path="/page/:slug" element={<PageView />} /></Routes></MemoryRouter>));
    expect(container.querySelector("header")).not.toBeNull();
    expect(container.textContent).toContain("Loading");
    await act(async () => root.unmount());
    state.data = { ...original, settings: { ...original.settings, policies: { returns: "Return policy body" } }, loading: false };
    const policyRoot = createRoot(container);
    try {
      await act(async () => policyRoot.render(<MemoryRouter initialEntries={["/page/policy-returns"]}>
        <Routes><Route path="/page/:slug" element={<PageView />} /></Routes></MemoryRouter>));
      expect(container.textContent).toContain("Return policy body");
      expect(container.querySelector("header")).not.toBeNull();
    } finally { await act(async () => policyRoot.unmount()); }
  } finally { state.data = original; }
});

it("keeps loading, not a 404, while a cached copy is missing a newly published page", async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  const root = createRoot(container);
  const original = state.data;
  try {
    state.data = { ...original, pages: [], loading: false, fresh: false };
    await act(async () => root.render(<MemoryRouter initialEntries={["/page/new-page"]}>
      <Routes><Route path="/page/:slug" element={<PageView />} /></Routes></MemoryRouter>));
    expect(container.textContent).not.toContain("Missing page");
    await act(async () => root.unmount());
    state.data = { ...original, pages: [], loading: false, fresh: true };
    const freshRoot = createRoot(container);
    await act(async () => freshRoot.render(<MemoryRouter initialEntries={["/page/new-page"]}>
      <Routes><Route path="/page/:slug" element={<PageView />} /></Routes></MemoryRouter>));
    // The missing-page content, inside the one shop header and footer (Studio 2.0 · 2.1).
    expect(container.textContent).toBe("Shop navigationMissing pageFooter");
    await act(async () => freshRoot.unmount());
  } finally { state.data = original; }
});
