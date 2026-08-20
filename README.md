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
| **Adaptive Recall** | Looks for curriculum concepts in a learner’s own explanation and offers one concise next support: a hint, simpler framing, example, or application prompt. With consent, it may receive neutral Behaviour Context states to choose presentation—not to judge readiness. | Write the answer before an attempt, diagnose a learner, reveal a rubric, or rank ability. |
| **I’m stuck** | Lets a learner name the barrier—unclear instructions, a task that feels too large, difficult words, uncertainty about starting, too much on screen, or worry about being wrong—then adjusts only the current step. | Regenerate the whole lesson or make a claim about the learner. |
| **Adaptive presentation** | When a signed-in learner explicitly opts in, it can offer one small first-step prompt after a quiet preview, then one reversible reading/layout/encouragement proposal after a module. | Upload keystroke logs, raw audio, permanent chat history, or silently change a learner’s settings. |
| **Behavioural Learning Partner** | Uses one local, privacy-first Behaviour Context to offer an optional Calm Guide, fictional Learning Partner, Self-Challenge Coach, or Visual Co-Explorer. Deterministic rules choose whether an offer is relevant; Gemini Flash-Lite may only refine its two-sentence wording, with Nano and authored fallbacks. | Infer a diagnosis or psychological profile, switch roles/settings without permission, pressure a learner emotionally, upload raw work without consent, or give assessment hints. |
| **Understanding checks** | Delivers one question at a time from a reviewed or authored reserve. A deterministic objective-evidence monitor guides a precise review route; Mini may recognise a safe paraphrase, but never decides alone. | Expose correct answers, visible percentages, speed scores, raw answers, or a learner profile. |
| **Visual explanations** | Provides authored, accessible concept maps in the visual/mascot rail. | Generate stereotyped learner images or make visuals the only way to learn. |

AI is **Gemini-first for ordinary course chat**, with bounded key rotation and
server-only specialist OpenAI roles: **GPT-5.4 Nano** for prompt/JSON checks,
**GPT-5.4 Mini** for bounded adaptive intent and assessment work, and
**GPT-5.1** only for reviewer-triggered final assessment-bank generation.
The Behavioural Learning Partner is more constrained: its deterministic policy
chooses the role, trigger and permitted action; **Gemini Flash-Lite** can only
phrase its compact message, then **GPT-5.4 Nano** may repair/verify it. It
always has authored local wording, including when a learner has not opted in.
Provider credentials, answer keys, hidden rubrics, and model prompts stay on
the server. Every model response is schema-validated, constrained by a
deterministic evidence check, and has an authored deterministic fallback.

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
| Behavioural Learning Partner | Implemented behind flags | `BEHAVIOUR_CONTEXT_ENABLED=true`; local authored offers work without consent, while signed-in Gemini/Nano wording and 90-day summaries also require `ADAPTIVE_LEARNING_ENABLED=true`, consent, Firebase, and `MASCOT_PARTNER_AI_ENABLED=true` |
| Reviewed assessment banks and fallback checks | Implemented | `AI_ASSESSMENTS_ENABLED=true`, adaptive consent, Firebase, and reviewer workflow for generated banks |
| Objective-evidence monitor and targeted review | Implemented | Assessment runs store only question/objective IDs and bounded outcome categories; never an answer, option choice, score, or model rationale |
| AI-generated visual assets | Intentionally disabled | Requires separate moderation, storage, retention, and curriculum-review work |
| Structured and direct-reviewed theory-course authoring | Implemented behind private server configuration | Admins may use the bilingual form or import reviewed Markdown directly; Firebase, human review, narration/TTS choice, and all four backup receipts remain required before publication |

## Private educator and course-publishing workspace

The protected authoring workspace is intentionally separate from learner pages:

- `/admin/` bootstraps the first platform administrator with a one-time server-side secret, then manages role codes, source review, a structured bilingual course form, direct reviewed-Markdown import, AI drafts, narration, backup receipts, release approval, audit history, and a non-destructive learner preview.
- `/teacher/` and `/institute/` accept **theory** course source material, show review status, create scoped learner invites, maintain private rosters, and distribute only approved courses to their organisation or assignment list. Coding, project, and other course types are visibly locked and rejected by the API until their learning engines exist.
- `/redeem/` redeems a signed-in user's one-use, revocable, expiring educator or learner code. Fresh Firestore membership checks supplement Firebase custom claims on every protected action.
- Authoring uses versioned `type2learn-theory-course/v1` Markdown with English and Urdu for every published course. Administrators can fill a structured form that deterministically generates the format or upload an already reviewed Markdown file directly. The compiler produces a private review manifest (including answer keys) and a learner-safe manifest (without keys, uploads, or review notes).
- AI is Gemini-first and OpenAI-fallback only for missing draft material. Its JSON is schema-validated and marked **AI draft — admin review required**; it cannot become learner-visible until a human accepts the reviewed Markdown and completes the workflow.
- Publishing cannot bypass the workflow: `Submitted → Source reviewed → Markdown draft → Validation ready → AI draft ready → Admin review → Audio ready → Backups pending → Backups verified → Approved → Published`. The final gate needs Firebase primary storage, private GitHub review artifacts, Supabase package storage, and an administrator-acknowledged downloadable ZIP.

The reusable player is `/course/?courseId=<course-id>&version=<version>`. It uses the same learner support settings as the existing course: small sections, spacing, text size, reading width, contrast, quiet display, motion preferences, optional device text-to-speech, and intentionally requested speech-to-text where the browser supports it. The existing Neurodivergent Conditions course is deterministically migrated through the same bilingual Markdown compiler while its established learner route remains intact.

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
│   ├── behaviour-context.js            # Local-only unified Behaviour Context (no raw learner content)
│   ├── learning-partner.js             # Four role surfaces and authored partner prompts
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
│   ├── behavioural-partner-service.mjs # Gemini-first, Nano-fallback companion directive wording
│   ├── assessment-service.mjs         # One-question assessment runs and evaluation
│   ├── assessment-evaluator.mjs       # Deterministic grounding guard around model evaluation
│   ├── assessment-monitor.mjs         # Objective evidence, question order, and targeted review route
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
├── AI_ADAPTIVE_LEARNING_README.md      # AI product, privacy, assessment, and rollout spec
└── BEHAVIOURAL_PARTNER_TEST_EVIDENCE.md # 693-case Behaviour Context verification matrix
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
| Adaptive-support, deterministic assessment evidence, and targeted review | `server/adaptive-policy.mjs`, `server/adaptive-support-service.mjs`, `server/assessment-evaluator.mjs`, `server/assessment-monitor.mjs`, `server/assessment-service.mjs` |
| Learning-partner policy, privacy contract, and fallback dialogue | `course/behaviour-context.js`, `course/learning-partner.js`, `server/behavioural-partner-service.mjs` |
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
npm run verify    # release gate: every test must pass and the suite must retain at least 748 checks
npm run test:ui   # focused UI test script
```

The current release gate runs **1,002 deterministic automated checks** across
access roles, authentication, public/Urdu content, learner settings, guided
typing, audio and speech, AI boundaries, Behaviour Context privacy, assessment
monitoring, reviewed-course authoring, publishing, and learner-safe manifests.
It fails on any failed check or if the suite drops below the 748-test baseline.
The executable Git pre-push hook and Render build both invoke this exact gate.

The Behavioural Learning Partner matrix is documented in
[`BEHAVIOURAL_PARTNER_TEST_EVIDENCE.md`](BEHAVIOURAL_PARTNER_TEST_EVIDENCE.md).

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
[render.yaml](render.yaml). It installs dependencies with `npm ci`, runs the
same blocking `npm run verify` release gate, then runs `npm start` and checks
`/api/v1/health`.

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
