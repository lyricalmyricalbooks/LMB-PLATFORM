import type { AppUpdate } from "../appUpdates";

export default {
  id: "salon-workshop-products",
  date: "2026-11-27",
  title: "Salon and Workshop now show their own products",
  summary: "When you preview the Salon or Workshop website as a shop that sells things, it now shows its own sample products with real photos: hair care from Rosewater Studio and pottery from Clayhouse Studio, instead of borrowed example items. Both also bring a Delivery and returns page. A shop that only takes bookings no longer gets a Shipping & returns page from any starter, since it sends nothing. Nothing is saved, and your own products replace the samples when you use one.",
  links: [
    { label: "Online store", tab: "design" },
  ],
} satisfies AppUpdate;
