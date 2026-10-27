// @vitest-environment jsdom
import { act, createElement as h, createRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { StripeCardForm, type StripeCardFormHandle } from "./StripeCardForm";
const fake = vi.hoisted(() => {
  const handlers: Record<string, Record<string, Function>> = {};
  const create = vi.fn((type: string) => ({ on: (event: string, cb: Function) => { (handlers[type] ||= {})[event] = cb; }, mount: vi.fn(), destroy: vi.fn() }));
  return { handlers, create, options: vi.fn(), update: vi.fn(), submit: vi.fn(async () => ({})), confirmPayment: vi.fn(async () => ({ paymentIntent: { id: "pi_test", status: "succeeded" } })) };
});
vi.mock("@stripe/stripe-js", () => ({ loadStripe: async () => ({ elements: (options: unknown) => { fake.options(options); return { create: fake.create, update: fake.update, submit: fake.submit }; }, confirmPayment: fake.confirmPayment }) }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
afterEach(() => { if (root) act(() => root.unmount()); host?.remove(); vi.clearAllMocks(); });
async function render(props: Record<string, unknown> = {}) {
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(h(StripeCardForm, { publishableKey: "pk_test_key", amountCents: 2500, currency: "cad", loadingText: "Loading", errorText: "Failed", expressText: "Wallets", ...props })));
  return host;
}
it("shows express wallets only after Stripe reports an eligible wallet", async () => {
  const view = await render(); const region = view.querySelector('[data-studio-label="Express checkout wallets"]') as HTMLElement;
  expect(region.style.display).toBe("none");
  act(() => fake.handlers.expressCheckout.ready({ availablePaymentMethods: { applePay: false, googlePay: false } }));
  expect(region.style.display).toBe("none");
  act(() => fake.handlers.expressCheckout.ready({ availablePaymentMethods: { applePay: true } }));
  expect(region.style.display).toBe("");
});
it("uses the existing checkout callback and fails the wallet sheet when checkout rejects", async () => {
  const submit = vi.fn(async () => false), failed = vi.fn(); await render({ onExpressConfirm: submit });
  await act(async () => fake.handlers.expressCheckout.confirm({ paymentFailed: failed }));
  expect(submit).toHaveBeenCalledOnce(); expect(failed).toHaveBeenCalledWith({ reason: "fail" });
  expect(fake.confirmPayment).not.toHaveBeenCalled();
});
it("does not open wallets while checkout is unavailable or create them when Studio hides them", async () => {
  await render({ expressEnabled: false }); const resolve = vi.fn(), reject = vi.fn();
  fake.handlers.expressCheckout.click({ resolve, reject }); expect(resolve).not.toHaveBeenCalled(); expect(reject).toHaveBeenCalledOnce();
  act(() => root.unmount()); host.remove(); fake.create.mockClear(); await render({ showExpress: false });
  expect(fake.create).toHaveBeenCalledWith("payment", expect.anything());
  expect(fake.create).not.toHaveBeenCalledWith("expressCheckout", expect.anything());
});
it("keeps a successful express checkout on the shared navigation path", async () => {
  const submit = vi.fn(async () => true), failed = vi.fn(); await render({ onExpressConfirm: submit });
  await act(async () => fake.handlers.expressCheckout.confirm({ paymentFailed: failed }));
  expect(submit).toHaveBeenCalledOnce(); expect(failed).not.toHaveBeenCalled();
  expect(fake.confirmPayment).not.toHaveBeenCalled();
});

it("pairs dropdown text with its background and uses contrasting selected text", async () => {
  await render({ fieldBackground: "#111111", fieldText: "#ffffff" });
  const appearance = fake.options.mock.calls[0][0].appearance;
  expect(appearance.variables.colorBackground).toBe("rgb(17, 17, 17)");
  expect(appearance.variables.colorText).toBe("rgb(255, 255, 255)");
  expect(appearance.rules[".DropdownItem"]).toEqual({ backgroundColor: "var(--colorBackground)", color: "var(--colorText)" });
  expect(appearance.rules[".DropdownItem--highlight"]).toEqual({ backgroundColor: "var(--colorPrimary)", color: "var(--accessibleColorOnColorPrimary)" });
});

it("keeps a white Studio field readable even when its requested text is white", async () => {
  await render({ fieldBackground: "#ffffff", fieldText: "#ffffff" });
  expect(fake.options.mock.calls[0][0].appearance.variables.colorText).toBe("#000000");
});

it("confirms with the server PaymentIntent's exact amount, even after the screen total re-renders", async () => {
  const ref = createRef<StripeCardFormHandle>();
  const props = { ref, publishableKey: "pk_test_key", currency: "cad", loadingText: "Loading", errorText: "Failed" };
  await render({ ...props, amountCents: 7308 });
  act(() => fake.handlers.payment.ready());
  expect(await ref.current!.validate()).toBeNull();
  fake.update.mockClear(); fake.submit.mockClear();
  // The server rounds per line: its intent is 3 cents more than the browser's total.
  act(() => ref.current!.setAmount(7311, "CAD"));
  expect(fake.update).toHaveBeenLastCalledWith({ amount: 7311, currency: "cad" });
  // A re-render with the browser total during the attempt must not put it back.
  await act(async () => root.render(h(StripeCardForm, { ...props, amountCents: 7309 })));
  expect(fake.update).not.toHaveBeenCalledWith({ amount: 7309, currency: "cad" });
  await act(async () => { await ref.current!.confirm("pi_1_secret_x", "https://shop.test/checkout"); });
  // The amount changed after the fields were submitted, so Stripe gets them submitted again first.
  expect(fake.submit).toHaveBeenCalledOnce();
  expect(fake.submit.mock.invocationCallOrder[0]).toBeLessThan(fake.confirmPayment.mock.invocationCallOrder[0]);
  expect(fake.update.mock.calls.at(-1)).toEqual([{ amount: 7311, currency: "cad" }]);
  // A failed attempt hands the form back to the screen total.
  act(() => ref.current!.releaseAmount());
  expect(fake.update).toHaveBeenLastCalledWith({ amount: 7309, currency: "cad" });
});

it("reports the Stripe error type so checkout can tell a decline from a lost connection", async () => {
  const ref = createRef<StripeCardFormHandle>();
  await render({ ref });
  act(() => fake.handlers.payment.ready());
  fake.confirmPayment.mockResolvedValueOnce({ error: { type: "api_connection_error", message: "Network" } } as any);
  const result = await ref.current!.confirm("pi_1_secret_x", "https://shop.test/checkout");
  expect(result).toMatchObject({ error: "Failed", errorType: "api_connection_error" });
});
