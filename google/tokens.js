// A press's Google tokens, kept sealed like Square's and QuickBooks' (../services/payments/tokenSeal.js, key
// GOOGLE_TOKEN_KEY), bound to the shop so a sealed token copied to another shop's record won't open. The store only ever
// holds the sealed text, the permissions Google gave and the Google account's address.
//
//   connections  get(shopId) -> { sealed, scopes, accountEmail, extras, accessExpiresAt, connectedAt, revokedAt } | null;
//                set(shopId, value)
import { seal, unseal } from "../services/payments/tokenSeal.js";
import { GoogleError } from "./googleApi.js";

const REFRESH_BEFORE_MS = 5 * 60 * 1000;

export function createTokens({ google, connections, config, now = () => Date.now() }) {
  const bound = (shopId) => `google/${shopId}`;
  const key = () => {
    if (!config.tokenKey) throw new GoogleError(503, "The Google link isn't set up on the platform yet");
    return config.tokenKey;
  };
  const live = (conn) => Boolean(conn?.sealed && !conn.revokedAt);
  /** Google no longer honours the press's grant (revoked, password changed, unused for six months, over the limit). */
  const needsReconnect = (conn) => live(conn) && Boolean(conn.reconnectAt);

  return {
    live,
    needsReconnect,
    get: (shopId) => connections.get(shopId),

    /** Keeps a fresh grant. Google sends a refresh token only on the first Allow; a later one keeps the old. */
    async save(shopId, granted, { accountEmail, extras = [] }) {
      const before = await connections.get(shopId);
      let refreshToken = granted.refreshToken;
      if (!refreshToken && live(before)) refreshToken = unseal(key(), bound(shopId), before.sealed).refreshToken;
      if (!refreshToken) throw new GoogleError(400, "Google gave no lasting access");
      const value = {
        shopId, accountEmail, extras, scopes: granted.scopes,
        sealed: seal(key(), bound(shopId), { accessToken: granted.accessToken, refreshToken }),
        accessExpiresAt: granted.accessExpiresAt,
        connectedAt: before?.connectedAt && live(before) ? before.connectedAt : new Date(now()).toISOString(),
        revokedAt: null,
        reconnectAt: null,
      };
      await connections.set(shopId, value);
      return value;
    },

    /**
     * A usable access token, refreshed five minutes before it runs out; null when the shop has no live grant or Google has
     * ended it. A refused refresh (invalid_grant) is remembered as "needs reconnect" (plan 15.15) so callers stop asking at
     * once and fall back (order emails go from Colophon's sender); signing in again clears it. Other failures are thrown.
     */
    async fresh(shopId) {
      const conn = await connections.get(shopId);
      if (!live(conn) || conn.reconnectAt) return null;
      const opened = unseal(key(), bound(shopId), conn.sealed);
      if (conn.accessExpiresAt && Date.parse(conn.accessExpiresAt) - now() > REFRESH_BEFORE_MS) {
        return { token: opened.accessToken, scopes: conn.scopes, accountEmail: conn.accountEmail, extras: conn.extras ?? [] };
      }
      let renewed;
      try {
        renewed = await google.refresh(opened.refreshToken);
      } catch (err) {
        if (err instanceof GoogleError && err.grant === "invalid_grant") {
          await connections.set(shopId, { ...conn, accessExpiresAt: null, reconnectAt: new Date(now()).toISOString() });
          return null;
        }
        throw err;
      }
      await connections.set(shopId, {
        ...conn,
        sealed: seal(key(), bound(shopId), { accessToken: renewed.accessToken, refreshToken: renewed.refreshToken ?? opened.refreshToken }),
        accessExpiresAt: renewed.accessExpiresAt,
        scopes: renewed.scopes?.length ? renewed.scopes : conn.scopes,
      });
      return { token: renewed.accessToken, scopes: renewed.scopes?.length ? renewed.scopes : conn.scopes, accountEmail: conn.accountEmail, extras: conn.extras ?? [] };
    },

    /** Gives Colophon's access back to the press's Google account and forgets the tokens. Safe to run twice. */
    async revoke(shopId) {
      const conn = await connections.get(shopId);
      if (!live(conn)) return { revoked: false };
      const { refreshToken } = unseal(key(), bound(shopId), conn.sealed);
      // Revoking the refresh token ends every access token made from it.
      await google.revoke(refreshToken);
      await connections.set(shopId, { ...conn, sealed: null, accessExpiresAt: null, revokedAt: new Date(now()).toISOString() });
      return { revoked: true };
    },
  };
}
