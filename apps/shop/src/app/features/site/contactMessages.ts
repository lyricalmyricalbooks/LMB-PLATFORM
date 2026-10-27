// Contact-form submissions → Firestore `contactMessages` (create-only for the public,
// see firestore.rules). The `onContactMessage` Cloud Function emails each one to the shop.
export type ContactMessageInput = {
  name: string;
  email: string;
  phone?: string;
  subject?: string;
  message: string;
  page?: string;
};

export function buildContactMessage(input: ContactMessageInput) {
  return {
    name: input.name.slice(0, 120),
    // Lower-cased so a privacy export/erase for the address finds this message whatever capitalisation was typed.
    email: input.email.trim().toLowerCase().slice(0, 254),
    phone: (input.phone || "").slice(0, 40),
    subject: (input.subject || "").slice(0, 200),
    message: input.message.slice(0, 5000),
    page: (input.page || "").slice(0, 300),
    status: "new" as const,
  };
}

export async function submitContactMessage(input: ContactMessageInput) {
  const [{ addDoc, collection, serverTimestamp }, { liteDb }] = await Promise.all([
    import("firebase/firestore/lite"),
    import("../../../lib/firestoreLite"),
  ]);
  await addDoc(collection(liteDb, "contactMessages"), { ...buildContactMessage(input), createdAt: serverTimestamp() });
}
