import type { AppUpdate } from "../appUpdates";

export default {
  id: "events-door",
  date: "2026-11-17",
  title: "Events and tickets: check people in at the door",
  summary: "Events (Beta) now has a door. On an event with tickets sold, press At the door, then type a ticket's code or scan it with your phone's camera. You see whose ticket it is and \"Checked in\", or a clear warning when that code was already used, so one ticket gets one person in. A count shows how many have arrived, each ticket in the guest list has its own Check in and Undo, you can find a guest by name, email or code, and the downloaded guest list says who arrived. Your customers' ticket page now shows a QR code for each ticket to make scanning quick. The Events link on your website also comes down by itself once your last event is over.",
  links: [{ label: "Events", tab: "events" }],
} satisfies AppUpdate;
