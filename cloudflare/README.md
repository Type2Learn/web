# Optional Cloudflare locale routing

> Route a first visit to the matching English or Urdu experience without
> building an IP database or retaining an IP address.

Type2Learn is fully usable on Render without Cloudflare. This folder contains
an optional edge worker for a domain proxied through Cloudflare. It keeps both
language versions separately shareable and indexable while making the first
route more welcoming for visitors who prefer Urdu or arrive through a Pakistan
edge location.

## Behaviour

`locale-redirect-worker.js` implements the following rules:

| Situation | Result |
| --- | --- |
| Visitor explicitly chooses `?lang=ur` or `?lang=en` | Choice wins and is stored for one year in the first-party `t2l_locale` cookie |
| Browser prefers Urdu | Redirect to the matching `/ur/` route when no explicit choice exists |
| Cloudflare country is `PK` | Redirect to the matching `/ur/` route when no explicit choice exists |
| Visitor is a crawler | Never redirect; leave English and Urdu pages independently discoverable |
| Other visitor | Keep the matching English route |
| Unsupported route | Pass through untouched to Render |

The worker reads Cloudflare’s transient country code only. It does not store,
log, or forward an IP address.

Supported language pairs include the home page plus How it works, Learning
together, Participation & trust, Team, and their consolidated/legacy route
aliases. Direct Urdu links remain valid regardless of a visitor’s location.

## Deploy it once

1. Add `type2learn.tech` to Cloudflare and keep the DNS record pointing to
   Render **proxied** (orange cloud).
2. Open **Workers & Pages**, create a Worker, and replace the starter code with
   [`locale-redirect-worker.js`](locale-redirect-worker.js).
3. Add the route `type2learn.tech/*`.
4. Deploy the worker after the Render site is already reachable.

## Verify the experience

```text
https://type2learn.tech/?lang=ur
https://type2learn.tech/?lang=en
https://type2learn.tech/team/?lang=ur
```

- The first URL should save the Urdu preference and reach `/ur/`.
- The second should save English and reach `/`.
- The team URL should preserve the route and reach `/ur/team/`.
- Clear `t2l_locale`, then test using Cloudflare’s country simulation or a
  Pakistan network: the first matching request should receive a `302` to its
  Urdu counterpart.
- Open a direct `/ur/.../` link and confirm it remains available even from a
  non-Pakistan IP.

See the [main README](../README.md) for the full product, deployment, search,
and bilingual-route architecture.
