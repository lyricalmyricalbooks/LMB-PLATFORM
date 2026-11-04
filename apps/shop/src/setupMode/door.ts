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
  /** The language of the platform's emails: "" automatic (French then English for a Quebec billing address), or a choice. */
  language?: "" | "fr" | "en";
  /** "Your web address": bringing a domain ("own"), gone to buy one ("buy"), the free address for now ("free"), or "". */
  domainChoice?: "" | "own" | "buy" | "free";
  /** The press's own domain, connected when its shop is made, else "". */
  domain?: string;
  /** Where the domain was bought, in the press's words ("GoDaddy"), or "" when not known. */
  domainSeller?: string;
  /** The seller has an Allow window for us: connecting is one press of Allow there. */
  domainEasy?: boolean;
  /** The shop's id once Open my shop has started it (18.8), else "". */
  shopId?: string;
  /** How the shop is starting once opening: "queued", or "in-line" with `shopMessage` saying why it waits. */
  shopStatus?: string;
  shopMessage?: string;
  /** The product file kept for the shop (18.7), or null. */
  stagedImport: StagedImport | null;
}

/** An old shop read from its address (23.2): a product file in the one-line-per-edition layout, and plain notes. */
export interface OldShopRead { host: string; csv: string; products: number; notes: string[] }

/** A kept product file as its owner sees it: never where it is kept. */
export interface StagedImport { name: string; size: number; rows: number; at: string }

export type SetupChange = Partial<Pick<SetupPress, "plan" | "pressName" | "sells" | "country" | "look" | "adminLook" | "moving" | "language" | "domainChoice">>;

/** A plan as GET /api/plans lists it. */
export interface PlanOffer { plan: "shop" | "stockroom" | "both"; name: string; priceText: string; foundingPriceText?: string }
export interface PlanList { plans: PlanOffer[]; trialDays: number; plusTax?: boolean; foundingOffer?: { percentOff: number; presses: number }; termsVersion?: string }

/** What Open my shop answers: the record (now `opening`) and how the shop is starting. */
export interface OpenedShop {
  press: SetupPress;
  /** `queued` while it is made; `in-line` or `later` with `message` when it waits its turn. */
  shop?: { status: string; trialEnd: string | null; message?: string };
}

export interface SetupDoor {
  /** The signed-in person's presses, oldest first. */
  presses(): Promise<SetupPress[]>;
  /** Saves answers while the press is in setup; answers with the record as saved. */
  save(pressId: string, change: SetupChange): Promise<SetupPress>;
  /** The plans and prices (public). */
  plans(): Promise<PlanList>;
  /** Keeps a product file for the shop (it was previewed first): asks for an upload link, sends the file, then records it. */
  keepImport(pressId: string, file: Blob, details: { name: string; rows: number }): Promise<SetupPress>;
  /** Keeps the press's own domain for its shop ("" takes it off); answers with where it was bought. */
  saveDomain(pressId: string, domain: string): Promise<SetupPress>;
  /** Throws the kept file away. */
  removeImport(pressId: string): Promise<SetupPress>;
  /** Reads the old shop's public product list from its address (23.2), as a product file to preview. Keeps nothing. */
  readOldShop(pressId: string, address: string): Promise<OldShopRead>;
  /** Open my shop (18.8): starts the plan and queues the shop. A refusal leaves the press in setup. */
  openShop(pressId: string, choice: { plan: SetupPress["plan"]; termsVersion: string }): Promise<OpenedShop>;
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
    saveDomain: async (pressId, domain) => (await call("POST", "/press/domain", { pressId, domain })).press as SetupPress,
    removeImport: async (pressId) => (await call("POST", "/press/import/remove", { pressId })).press as SetupPress,
    readOldShop: async (pressId, address) => {
      const { host, csv, products, notes } = await call("POST", "/press/old-shop", { pressId, address });
      return { host, csv, products, notes } as OldShopRead;
    },
    openShop: async (pressId, { plan, termsVersion }) => {
      const answer = await call("POST", "/press/open", { pressId, plan, termsAccepted: true, termsVersion });
      return { press: answer.press as SetupPress, ...(answer.shop ? { shop: answer.shop } : {}) };
    },
  };
}

/** Which press setup mode opens: the one in the address (`?press=`), else the only one still in setup. */
export function pressToOpen(presses: SetupPress[], wanted: string | null): SetupPress | null {
  if (wanted) return presses.find((p) => p.pressId === wanted) ?? null;
  const inSetup = presses.filter((p) => p.status === "setup");
  return inSetup.length === 1 ? inSetup[0] : null;
}
