// Puts the Google link together from its clients. The hosted function (not yet) builds the real ones; tests pass the
// pretend ones from fakes.js.
//
//   const link = createGoogleLink({ config: readGoogleConfig(env), google: createGoogleApi({ fetch, app, redirectUrl }),
//     connections, states, registry, auditLog, shopFirebase, domainsCall: domainsBridge(domainService), ownDomain });
//   link.service      the doors (http.js handleGoogle)
//   link.teardown     teardownOnClose / teardownBeforeDelete for the closing sweep's hooks
//   link.status       googleStatus / runAgain for the control room
//   link.gmailSend    for the email service (services/email/index.js `gmailSend`)
import { createGoogleConnect } from "./connect.js";
import { createGoogleTeardown } from "./teardown.js";
import { createGoogleStatus } from "./status.js";
import { createGoogleService } from "./service.js";
import { createTokens } from "./tokens.js";
import { createGmailSend } from "./gmail.js";

export function createGoogleLink({ config, google, connections, states, registry, auditLog, shopFirebase, domainsCall, ownDomain, now = () => Date.now() }) {
  const tokens = createTokens({ google, connections, config, now });
  const connect = createGoogleConnect({ google, tokens, shopFirebase, domainsCall, ownDomain, registry, auditLog, config, now });
  const teardown = createGoogleTeardown({ google, tokens, shopFirebase, domainsCall, ownDomain, registry, auditLog, now });
  const status = createGoogleStatus({ registry, connect, teardown, tokens, now });
  const service = createGoogleService({ config, google, tokens, states, registry, connect, teardown, now });
  const gmailSend = createGmailSend({ google, tokens, registry, config, now });
  return { tokens, connect, teardown, status, service, gmailSend };
}
