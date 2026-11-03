// Setup mode's only way to the platform (code plan 18.6): the press's setup record, read and saved through the
// platform's web door (signup/frontDoor.js). Before a press opens its shop there is no shop database, so nothing in
// setup mode reads or writes one; every answer lives on `presses/{pressId}` until the shop maker carries it across.

/** The setup record as the platform shows it to its owner (signup/frontDoor.js `shown`). */
export interface SetupPress {
  pressId: string;
  status: "setup" | "opening" | "open" | "expired";
  plan: "" | "shop" | "stockroom" | "both";
  pressName: string;
  sells: string;
  country: string;
  look: string;
  adminLook: string;
  /** Home's "Selling somewhere already?" card (23.0): bringing a shop over, starting fresh, or not answered (""; older records). */
  moving?: "" | "yes" | "fresh";
  /** The product file kept for the shop (18.7), or null. */
  stagedImport: StagedImport | null;
}

/** A kept product file as its owner sees it: never where it is kept. */
export interface StagedImport { name: string; size: number; rows: number; at: string }

export type SetupChange = Partial<Pick<SetupPress, "plan" | "pressName" | "sells" | "country" | "look" | "adminLook" | "moving">>;

/** A plan as GET /api/plans lists it. */
export interface PlanOffer { plan: "shop" | "stockroom" | "both"; name: string; priceText: string; foundingPriceText?: string }
export interface PlanList { plans: PlanOffer[]; trialDays: number; plusTax?: boolean; foundingOffer?: { percentOff: number; presses: number } }

export interface SetupDoor {
  /** The signed-in person's presses, oldest first. */
  presses(): Promise<SetupPress[]>;
  /** Saves answers while the press is in setup; answers with the record as saved. */
  save(pressId: string, change: SetupChange): Promise<SetupPress>;
  /** The plans and prices (public). */
  plans(): Promise<PlanList>;
  /** Keeps a product file for the shop (it was previewed first): asks for an upload link, sends the file, then records it. */
  keepImport(pressId: string, file: Blob, details: { name: string; rows: number }): Promise<SetupPress>;
  /** Throws the kept file away. */
  removeImport(pressId: string): Promise<SetupPress>;
}

const UNREACHABLE = "We couldn't reach Colophon. Check your connection and try again.";

/** The door over HTTP: `apiBase` is the platform's `/api`, `token` the signed-in person's ID token. */
export function platformDoor(apiBase: string, token: () => Promise<string>, fetchImpl: typeof fetch = fetch): SetupDoor {
  async function call(method: string, path: string, body?: unknown, signedIn = true): Promise<any> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (signedIn) headers.Authorization = `Bearer ${await token()}`;
    let response: Response;
    try {
      response = await fetchImpl(`${apiBase}${path}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    } catch {
      throw new Error(UNREACHABLE);
    }
    const answer = await response.json().catch(() => ({ ok: false, message: UNREACHABLE }));
    if (!response.ok || answer?.ok === false) throw new Error(answer?.message || "Something went wrong. Try again.");
    return answer;
  }
  return {
    presses: async () => (await call("GET", "/press")).presses as SetupPress[],
    save: async (pressId, change) => (await call("POST", "/press/setup", { pressId, ...change })).press as SetupPress,
    plans: async () => (await call("GET", "/plans", undefined, false)) as PlanList,
    keepImport: async (pressId, file, { name, rows }) => {
      const { upload } = await call("POST", "/press/import", { pressId, size: file.size });
      let sent: Response;
      try {
        // Straight to the platform's storage: the link takes this one file, of this size, for a few minutes.
        sent = await fetchImpl(upload.url, { method: upload.method || "PUT", headers: upload.headers || {}, body: file });
      } catch {
        throw new Error(UNREACHABLE);
      }
      if (!sent.ok) throw new Error("The file didn't finish sending. Try again.");
      return (await call("POST", "/press/import/kept", { pressId, name, rows })).press as SetupPress;
    },
    removeImport: async (pressId) => (await call("POST", "/press/import/remove", { pressId })).press as SetupPress,
  };
}

/** Which press setup mode opens: the one in the address (`?press=`), else the only one still in setup. */
export function pressToOpen(presses: SetupPress[], wanted: string | null): SetupPress | null {
  if (wanted) return presses.find((p) => p.pressId === wanted) ?? null;
  const inSetup = presses.filter((p) => p.status === "setup");
  return inSetup.length === 1 ? inSetup[0] : null;
}
