import type { AppUpdate } from "../appUpdates";

export default {
  id: "stockroom-todo-in-admin",
  date: "2026-11-11",
  title: "The stockroom's To-do list is now part of your admin",
  summary: "Stockroom › To-do no longer opens a second app inside a frame. Your admin reads the stockroom's records itself and lists what needs you (stock running low, money to chase, details to fill in), with the same look as every other page. This is the first stockroom page moved over; the others follow one at a time.",
  links: [{ label: "Open Home", tab: "overview" }],
} satisfies AppUpdate;
