import type { AppUpdate } from "../appUpdates";

export default {
  id: "admin-ux-pass",
  date: "2026-10-19",
  title: "A tidier admin on every page, and it works properly on a phone",
  summary: "The top bar now shows Shop open or Shop closed, with one menu to close or open the shop. Search works on phones, urgent alerts come first and fold after two, and sign-in problems are explained in plain words. Books: the editor has a ⋯ More for this book menu, a Section drop-down on phones, Go to buttons in the Fix these before saving box, and folded cards for customs and the Details-tab rows; the book list shows as cards on phones. Orders: the order page no longer squeezes next to the Ship station queue, and returns are clearer. Settings › General and Payments are grouped into topics with an On this page panel; Shipping rates get a save bar; Taxes has Add a rate for … buttons. Email sender has a status strip with Waiting to send at the top. Reviews have worded Approve and Reject buttons, Messages has Read & reply on each row, Discounts has a shorter table, and gift cards have a labelled Export CSV button. Error messages now say what to do next. What every button does is unchanged.",
  links: [{ label: "Books", tab: "catalog" }, { label: "Orders", tab: "orders" }, { label: "General settings", tab: "settings", settingsTab: "general" }, { label: "Email sender", tab: "settings", settingsTab: "notifications" }],
} satisfies AppUpdate;
