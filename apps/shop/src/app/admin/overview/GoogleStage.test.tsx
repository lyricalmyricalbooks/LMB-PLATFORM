// @vitest-environment jsdom
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const g = vi.hoisted(() => ({
  state: { mode: "platform", status: { enabled: false }, error: null } as any,
  outcome: null as any,
  connectLink: vi.fn(async () => "https://accounts.example/allow"),
  reload: vi.fn(),
}));
vi.mock("../googleConnect", async (real) => ({
  GOOGLE_PARTS: (await real<any>()).GOOGLE_PARTS,
  googleConnectApi: { connectLink: g.connectLink },
  takeGoogleOutcome: () => g.outcome,
  useGoogleConnect: () => ({ ...g.state, reload: g.reload }),
}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const { GoogleStage } = await import("./GoogleStage");

let root: Root | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; vi.clearAllMocks(); g.outcome = null; g.state = { mode: "platform", status: { enabled: false }, error: null }; });
const flush = async () => { for (let i = 0; i < 12; i++) await act(async () => { await new Promise(r => setTimeout(r, 0)); }); };
const text = () => document.body.textContent || "";
const button = (label: string) => [...document.querySelectorAll("button")].find(b => b.textContent?.trim() === label) as HTMLButtonElement | undefined;

async function mount() {
  const onDone = vi.fn(async () => {});
  const host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(h(GoogleStage, { onDone })));
  await flush();
  return onDone;
}

describe("Get started, step 4: Google in one sign-in (plan 17.9)", () => {
  it("while Google hasn't approved the sign-in, it says it is coming, and the run goes on", async () => {
    const onDone = await mount();
    expect(text()).toContain("Step 4 of 8");
    expect(text()).toContain("Connecting Google is coming soon");
    await act(async () => { button("Carry on")!.click(); });
    await flush();
    expect(onDone).toHaveBeenCalledWith({ at: expect.any(String), coming: true });
  });

  it("with Google switched on, Connect Google is offered, and Connect later is always there", async () => {
    g.state = { mode: "platform", status: { enabled: true, connected: false, steps: [] }, error: null };
    const onDone = await mount();
    expect(button("Connect Google")).toBeDefined();
    await act(async () => { button("Connect later")!.click(); });
    await flush();
    expect(onDone).toHaveBeenCalledWith({ at: expect.any(String), skipped: true });
  });

  it("once connected, it lists what Google linked in plain words, and Continue records it", async () => {
    g.state = { mode: "platform", status: { enabled: true, connected: true, steps: [
      { step: "analytics", state: "done", detail: "" },
      { step: "searchConsole", state: "waiting", detail: "" },
    ] }, error: null };
    const onDone = await mount();
    expect(text()).toContain("Google is connected");
    const tile = (name: string) => [...document.querySelectorAll(".gg-tile")].find((t) => t.querySelector("strong")?.textContent === name)?.textContent;
    expect(tile("Google Analytics")).toContain("Working");
    expect(tile("Google search")).toContain("Waiting on Google");
    expect(text()).toContain("Settings › Google");
    expect(text()).not.toContain("searchConsole");
    await act(async () => { button("Continue")!.click(); });
    await flush();
    expect(onDone).toHaveBeenCalledWith({ at: expect.any(String), connected: true });
  });

  it("a connection Google ended asks for a new sign-in with the extras already chosen, not a green badge", async () => {
    g.state = { mode: "platform", status: { enabled: true, connected: true, needsReconnect: true, extrasChosen: ["drive"], steps: [] }, error: null };
    await mount();
    expect(text()).not.toContain("Google is connected");
    expect(text()).toContain("Google asks you to sign in again");
    await act(async () => { button("Reconnect Google")!.click(); });
    await flush();
    expect(g.connectLink).toHaveBeenCalledWith(["drive"]);
  });

  it("a cancelled sign-in on Google's page says so, and asks nothing else", async () => {
    g.state = { mode: "platform", status: { enabled: true, connected: false, steps: [] }, error: null };
    g.outcome = "denied";
    await mount();
    expect(text()).toContain("the sign-in was cancelled on Google's page");
  });

  it("when the status can't be read, it says so and offers to try again", async () => {
    g.state = { mode: "error", status: null, error: "Couldn't read your Google connection." };
    await mount();
    expect(document.querySelector("[role=alert]")?.textContent).toContain("Couldn't read your Google connection.");
    await act(async () => { button("Try again")!.click(); });
    expect(g.reload).toHaveBeenCalledTimes(1);
  });
});
