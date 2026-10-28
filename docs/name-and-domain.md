# Name and domain

**The product is called Colophon** (Julian, 28 October 2026). The waitlist page and the platform's settings
(`services/settings.js`, `PLATFORM_NAME`) use it. `waitlist/page.test.js` keeps the page and the settings on the same name.

## The domain: not chosen yet

Nothing has been registered or bought. Pick one, buy it at a registrar yourself, then set `PLATFORM_DOMAIN` (the
platform's settings use the placeholder `platform.example` until then).

### Check which are free

```
node waitlist/domain-check.js
```

It asks each name's registry over RDAP, the public replacement for WHOIS, and prints one line per name:

- **registered**: someone already owns it.
- **not registered**: it may be free to buy. A registrar has the final word, because some names are reserved or cost a premium price.
- **unknown**: the registry didn't answer. Try again later.

It only reads and never registers anything. To check other names, list them after the command:
`node waitlist/domain-check.js colophon.press colophonbooks.com`.

The check could not run from the build machine on 28 October 2026, because its network blocks the registries. Run it
on your own computer.

### Candidates, best first

| Name | Why |
| --- | --- |
| `colophon.com` | The plainest. Probably taken: "colophon" is a common word in publishing. |
| `colophon.press` | Says who it is for. A short, memorable ending for a press product. |
| `colophon.shop` | Says what it does. |
| `colophon.app` | Common for software. It works only over https, which the platform uses anyway. |
| `colophon.ca` | The platform is Canadian and starts in Canada. You need a Canadian presence to register a .ca name. |
| `getcolophon.com`, `usecolophon.com`, `colophonhq.com` | Fallbacks when `colophon.com` is taken: a .com name people can guess. |
| `colophon.co`, `colophon.store`, `colophon.studio`, `colophon.supply` | Other short endings. Some cost more each year. |

Before buying, also check that nobody in publishing already trades as "Colophon" in a way a customer could confuse
with this product. That is a trademark question, not a domain one, and the checker can't answer it.
