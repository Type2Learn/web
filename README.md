# Type2Learn website

Official static, multi-page website for Type2Learn Active Learning, an education initiative being developed with a nonprofit mission. It uses page-specific photography, module identity marks, Manrope and Cormorant Garamond fonts, GSAP ScrollTrigger, and Three.js. Cloudflare Web Analytics and Google Analytics (`G-9ER1QJLGCW`) are loaded on every HTML page.

The supplied Type2Learn logo is used unchanged in the header and as the browser favicon. The founder's supplied portrait appears first. Co-founder portraits edited from supplied images are labelled as such, and profiles without an approved portrait use a clearly labelled non-human editorial figure.

## Run locally

From the repository root:

```sh
python3 -m http.server 8000 --bind 0.0.0.0
```

Then open `http://localhost:8000`.

## Deploy on Render

The root-level `render.yaml` defines a Render Node web service with `npm ci`, `npm start`, and `/api/v1/health` as the health check. Create a Render Blueprint from this repository. For the protected learning features, add the Firebase Admin credentials plus `GEMINI_API_KEY_1` (and optional numbered rotation keys) in Render’s encrypted environment. `OPENAI_API_KEY` and `OPENAI_RESPONSES_URL` are optional server-side fallback credentials. Do not place any of these values in client-side JavaScript or public files.

Every primary public route has its own directory and `index.html`, so no single-page-app rewrite is needed. Privacy and Terms are full, standalone, indexable documents at `/privacy/` and `/terms/`, with downloadable copies of the supplied source PDFs. Render redirects the former Research page into How it works, Support into Community, and the legacy Accessibility and Security routes into the relevant Trust-center sections.

Every primary marketing page has a dedicated Urdu counterpart under `/ur/`, including How it works, Pathways, Learners, Families, Schools, Team, Co-design, Community, and Trust. Each route is an independently indexable right-to-left experience with self-hosted Urdu fonts, mirrored photography and visual direction, route-to-route language switching, and reciprocal `hreflang` metadata. Browser Urdu preferences route visitors to the matching Urdu page; exact Pakistan-IP routing is available through the privacy-preserving Cloudflare Worker in [`cloudflare/`](cloudflare/), after the domain is proxied through Cloudflare.

The centered account experience is available at `/login/`. All marketing CTA buttons lead into that route; there is no separate header sign-in link. Its seven-scene learner slideshow progressively loads compressed images instead of fetching every photograph at startup. Firebase Authentication powers email/password sign-in, registration, remembered local or session persistence, Google popup/redirect sign-in, password-reset email delivery, authenticated account state, and sign-out. Successful sign-in routes into the protected `/learn/` after-login home. The project must keep Email/Password and Google enabled in Firebase Authentication, with `type2learn.tech` in its authorized-domain list.

The `/learn/` route is a temporary authenticated learning home for the next import phase, with `/afterlogin/` kept as a literal alias during development. It includes a desktop auto-hide sidebar inspired by the `newwebsite` workspace behavior, mobile-friendly static navigation, and the Type2Learn companion mascot from the working preview. Unauthenticated visitors are sent back to `/login/?next=%2Flearn%2F`.

## Adaptive Recall Engine

The protected course includes a real, server-side Adaptive Recall Engine rather than browser-embedded API keys or an unrestricted chatbot. On a learner's own-word recall response, it returns validated structured feedback: evidence found, one missing concept, one support mode, a concise strength-first message, and one next prompt. The learner can revise their response and see the improvement identified between attempts.

`I’m stuck` is a separate, barrier-specific route for the current step only: unclear instruction, a step that feels too large, difficult words, trouble starting, too much on screen, or worry about being wrong. It does not regenerate the lesson or diagnose the learner. Gemini Flash Lite is the primary provider with key rotation; OpenAI is the server-side fallback. Neither provider key nor the model endpoint is sent to the browser. Invalid model output, unavailable models, unauthenticated sessions, and quota limits all fall back to an authored, deterministic current-step support.

The engine code-enforces these limits: no complete answer before an attempt, no diagnosis, no rankings or speed scores, no answer-key context, a maximum of two feedback sentences, and JSON validation before any model result reaches the learner.

## LinkedIn campaign

Publication-ready 4:5 campaign images, a featured project overview, caption openers, alt text, and source files are in [`campaign/linkedin-2026-07/`](campaign/linkedin-2026-07/). The campaign uses the strict supplied logo, dated web-analytics figures, honest prototype labels, and one consistent invitation for neurodivergent contributors to contact `contact@type2learn.tech`.

Images are compressed WebP assets where source fidelity allows it, and below-the-fold `<img>` elements use lazy loading, asynchronous decoding, and low fetch priority. The original supplied PNG logo stays unchanged. No image build service or runtime image transformation is required on Render.

## Search indexing

Every primary route has a unique title, description, canonical URL, Open Graph and Twitter metadata, index directives, and Schema.org structured data. Duplicate legacy routes are excluded from indexing and canonicalized to their consolidated pages.

The homepage and founding-team routes include their core identity, named team, active-development status, and co-design status directly in the initial HTML for non-JavaScript crawlers. `/co-design/` and `/ur/co-design/` publish the intended contributor groups, decisions, feedback process, consent/privacy/safeguarding requirements, compensation-status requirement, and a truthful status ledger. The site does not claim completed external neurodivergent co-design or clinical validation while that work remains in preparation.

- Sitemap: `https://type2learn.tech/sitemap.xml`
- Crawler rules: `https://type2learn.tech/robots.txt`

Submit the sitemap URL in Google Search Console after deployment. The sitemap also includes the primary page and team images so eligible image assets can be discovered with their page context.

## Motion and accessibility

The Motion control in the header disables the pinned and decorative animation experience. System-level `prefers-reduced-motion` receives the same static presentation. Core content and navigation remain usable without animation.

Desktop sections use browser-native snap stops to prevent a fast wheel gesture from skipping a complete section. Vertical wheel, arrow-key, and horizontal trackpad gestures move in the same forward/backward section sequence. Legal documents and mobile pages keep natural document scrolling; mobile also receives lightweight, touch-native versions of the visual experiences.

## Official channels

- GitHub: https://github.com/Type2Learn
- LinkedIn: https://www.linkedin.com/company/type2learn/

## Policy publication status

The Privacy Policy and Terms of Service reproduce the substantive text supplied in the official PDF pack. The source documents identify themselves as publication drafts and contain unresolved operator, address, market, vendor, payment, and governing-law requirements. Those requirements remain visibly disclosed on the web pages and must be completed with qualified counsel before the documents become operative policies.

## Website credit

Built with **native.builder** for Type2Learn, from **3 August to 6 August**. Human direction, product context, and accessibility standards shaped every decision.
