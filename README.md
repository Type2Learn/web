# Type2Learn — learning that asks you to take part

> **Read. Recall. Type. Apply. Return.**

Type2Learn is an education product being developed with a nonprofit mission. It
turns learning from a passive activity into a gentle, active loop: learners
encounter one clear idea, express it in their own words, receive useful support,
and return to that idea in a meaningful context.

It is not a typing-speed product. Typing is one way to make thinking visible.
There are no leaderboards, streak pressure, speed rankings, diagnoses, or
assumptions about what a learner needs.

**Live product:** [type2learn.tech](https://type2learn.tech) · **LinkedIn:**
[Type2Learn](https://www.linkedin.com/company/type2learn/) · **Contact:**
[contact@type2learn.tech](mailto:contact@type2learn.tech)

---

## Why Type2Learn

Different minds need different conditions for participation—not different
expectations of dignity. Type2Learn is built around that principle.

| Learners can | The product responds with |
| --- | --- |
| Work one small step at a time | A calm task sequence with clear next actions |
| Read, recall, type, speak, and apply | Multiple ways to engage without measuring speed |
| Choose the presentation that helps today | Focused, Balanced, and Open layouts; Flat, Balanced, and Vivid colour styles; controllable spacing, motion, sound, and mascot support |
| Ask for help without starting over | Bounded “I’m stuck” choices and course-aware support |
| Continue at their own pace | Save-and-return behaviour, optional read-aloud, background noise, and a pressure-free learning flow |

The public site presents Type2Learn’s purpose, research direction, participation
record, team, and trust commitments. The protected course turns those principles
into a working learning experience.

## Product at a glance

### One learning journey, designed around agency

1. **Discover** — explore the bilingual English/Urdu public site.
2. **Enter your learning space** — sign in with Firebase or continue locally as
   a guest where the feature is available.
3. **Choose a course** — start with *Introduction to Neurodivergent Conditions*;
   upcoming learning tracks remain clearly locked rather than implying they are
   available.
4. **Choose course-specific preferences** — language, layout, colour, spacing,
   encouragement, animation, background noise, text-to-speech, and mascot
   presentation are all learner-controlled.
5. **Learn actively** — read, complete guided typing, respond to checks, and
   apply an idea in a new situation.
6. **Get the smallest useful support** — use *Explain this step*, *I’m stuck*,
   read-aloud, an authored visual explanation, or the optional companion.
7. **Check understanding without a score screen** — optional, one-question-at-a-
   time assessments use typed/spoken answers and MCQs, then offer the next
   helpful step rather than a ranking.

### Designed for real variation

- **Bilingual by design:** public routes and course presentation support English
  and Urdu, including right-to-left layout and Urdu typography. Type2Learn stays
  in English as the product name.
- **Responsive and motion-aware:** desktop uses rich but controlled interaction;
  mobile is lighter, static where appropriate, and does not load the 3D mascot.
  `prefers-reduced-motion` and the in-product motion choice are respected.
- **Multiple ways to participate:** keyboard, mouse, touchpad, touch, optional
  text-to-speech, browser/speech transcription paths, visual explanations, and
  clear focus states all have a place in the experience.
- **A companion only when wanted:** the mascot is optional, has no automatic
  audio, and is not loaded on screens too small to present it well.
- **A polished public presence:** individual, indexable pages; page-specific
  imagery; team and participation content; full privacy/terms documents;
  metadata, JSON-LD, `robots.txt`, and `sitemap.xml`.

## Adaptive learning, with guardrails

Type2Learn’s AI features are deliberately narrow. The product does not use an
unrestricted chatbot as a substitute for curriculum or learner judgement.

| Capability | What it does | What it will not do |
| --- | --- | --- |
| **Adaptive Recall** | Looks for curriculum concepts in a learner’s own explanation and offers one concise next support: a hint, simpler framing, example, or application prompt. | Write the answer before an attempt, diagnose a learner, reveal a rubric, or rank ability. |
| **I’m stuck** | Lets a learner name the barrier—unclear instructions, a task that feels too large, difficult words, uncertainty about starting, too much on screen, or worry about being wrong—then adjusts only the current step. | Regenerate the whole lesson or make a claim about the learner. |
| **Learning summaries** | When a signed-in learner explicitly opts in, stores a minimal aggregate summary to offer one reversible, specific preference proposal after a module. | Upload keystroke logs, raw audio, permanent chat history, or a hidden behavioural profile. |
| **Understanding checks** | Delivers one question at a time, with authored fallback banks when a provider is unavailable. Learners see next steps, never numerical scores or answer keys. | Expose correct answers, visible percentages, speed scores, or endless retesting. |
| **Visual explanations** | Provides authored, accessible concept maps in the visual/mascot rail. | Generate stereotyped learner images or make visuals the only way to learn. |

AI is **Gemini-first with bounded key rotation** and a server-side OpenAI
fallback. Provider credentials, answer keys, hidden rubrics, and model prompts
stay on the server. Every model response is schema-validated and has an
authored deterministic fallback.

Some adaptive capabilities require an enabled server flag, a signed-in user,
and explicit learner consent. AI-generated visual assets and an automated data
retention job are intentionally not enabled. Read the precise implementation,
feature flags, safeguards, and rollout requirements in
[AI_ADAPTIVE_LEARNING_README.md](AI_ADAPTIVE_LEARNING_README.md).

## Feature status

| Area | Available in this repository | Deployment condition |
| --- | --- | --- |
| Public English and Urdu experience | Yes | Static assets served by the Node application; optional Cloudflare locale worker for country-aware first visit |
| Login, registration, Google sign-in, reset password | Yes | Firebase Authentication must be configured for the deployment domain |
| Guided course and local guest progress | Yes | Runs without an AI provider; signed-in progress needs Firebase Admin credentials |
| Manual learning controls | Yes | Learner-controlled; background audio and speech never start by themselves |
| Course AI and Adaptive Recall | Yes | Signed-in learner plus configured provider and Firebase; local guest preview is intentionally development-only |
| Consent-gated adaptive summaries/proposals | Implemented | `ADAPTIVE_LEARNING_ENABLED=true`, signed-in learner, Firebase, and learner opt-in |
| Reviewed assessment banks and fallback checks | Implemented | `AI_ASSESSMENTS_ENABLED=true`, adaptive consent, Firebase, and reviewer workflow for generated banks |
| AI-generated visual assets | Intentionally disabled | Requires separate moderation, storage, retention, and curriculum-review work |

## Repository map

```text
.
├── index.html                         # English public landing page
├── styles.css / app.js                # Shared public-site visual system and interaction
├── experience.js                      # Scroll-led public storytelling and motion controls
├── ur/                                # Mirrored, RTL Urdu public routes
├── how-it-works/                      # Public “How it works” page
├── learning-together/                 # Learner, family, and educator pages
├── participation-trust/               # Participation record, interviews, trust content
├── team/                              # Team presentation
├── privacy/ and terms/                # Standalone, indexable policy pages
├── login/                             # Firebase sign-in, registration, password reset
├── learn/ and afterlogin/             # Learner entry / compatibility route
├── course/
│   ├── index.html                     # Protected course surface
│   ├── course.js                      # Course state, activities, feedback, controls
│   ├── course-content.js              # English curriculum content and objectives
│   ├── course-urdu.js                 # Urdu course copy/presentation
│   ├── learner-settings.js            # Course preference persistence and UI
│   ├── learning-telemetry.js          # Consent-aware aggregate event collection
│   ├── visual-explanations.js         # Authored accessible concept-map rail
│   ├── narration.js                   # Read-aloud and cue/highlighting support
│   └── mascot-2d.js / mascot-3d.js    # Optional companion presentation
├── server.mjs                         # HTTP server, security headers, API routing
├── server/
│   ├── config.mjs                     # Environment parsing and safe runtime limits
│   ├── model-provider.mjs             # Gemini rotation + OpenAI fallback
│   ├── ai-service.mjs                 # Bounded Course AI
│   ├── adaptive-recall-service.mjs    # Structured recall feedback / barrier support
│   ├── adaptive-support-service.mjs   # Consent-gated proposals and copy
│   ├── assessment-service.mjs         # One-question assessment runs and evaluation
│   ├── fallback-assessment-bank.mjs   # Authored no-provider assessment reserve
│   ├── learning-analytics-service.mjs # Minimal summary, export, and deletion routes
│   └── firebase-runtime.mjs           # Firebase Admin boundary
├── assets/                            # Brand, people, public photography, mascot, audio, rewards
├── assets/audio/voice-library/         # Compressed, named voice assets and usage notes
├── cloudflare/                         # Optional privacy-preserving Pakistan/Urdu edge routing
├── security/api.env.example            # Safe local configuration template — no secrets
├── tests/                              # Node, AI boundary, auth, voice, and UI test suites
├── render.yaml                         # Render Blueprint configuration
├── sitemap.xml and robots.txt          # Search-engine discovery rules
└── AI_ADAPTIVE_LEARNING_README.md      # AI product, privacy, assessment, and rollout spec
```

## Important locations

| If you need to change… | Start here |
| --- | --- |
| A public page’s layout or shared style | `styles.css`, `app.js`, and the relevant route’s `index.html` |
| Public motion or scroll treatment | `experience.js`, `website-scheme.js`, `website-scheme.css` |
| Urdu copy and right-to-left presentation | `ur/`, `urdu.css`, `locale-routing.js` |
| Course activity flow or support moments | `course/course.js` |
| Course curriculum | `course/course-content.js`, `course/course-urdu.js` |
| Course colour, layout, noise, motion, encouragement, or accessibility preferences | `course/learner-settings.js`, `course/course.css` |
| Login and Firebase client behaviour | `login/`, `firebase-auth.js`, `guest-session.js` |
| AI routing, safety policy, API limits, and key rotation | `server/config.mjs`, `server/model-provider.mjs`, `server/ai-service.mjs` |
| Adaptive-support and assessment rules | `server/adaptive-policy.mjs`, `server/adaptive-support-service.mjs`, `server/assessment-*.mjs` |
| Deployment secrets | Render environment variables or ignored `security/api.env` — **never browser code** |

## Run locally

### Prerequisites

- Node.js **20–24**
- npm
- Firebase configuration only when testing authenticated save/AI/speech paths

```bash
git clone https://github.com/Type2Learn/web.git
cd web
npm ci
cp security/api.env.example security/api.env
npm start
```

Open [http://localhost:4173](http://localhost:4173). The server reads the
ignored `security/api.env` file plus normal environment variables. Leave the
template placeholders in place until you have real server-side credentials.

Useful commands:

```bash
npm run dev       # restart automatically while developing
npm test          # Node/unit test suite
npm run test:ui   # focused UI test script
```

### Local configuration principles

- Put secrets only in ignored `security/api.env` or encrypted deployment
  variables—never in HTML, client JavaScript, screenshots, commits, or docs.
- Start with adaptive and assessment flags disabled. Each has its own consent,
  authentication, budget, and review boundary.
- A local guest AI preview is deliberately separate from public guest access and
  is enabled only with a non-production development flag.
- Use `security/api.env.example` as the authoritative list of safe variable
  names and defaults.

## Deploy on Render

The repository includes a Render Blueprint in
[render.yaml](render.yaml). It installs dependencies with `npm ci`, runs
`npm start`, and checks `/api/v1/health`.

1. Create a Render Blueprint from the `main` branch of this repository.
2. Add the necessary encrypted environment variables in Render—not in Git.
3. Configure Firebase Authentication’s authorized domains for your Render and
   production domain.
4. Deploy, then verify `/api/v1/health`, `/`, `/ur/`, `/login/`, and `/course/`.
5. Enable adaptive or assessment flags only after their consent and review
   requirements are ready.

The public server provides restrictive static-file serving, secure response
headers, no-store API responses, a health endpoint, and cache-safe public
asset handling.

### Optional Cloudflare locale routing

The website is fully usable without an edge worker. If `type2learn.tech` is
proxied by Cloudflare, [`cloudflare/locale-redirect-worker.js`](cloudflare/locale-redirect-worker.js)
can send an initial Pakistan request or Urdu-preference browser to the matching
Urdu route without retaining an IP address. See
[cloudflare/README.md](cloudflare/README.md) for setup and verification.

## Search, trust, and privacy

- Dedicated public routes have canonical URLs, descriptions, Open Graph/Twitter
  metadata, structured data, and reciprocal English/Urdu `hreflang` metadata.
- Search discovery files are available at
  [sitemap.xml](https://type2learn.tech/sitemap.xml) and
  [robots.txt](https://type2learn.tech/robots.txt).
- Policy pages are standalone, indexable documents. Their supplied source text
  still contains publication-draft details that need qualified legal review
  before they become operative policies.
- Type2Learn is educational—not diagnostic, medical, clinical, or crisis
  support. The product never presents an interaction pattern as a learner trait.

## Asset policy

The repository includes the approved Type2Learn logo, supplied and edited team
assets, public imagery, mascot assets, reward art, audio, and course narration.
Images are delivered in web-friendly formats and lower-priority public imagery
is lazy loaded. The original logo is retained unchanged for brand fidelity.

The large voice library is intentionally **not** preloaded. Its compressed
delivery format and integration rules live in
[assets/audio/voice-library/README.md](assets/audio/voice-library/README.md).

## Quality bar

Every meaningful product change should preserve:

- no speed ranking, learner diagnosis, automatic audio, or inaccessible motion;
- keyboard and screen-reader-friendly flows, visible focus, and reduced-motion
  respect;
- English/Urdu parity and clear RTL layout;
- course controls that remain manual and reversible;
- server-side handling of all credentials, model work, hidden answer keys, and
  learner data;
- an authored fallback for AI-dependent learning support.

## Credits

Built with **native.builder** for Type2Learn, from **3 August to 6 August**.
The product direction, content, imagery, accessibility standards, and learner-
first safeguards come from the Type2Learn team and its ongoing participation
work.
