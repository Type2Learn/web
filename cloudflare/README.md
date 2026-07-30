# Pakistan and Urdu language routing

The website itself is a Render static site, so it never receives a visitor's country code. `locale-redirect-worker.js` is a small Cloudflare Worker that adds the requested behavior at the edge without any third-party IP-lookup request:

- visitors whose browser prefers Urdu are sent to the matching Urdu page;
- visitors whose Cloudflare edge country is `PK` are sent to the matching Urdu page;
- supported routes include the home page, How it works, Pathways, Learners, Families, Schools, Team, Co-design, Community, and Trust;
- everyone else remains on the matching English page;
- an explicit language choice wins and is saved for one year in the `t2l_locale` first-party cookie;
- crawlers are never redirected, while every English and Urdu route remains separately indexable through canonical, `hreflang`, and sitemap entries;
- the Worker reads only Cloudflare's transient country code. It does not save, log, or send IP addresses anywhere.

## One-time Cloudflare setup

1. Add `type2learn.tech` to Cloudflare and keep the DNS record that points to Render **proxied** (orange cloud).
2. In **Workers & Pages**, create a Worker and replace its starter code with `locale-redirect-worker.js`.
3. Add the Worker route `type2learn.tech/*`. The Worker changes only the supported English/Urdu route pairs; every other route passes through untouched to Render.
4. Deploy the Worker.

## Verify after deployment

- Open `https://type2learn.tech/?lang=ur` in a private window. It should set the Urdu choice and land on `/ur/`.
- Open `https://type2learn.tech/?lang=en`. It should set the English choice and land on `/`.
- Open `https://type2learn.tech/team/?lang=ur`. It should preserve the route and land on `/ur/team/`; switching back should return to `/team/`.
- Clear the `t2l_locale` cookie, then test a Pakistan network or Cloudflare's country simulation. A Pakistan request should receive a `302` to `/ur/`.
- Visit any `/ur/.../` route directly. It must remain available regardless of IP, so people can share Urdu pages and search engines can index them.
