// The domain service's one-step connect settings (plan 6.15), read only from its own service's environment (Secret
// Manager in the platform project). The private key that signs the domain seller's Allow link is read here and nowhere
// else: no shop project or page ever holds it. Without these settings every press gets the plain-words guide instead
// of the Allow button.
//
//   DOMAIN_CONNECT_PROVIDER_ID   Colophon's id in its registered template (the platform's own domain, like
//                                "colophon.example"); the template is registered with each domain seller (Go-live plan)
//   DOMAIN_CONNECT_SERVICE_ID    the template's service id (default "shop")
//   DOMAIN_CONNECT_PRIVATE_KEY   the RSA private key (PEM; "\n" may be written as \n) that signs each Allow link
//   DOMAIN_CONNECT_KEY_HOST      where the matching public key is published, under the provider id (default "_dck1")
//   DOMAIN_CONNECT_REDIRECT_URL  where the domain seller sends the press back after Allow: this service's
//                                `GET /allowed` door (https://<service>/allowed)
import { createPrivateKey } from "node:crypto";

const text = (value) => (typeof value === "string" ? value.trim() : "");

/** The one-step connect settings, or null when Domain Connect isn't set up (every press then gets the guide). */
export function readDomainConnectConfig(env = {}) {
  const providerId = text(env.DOMAIN_CONNECT_PROVIDER_ID).toLowerCase();
  const pem = text(env.DOMAIN_CONNECT_PRIVATE_KEY).replace(/\\n/g, "\n");
  if (!providerId && !pem) return null;
  if (!providerId || !pem) throw new Error("DOMAIN_CONNECT_PROVIDER_ID and DOMAIN_CONNECT_PRIVATE_KEY go together");
  if (!/^[a-z0-9.-]+$/.test(providerId)) throw new Error("DOMAIN_CONNECT_PROVIDER_ID must be a domain, like colophon.example");
  const serviceId = text(env.DOMAIN_CONNECT_SERVICE_ID) || "shop";
  if (!/^[a-z0-9-]+$/.test(serviceId)) throw new Error("DOMAIN_CONNECT_SERVICE_ID must be letters, numbers and dashes");
  const keyHost = text(env.DOMAIN_CONNECT_KEY_HOST) || "_dck1";
  if (!/^[a-z0-9_-]+$/i.test(keyHost)) throw new Error("DOMAIN_CONNECT_KEY_HOST must be one label, like _dck1");
  const redirectUrl = text(env.DOMAIN_CONNECT_REDIRECT_URL);
  if (!/^https:\/\/[^/\s]+\/\S*$/.test(redirectUrl)) throw new Error("DOMAIN_CONNECT_REDIRECT_URL must be an https address");
  let privateKey;
  try {
    privateKey = createPrivateKey(pem);
  } catch {
    throw new Error("DOMAIN_CONNECT_PRIVATE_KEY isn't a private key in PEM form");
  }
  if (privateKey.asymmetricKeyType !== "rsa") throw new Error("DOMAIN_CONNECT_PRIVATE_KEY must be an RSA key");
  return Object.freeze({ providerId, serviceId, keyHost, redirectUrl, privateKey });
}
