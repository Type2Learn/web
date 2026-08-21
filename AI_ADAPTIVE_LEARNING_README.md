# Type2Learn adaptive learning and AI

> **The smallest useful support, grounded in what a learner can express.**

This is the technical and product specification for Type2Learn’s adaptive
learning layer. It is intentionally not a generic chatbot layer or a learner
profiling system. Its job is to help a learner continue with one appropriate,
reversible next action while keeping curriculum, privacy, and learner choice in
control.

**Status:** implemented in guarded stages (updated 2026-08-09). The course,
server routes, authored fallbacks, and safety boundaries described in the
implementation table are in this repository. Features that collect signed-in
learning summaries, invoke adaptive proposals, or deliver AI-backed
assessments remain independently feature-flagged and consent-gated. Generative
visual assets and automated retention are deliberately not shipped.

For the product overview, setup, deployment, complete file tree, and public
site architecture, start with the [main README](README.md).

## What this layer promises

1. **Evidence, not guesses.** It responds to a learner’s expressed
   understanding and learner-chosen controls; it does not diagnose or label.
2. **One small support.** It can offer a hint, simpler explanation, example,
   application prompt, visual explanation, or preference proposal—not an
   overwhelming replacement lesson.
3. **Choice remains with the learner.** The system proposes at most one
   reversible change; it never silently rewrites persistent preferences.
4. **Safe without a model.** Every AI-dependent route has an authored,
   deterministic fallback. Provider failure never blocks course progress.
5. **No score theatre.** Understanding checks use server-side outcomes and
   supportive next steps, not visible numerical scores, speed measures, or
   answer keys.

## Reading this document

| Section | Use it for |
| --- | --- |
| [Current implementation coverage](#current-implementation-coverage) | Which features are connected today and which are deliberately off |
| [Non-negotiable learner safeguards](#2-non-negotiable-learner-safeguards) | Privacy, no-diagnosis, learner-choice, assessment, and accessibility rules |
| [Behavioural data scope](#4-behavioural-data-scope) | The minimal aggregate signals the product may use after consent |
| [Adaptive support engine](#6-adaptive-support-engine) | How policy, provider output, validation, and the learner proposal fit together |
| [AI assessment design](#9-ai-assessment-design) | The authored fallback bank, item limits, review path, and no-score rule |
| [Model routing and budget](#8-model-routing-and-budget) | Gemini-first rotation, single-flight Featherless middle fallback, constrained OpenAI fallback, and caps |
| [Delivery phases](#14-delivery-phases) | Remaining governance and rollout work |

> **Important:** the “proposed” and “future” parts of this specification are
> intentional product gates, not claims of a live capability. Do not enable a
> feature just because a UI path or server module exists; its consent, review,
> budget, and storage conditions must also be met.

## Current implementation coverage

| Area | Current status | Where it is implemented |
| --- | --- | --- |
| Gemini-first model routing | **Live when Gemini keys are configured.** Numbered Gemini keys rotate first; an explicitly configured single-flight Featherless unit is the middle fallback, then the approved OpenAI role. | `server/model-provider.mjs`, `server/ai-service.mjs` |
| Course AI / “Talk to Course AI” | **Live for signed-in learners; local guest preview only behind `AI_ALLOW_GUESTS`.** It is bounded to the current course step. | `course/course.js`, `server/ai-service.mjs` |
| Adaptive Recall / barrier support | **Live when the adaptive recall endpoint is configured.** The “I’m stuck” choices include a direct Course AI route. | `server/adaptive-recall-service.mjs`, `course/course.js` |
| Consent-gated learning summaries | **Implemented, off by default.** Only compact aggregate metrics are uploaded after a learner opts in. | `course/learning-telemetry.js`, `server/learning-analytics-service.mjs` |
| One-change support proposals | **Implemented, off by default.** Deterministic policy selects the allowed change; Mini may only shorten the wording. The learner must choose whether to use it. | `server/adaptive-policy.mjs`, `server/adaptive-support-service.mjs` |
| Task initiation / visual explanation | **Implemented as authored supports.** A small first step and an accessible, authored visual rail never depend on a model. | `course/adaptive-support.js`, `course/visual-explanations.js` |
| Readability support | **Implemented manual controls.** Text size, spacing, reading width, smaller sections, optional TTS and synced highlighting remain learner-controlled. A dedicated dyslexia-font/colour-overlay control is not yet shipped. | `course/learner-settings.js`, `course/course.js`, `course/course.css` |
| Module/final understanding checks | **Implemented behind `AI_ASSESSMENTS_ENABLED` and adaptive consent.** One public question is shown at a time; the deterministic monitor records objective evidence categories, then returns one specific review route when needed. No answer key, numeric score, raw answer, option choice, or model rationale is stored in learner progress. | `server/assessment-service.mjs`, `server/assessment-evaluator.mjs`, `server/assessment-monitor.mjs`, `course/course.js` |
| No-provider assessment fallback | **Implemented.** The reviewed/generated bank can be unavailable and the authored reserve still supplies 4 open + 5 MCQ module checks or 9 open + 12 MCQ final checks. | `server/fallback-assessment-bank.mjs` |
| Targeted review and another check | **Implemented as an optional recovery path.** Learners can review a related module or try another calm check; there is no forced, unlimited retesting. | `server/assessment-service.mjs`, `course/course.js` |
| Export/delete | **Implemented for adaptive summaries, proposals and opaque assessment outcomes.** | `server/learning-analytics-service.mjs` |
| AI-generated images | **Intentionally not implemented.** The product currently uses authored visuals only; generated visuals require separate approval, moderation, private storage and retention work. | `course/visual-explanations.js` |
| Automated retention job | **Not yet implemented.** Deletion on request works; an inactivity-retention scheduler still needs privacy/legal approval. | Future work |

Feature flags remain off in `security/api.env.example` so deploying the site
does not silently begin adaptive collection or assessment. To enable them in a
reviewed environment, set `ADAPTIVE_LEARNING_ENABLED=true` and, separately,
`AI_ASSESSMENTS_ENABLED=true`; learners must still opt in from the course
settings menu.

This is the implementation specification for Type2Learn's next AI layer. It
fits the present course architecture and preserves the course's calm,
non-diagnostic, private-by-default experience.

## 1. Product outcome

The course will use a minimal summary of how the interface and learning task
were used to offer reversible support. It will never try to diagnose a
learner, label ability, rank them, penalise speed, or silently change personal
settings.

The intended journey is:

1. The learner completes a normal short module.
2. The app produces a small, accurate activity summary.
3. After the module, the adaptive service either keeps settings as they are or
   proposes one specific optional change for the next module.
4. The learner chooses **Try it** or **Keep my settings**. A declined change
   enters a cooldown and is not immediately repeated.
5. During a difficult moment, the learner can be offered a smaller first step,
   read-aloud, readability support, or a visual explanation.
6. Module and final assessments choose the learning objectives to check. They
   do not show a numeric score.

The authored course, manual controls, current typing support, TTS/STT, standard
feedback, and safe fixed assessments must work when AI, Firestore, image
storage, or a network connection is unavailable.

## 2. Non-negotiable learner safeguards

| Rule | Required implementation behaviour |
| --- | --- |
| No diagnosis | Never infer ADHD, dyslexia, autism, effort, attention, ability, or another personal trait from interaction data. Say “this page took longer than usual”, never “you cannot focus.” |
| Choice first | AI may only propose allow-listed changes. It cannot make a lasting preference change until the learner explicitly accepts it. |
| No speed pressure | Time and typing speed are contextual signals only. They cannot lower a score, gate access alone, create a countdown, or trigger a negative label. |
| No raw surveillance | Do not persist keystroke logs, microphone recordings, complete chat histories, or raw answers as behavioural analytics. |
| One support at a time | Do not stack popups or automatically switch on several stimulating features. Respect existing animation, colour, layout, and encouragement choices. |
| Learner control | Each suggestion names the exact setting it would change, includes Yes/No, can be disabled in Settings, and remains manually editable. |
| Assessment integrity | Course AI cannot reveal answers, select an option, write a response for the learner, or expose answer keys or scoring criteria. A deterministic evaluator constrains any model judgment, and the monitor uses objective evidence—not behavioural data—to choose readiness or review. |
| No endless gate | Learners must never be trapped in unlimited retesting. Rechecks are targeted, limited, and provide a supported way forward. |
| Accessibility | All support, visual and test flows must work with keyboard, screen reader, zoom, reduced motion, English and Urdu. Existing Urdu-mode typing targets stay English. |
| Fail closed | If authentication, consent, Firestore, budget, schema validation, moderation, provider, or asset storage fails, use authored support only. Do not make a personalised claim. |

Product language must remain educational and respectful. It does not give
medical, diagnostic, crisis, or treatment advice.

## Behavioural Learning Partner — implemented boundary

The course now has a versioned, aggregate-only **Behaviour Context**. It is
shared by the mascot surface, Adaptive Recall presentation, adaptive
presentation policy, encouragement/support moments, visual offers, and
assessment question ordering, but it can never determine a score, pass/fail
decision, or learner category.

- **Local by default:** browser-session metrics remain on-device and can power
  authored support without calling an AI provider.
- **Consent before upload:** a signed-in learner who enables Adaptive learning
  support may upload one compact module summary. It contains only bounded
  counts/categories, is keyed by a SHA-256 Firebase UID hash, and receives a
  90-day `expiresAt` value. Configure Firestore TTL for `expiresAt`; the
  service also removes expired module summaries opportunistically on writes.
- **Four learner-selected roles:** Calm Guide, fictional Learning Partner,
  Self-Challenge Coach, and Visual Co-Explorer. The profile menu controls
  on/off, role, Quiet/Available/Involved presence, proactive offers, text or
  voice interaction, explanation, export, and deletion. The product may never
  switch a saved role or preference automatically.
- **Deterministic first:** two neutral signals are required before one offer
  can appear. A dismissal suppresses that offer for the task. The policy is
  authored and visible in `course/behaviour-context.js` and
  `server/behavioural-partner-service.mjs`.
- **AI is wording only:** when both `BEHAVIOUR_CONTEXT_ENABLED=true` and
  `MASCOT_PARTNER_AI_ENABLED=true` are set, the server sends only compact
  module/phase/objective IDs, role, presence and boolean signals to
  Gemini Flash-Lite. GPT-5.4 Nano is the only fallback and can only repair or
  validate the short JSON response. Invalid, unavailable, unauthorised, or
  unconsented calls use authored wording.
- **Assessment boundary:** the partner may clarify the process, offer text or
  voice input, or suggest a pause. It cannot give an answer, hint at an option,
  model an answer, or decide readiness.
- **Adaptive Recall boundary:** after consent it receives at most three neutral
  state names such as `re-reading`; it never receives a behavioural counter,
  learner label, or scoring signal. Those states can only affect the
  presentation of its one permitted support.

Never place raw typed work, individual key events, microphone data,
transcripts, full Course AI messages, raw assessment answers, scores, IP
addresses, fingerprints, eye tracking, or psychological labels in this
context. The profile menu includes the same scope in “What Type2Learn
notices,” plus download/delete controls.

## 3. Existing code foundations to preserve

The current repository already has the pieces this work should extend:

- "course/course.js" owns course phases, typing, checks, final exam, support
  moments, settings, mascot presentation, Course AI and voice controls.
- "course/course-content.js" and "course/course-urdu.js" contain Course 1
  source material. The current course has 11 modules, authored typing/check
  activities and an authored final MCQ exam.
- "course/ai-client.js" is the authenticated client for Course AI.
- "server/ai-service.mjs" limits Course AI to current-page facts, blocks
  private-data/prompt-injection attempts, uses server-side secrets, a timeout,
  a concise reply limit and "store: false".
- "server/course-progress-service.mjs" stores signed-in resume snapshots in
  Firestore under a SHA-256 hash of the Firebase UID. Guest progress is local.
- "server/usage-ledger.mjs" already handles account/per-user reservations,
  rate limits, expiry and settlement in Firestore.
- "server/config.mjs" pins Gemini 3.5 Flash-Lite to ordinary course chat and
  Gemini 3.6 Flash to resilient heavy fallback. It assigns server-only OpenAI
  roles: "gpt-5.4-nano" for compact prompt/JSON checks, "gpt-5.4-mini" for
  bounded adaptive and assessment reasoning, and "gpt-5.1" only for rare,
  reviewer-triggered final assessment-bank generation.
- "course/narration.js", the course audio manifest, voice library and
  Speechmatics path are the existing read-aloud/speech foundations.

This design must not move API keys, Firebase service-account JSON, hidden answer
keys, generated test banks, or raw learner data into browser JavaScript.

## 4. Behavioural data scope

Behavioural data means a small record of how the *lesson and interface* were
used. It is not a hidden judgement of a person.

| Family | Minimal fields | Use | Never capture |
| --- | --- | --- | --- |
| Session/visibility | ephemeral session ID, module/task, start/end, active and idle milliseconds, hidden/visible transitions | Accurate active time and re-entry support | device fingerprint, IP, background heartbeats |
| Navigation/initiation | task shown, first meaningful action, return/restart, pause/resume, skip/return | Offer one manageable first action | a claim that the learner procrastinated |
| Reading | active dwell bucket, reread count, TTS start/stop/completion, readability tools used | Offer audio, spacing, chunking or visual | eye tracking, scroll replay, a conclusion that long reading means poor understanding |
| Typing | active duration, character count, correct/incorrect aggregates, backspace aggregate, longest-pause bucket, submitted/abandoned | Pacing and assessment coverage | key-by-key log, clipboard contents, every key timestamp |
| Speech | feature used, browser/Speechmatics path, audio duration bucket, transcription result, final accepted character count | Learn whether speech support helped | raw audio, voiceprint, raw transcript in analytics |
| Support/settings | selected presentation/accessibility settings, proposal shown/accepted/declined/dismissed | Respect choices and prevent repeated unwanted suggestions | a secret inferred condition/profile |
| Course AI | opened/closed, request count, active-duration bucket, response success/failure, audio reply used, page ID | Offer a calm return-to-task cue | persistent chat transcript/message text in analytics |
| Assessment | bank/item/objective IDs, response mode, completion, bounded outcome category, objective-evidence coverage, retry state | Targeted review without visible scores | permanent raw answer text, option choice, rankings, time score, model rationale |

### 4.1 Active time

Use monotonic browser time, not only wall-clock time.

- Count only while the tab is visible, the task is mounted and the learner has
  been active recently.
- Pause on visibility change, blur, modal interruption, navigation and lock.
- Treat an initial 45 seconds with no meaningful action as idle, not active
  learning time. Store rounded/bucketed analytics duration.
- A fast completion, long pause or return visit is neutral evidence. It may
  influence which curriculum objective should be checked, never establish
  understanding, effort, or a learner trait.

### 4.2 Signals for a gentle offer

The system cannot know why a learner pauses. It should require more than one
neutral observation before offering help, for example:

- higher-than-usual active dwell plus no audio/readability support used;
- several visits to the same section;
- repeated abandoned typing starts or long active pauses;
- repeated incorrect attempts after seeing the explanation;
- prolonged Course AI use on one page without task movement.

One signal does nothing. A matched pattern may show one dismissible choice:
“Would a smaller first step, read-aloud, or a visual explanation help?” It is
suppressed for the same task/session after dismissal.

## 5. Data minimisation, consent and retention

### 5.1 Typed and spoken content

- Existing authored typing compares a browser response with an authored target.
  Persist only aggregate result, not the target response or every attempt.
- An AI-assessment free-text answer may be sent once for immediate, scoped
  rubric evaluation using "store: false". Discard it after evaluation. Persist
  only outcome, approved objective IDs and a small evidence category.
- Delete browser recording blobs immediately after completed/cancelled STT. Do
  not place recordings in Firestore or object storage.
- Keep Course AI's current short in-memory page discussion; do not add a
  permanent chat-history analytics stream.

### 5.2 Proposed Firestore/object-storage model

Firestore is for small decisions and summaries. It is not for image bytes,
audio, full answer text, or an unlimited event stream.

~~~text
type2learnLearnerProgress/{sha256(uid)}/courses/{courseId}
  Existing resume snapshot; add only stable assessment references.

type2learnLearningProfiles/{sha256(uid)}
  schemaVersion, consentVersion, adaptiveEnabled, proposalCooldowns,
  acceptedSettings, retentionVersion, updatedAt

type2learnLearningSummaries/{sha256(uid)}/courses/{courseId}/modules/{moduleId}
  curriculumVersion, aggregate metrics, support outcomes, assessment outcome,
  adaptation history, updatedAt

type2learnAssessmentRuns/{sha256(uid)}/courses/{courseId}/runs/{runId}
  assessment bank version, item IDs, objectives, response modes, evaluator
  outcomes, retry state, timestamps

type2learnAssessmentBanks/{courseId}_{language}_{curriculumVersion}
  server-approved/generated-and-validated bank; no learner data

type2learnAiUsage/{month}
  existing aggregate shared usage ledger
~~~

Generated visual files must use private object storage. Firebase Storage is the
natural first choice while Firebase is present; Azure Blob Storage can replace
it later. Firestore stores only validated asset metadata, alt text, language,
expiry and access policy. Never use Render's ephemeral filesystem for assets.

### 5.3 Learner choices

Before any signed-in telemetry upload, setup and Settings gain an **Adaptive
learning support** control:

- **Use adaptive support**: save the minimal summaries in this plan and enable
  post-module suggestions/AI assessment.
- **Use course without adaptive analysis**: preserve manual features and
  authored course; do not upload new personalisation telemetry.

Also provide:

- “What is being used?” in plain language;
- adaptive suggestions on/off;
- generated visuals on/off;
- data export;
- “Delete adaptive learning data” with confirmation;
- retention information.

Initial proposed retention: discard event buffers on upload, keep aggregate
summaries for 12 months of inactivity, and delete immediately on user request.
The final period must be approved by legal/privacy review.

Guest learners receive local deterministic support only in the first release.
They do not create a cloud profile, invoke authenticated model APIs, or get
AI-generated tests/visuals until an explicit anonymous-consent design is
approved.

Because this may be used by younger learners and schools, a privacy,
safeguarding and accessibility review must decide applicable consent/guardian
requirements, jurisdictional education/privacy duties, deletion workflow and
support wording. This is not a legal conclusion.

## 6. Adaptive support engine

### 6.1 Deterministic policy first; model second

The server builds a bounded LearningSummary from authorised metrics.
Deterministic rules decide whether there is enough evidence to propose a change.
AI may rank/word a short allow-listed candidate set; it cannot control the UI
freely.

~~~text
browser event buffer
  -> local aggregation and consent check
  -> authenticated summary endpoint
  -> server validation + Firestore module summary
  -> deterministic candidate rules
  -> GPT structured response only when a proposal is warranted
  -> server schema and allow-list validator
  -> learner Yes/No card
  -> accepted setting becomes ordinary saved preference
~~~

The model receives a compact summary only. It never receives raw event logs,
raw answer text, audio, chat text, email, Firebase UID, or unneeded profile
data.

### 6.2 First-release allow list

One post-module proposal can offer only:

- page layout: focused, balanced, open;
- colour style: flat, balanced, vivid;
- encouragement: subtle, balanced, expressive;
- animations: still, gentle, lively;
- text-to-speech: on, only when available;
- reading support: larger text, line/letter spacing, reading ruler, low-glare
  overlay, paragraph chunking or highlighted read-aloud;
- task initiation: one-step start card, visible first action or 1–3 item
  immediate checklist;
- visual explanation: offer the current objective's visual.

AI cannot propose language, authentication, consent, microphone/browser
permissions, paid features, permanent profile labels, or a setting outside this
list.

Accepted changes are saved as normal user overrides. A decline stores a
cooldown for the exact candidate (initial proposal: four completed modules or
14 days). “Keep my settings” and “Stop adaptive suggestions” must always work.

### 6.3 Proposal presentation

The proposal appears after the normal module completion moment. It must be
inline/anchored, not over a heading, input, controls, course content, mascot
dialogue, or visual explanation.

~~~text
One small optional change

This module had a few long pauses. Would you like more space between lines in
the next module?

[Try it next module] [Keep my settings] [Why this suggestion?]
~~~

The reason must state only an observable interaction and exact reversible
setting. It never shows a score or diagnosis.

### 6.4 Better encouragements

Current authored encouragements remain the guaranteed fallback. Near a module
end, the low-cost text route may produce a brief personalised message from:

- module title;
- completed task types;
- learner-selected encouragement intensity;
- support choices used;
- one neutral progress category.

It cannot mention score, speed, disability, private data, or claim an internal
state. Validate language, length, forbidden language and layout before display.
On any failure, use authored copy.

## 7. Core support features

### 7.1 Task initiation

When conservative neutral signals indicate that starting may be hard, offer a
compact **Start one small step** card:

- one authored immediate action, such as “Read the first bold question” or
  “Click the answer box when ready”;
- only the immediate step, not an overwhelming plan;
- “I’m ready”, “Show another way” and “Not now” controls;
- optional 1–3 action checklist based on authored task metadata;
- no automatic timer and no penalty for declining.

Version one uses authored metadata/deterministic triggers. AI may later phrase
the card, but cannot invent course facts.

### 7.2 Readability support

This is a learner-controlled readability toolset, not a dyslexia detector:

- a well-tested/licensed readable font option only after licence/rendering QA;
- text size, line-height, paragraph width and word/letter-spacing controls;
- low-glare overlay and reading ruler/line focus;
- progressive chunking without removing the original text;
- existing manual-start read-aloud with pace/voice controls;
- reliable phrase/word highlighting when accurate timing exists.

Word highlighting must come from authored cue timing, alignment data, or
segmented audio. Do not guess word timings from a full audio file. If precise
timing is not available, highlight sentence/paragraph level instead.

### 7.3 Visual/spatial explanations

Every curriculum objective gets authored "visualRepresentation" metadata:
concept map, sequence/timeline, comparison card, cause/effect map, checklist,
labelled object or simple illustration.

1. Prefer authored diagrams/reusable visual composition.
2. Put **Show a visual explanation** in the mascot/visual rail.
3. The first use is manual. Extended active dwell may only show an optional
   visual offer; it cannot auto-open an image.
4. With mascot on, the visual temporarily replaces the mascot rail and gives a
   Close/Return to Ava control. On close, Ava returns.
5. With mascot off, use the same allocated rail, not a text-covering overlay.
6. Include alt text, concise caption, text equivalent and keyboard support.

Image generation is a later governed layer. It requires curriculum-grounded
prompts, input/output moderation, asset storage, content version, language
caption/alt text, cache/expiry, human review workflow and a dedicated share of
the total budget. Never generate an image for every page, a stereotype, a
medical scene, or a person assumed to have a condition.

### 7.4 Re-entry/disengagement support

Use neutral re-entry language:

- “Welcome back. The next small step is ready.”
- A one-sentence authored recap.
- An offer of audio, visual or a smaller chunk.
- Temporarily more visible encouragement only if adaptive presentation changes
  were allowed.

Do not intensify animation/encouragement for someone who chose Still, Subtle,
Flat or Calm without permission. Any temporary support expires at the end of
the current task and returns to saved choices.

## 8. Model routing and budget

The provider policy is **Gemini-first for every ordinary learner request**.
When Gemini is unavailable or returns an unusable response, an explicitly
configured **single-flight Featherless** account is tried next; the matching
OpenAI role is the final fallback. Every provider result is independently
validated by the deterministic service that requested it.

| Job | Model | Boundary |
| --- | --- | --- |
| Existing Course AI chat | Gemini 3.5 Flash-Lite | Current page only, concise, signed-in; rotate eligible Gemini chat keys before the GPT-5.4 Nano fallback |
| Prompt checks / compact JSON verification | GPT-5.4 Nano | Strict schema, bounded input and output; rotating Gemini pool is the outage fallback |
| Adaptive recall, support wording, response classification, module-bank generation | Gemini Flash-Lite → Featherless → GPT-5.4 Mini | Purpose-bound structured output, deterministic validator; never used as unrestricted chat |
| Final assessment-bank generation | Gemini Flash-Lite → Featherless → GPT-5.1 | Reviewer-triggered only, once per course version/language window; all outputs remain reviewer-gated |
| Image generation | Disabled pending approval | Separate provider/model/moderation/object-store/shared-cost design |

Use the provider-specific API, structured JSON when required, bounded inputs,
per-purpose timeouts and server validation. Gemini requests omit deprecated
sampling controls. The browser receives only validated UI data, never a model
instruction/command, provider key, or upstream error body.

Gemini key rotation is server-only. Deployment may use comma-separated
`GEMINI_CHAT_API_KEYS` / `GEMINI_TEST_API_KEYS` or numbered key variables.
Each request begins at the next healthy key. Auth, model, quota and temporary
upstream failures cool that key down before the next rotation. If the Gemini
pool is unavailable, the optional Featherless unit accepts at most one request
at a time; a second learner immediately proceeds to the final OpenAI fallback
instead of waiting behind another learner. Role-specific OpenAI work is only
reached after those earlier providers fail or are not configured. The sole
exception is a bounded Nano JSON-repair call for malformed behavioural-partner
wording; it cannot produce curriculum decisions or learner feedback on its own.

### 8.1 Shared budget

Runtime ceilings are parsed from the deployment environment and remain
independent feature gates. The default limits are deliberately small; they are
reservation limits rather than a promise that a feature is enabled or that a
model call will occur.

| Reserve | Monthly application cap | Use |
| --- | ---: | --- |
| Live text Course AI chat | Configured shared OpenAI cap | Gemini-first; OpenAI Nano fallback only; per-user ceiling applies |
| Adaptive support | USD 2 default app cap | Gemini-first, optional single-flight Featherless, then Nano/Mini fallback; per-user ceiling applies |
| Assessment bank/evaluation | USD 3 default app cap | Gemini-first, optional Featherless, then Mini for module work; GPT-5.1 only for reviewer-triggered final-bank generation; cache by curriculum version/language |
| Total | Explicitly deployment-configured | Every request reserves a bounded maximum before provider access and settles actual usage |

Image generation cannot begin without explicitly reallocating this table or
raising the product budget. Every call reserves maximum cost before provider
access and settles actual use afterward. Existing per-user/per-minute limits
apply to every added purpose.

Heavy generation must deduplicate by course, module, language, curriculum
version and bank version. Repeated learners receive a different validated item
from a bank, not a new Mini call.

### 8.2 Required structured contracts

The server validates every response against a strict schema and an allow list.

~~~text
AdaptationProposal
  decision: none | propose
  settingKey: allow-listed key or null
  settingValue: exact valid enum or null
  learnerMessage: 12–45 words
  reasonCategory: approved neutral enum
  expiresAfterModule: boolean

PersonalisedEncouragement
  message: 8–32 words
  tone: subtle | balanced | expressive
  moduleId: exact current module

AssessmentBank
  courseId, curriculumVersion, moduleId, language, bankVersion
  items: objective ID, response mode, prompt, MCQ options where applicable,
         hidden rubric/answer key, feedback
  coverageMap: approved objective IDs only

ResponseEvaluation
  outcome: demonstrated | needs-review | uncertain
  demonstratedObjectiveIds: approved IDs
  needsReviewObjectiveIds: approved IDs
  feedback: short supportive text without answer reveal

VisualIntent
  decision: none | offer
  objectiveId: approved ID
  representationType: approved enum
  visualPrompt: curriculum-grounded, no learner traits
  altText: concise equivalent
~~~

Reject malformed JSON, extra properties, unknown objective/module/settings,
unsupported language, excessive output, answer leakage, unsafe language, or
weak/no deterministic evidence. Use authored fallback.

## 9. AI assessment design

### 9.0 Delivery resilience

Assessment delivery is not dependent on a live model. The implementation ships
an authored reserve of 32 questions per module (16 open-response prompts and
16 MCQs, 352 module-bank prompts in total), selecting a small varied subset
for each learner run. It also ships a 21-question final reserve (9 open
responses and 12 MCQs): 373 authored assessment prompts in total. If a reviewed AI bank is unavailable, the learner is
served from this reserve without any wait. If open-response evaluation cannot
reach the model, the learner sees **“Result under review”** and can continue;
no answer text is retained in the progress save.

### 9.1 Test mode differs from learning typing

Learning typing stays guided: visible authored target, typed-letter help and
existing voice support.

Assessment mode uses:

- no translucent target, character cue, or “what to type” guidance;
- one question per page;
- empty response box: “Answer in your own words. You can type or speak.”;
- the same STT fixer, then an editable response before submit;
- no timer, WPM score, ranking or visible percentage;
- Course AI only for relevant concept clarification, never answer completion;
- strict current-question/current-objective model context;
- a deterministic evaluator before and after optional Mini evaluation;
- objective-only completion evidence: an interaction summary can influence
  question order, but it can never determine readiness or a review outcome.

Call this an **Understanding check** and **Next helpful step** in the learner
UI. Back-end outcomes remain versioned/auditable but no numerical score appears
in learner-facing assessment UI.

### 9.2 Module assessment

After each module, choose from the validated bank:

- maximum **4** typed/spoken open questions;
- maximum **5** MCQs;
- fewer only if sufficient objective coverage exists.

Selection may consider objective coverage from viewed sections, current learning
activities, retry/uncertain outcomes and neutral evidence that an idea deserves
checking. It must not punish TTS, visual/readability support, extra time, speech
input, pauses or slower typing.

End states:

- demonstrated: “You are ready for the next module.”
- targeted review: “You did useful work. One idea could use a closer look —
  would you like a short review first?”
- uncertain: prefer authored clarification/review rather than guessing wrong.

### 9.3 Targeted review and bounded retry

A retry points to one small section and uses a new equivalent question. It
preserves work and makes clear that it is about an idea, not failure.

Current delivery keeps a recovery path voluntary: the monitor identifies one
approved objective and module, then the learner can revisit that idea or start
a fresh calm check. The course does not trap a learner in forced retesting.

A future explicitly approved rollout may add a bounded alternative-format
recheck. The model cannot invent a threshold, force a retry, or decide a
learner’s readiness from dwell time, typing pace, or support use.

### 9.4 Final assessment

After all module assessments, select a validated final bank covering the course:

- **8–9** typed/spoken open questions;
- **12** MCQs;
- one item per page with saved progress;
- only current approved curriculum-version facts;
- alternative valid order/form on re-attempt;
- no score/speed/ranking display.

Final presentation says either “ready to complete” or offers short review
objectives and a route back. Numeric score, confidence and timestamps are never
shown as learner evaluation.

### 9.5 Bank lifecycle

~~~text
approved curriculum + explicit objective IDs
  -> Mini creates structured candidate bank on server
  -> schema, language, duplicate, source-grounding, answer-option,
     safety and leakage validators
  -> human curriculum review/approval
  -> immutable published bank for curriculum version
  -> deterministic selector orders the reviewed/authored item IDs
  -> deterministic evidence evaluator + optional scoped Mini evaluation
  -> objective-evidence monitor
  -> targeted review/supportive next step
~~~

No model-generated test question reaches a learner directly. First release
requires human approval for each new bank. Fully automated publication needs
separate evaluation evidence and explicit owner approval.

## 10. Required architecture

### 10.1 New server modules

| Module | Responsibility |
| --- | --- |
| "server/learning-analytics-service.mjs" | authenticate, validate, aggregate/store minimal summaries |
| "server/model-provider.mjs" | Gemini-first model route, round-robin key health/cooldowns and narrow OpenAI fallback |
| "server/adaptive-support-service.mjs" | deterministic policy, low-cost proposal/encouragement, schema validation, cooldown/consent |
| "server/assessment-evaluator.mjs" | deterministic text-grounding signal and a guard that prevents weak model promotion |
| "server/assessment-monitor.mjs" | compact interaction labels for question ordering; objective-evidence progression and a precise review route |
| "server/assessment-service.mjs" | bank lifecycle, item selection, response evaluation, objective monitoring, retry/final state |
| "server/assessment-schemas.mjs" | strict schemas, enums, objective validation |
| "server/visual-explanation-service.mjs" | Planned visual intent, moderation, cache/storage metadata; disabled until visual release |
| "server/adaptive-policy.mjs" | versioned limits, trigger rules, cooldowns, retention, feature flags |
| "server/privacy-service.mjs" | Planned retention job boundary; current consent/export/delete is in `learning-analytics-service.mjs` |

After tests exist, "server.mjs" can add authenticated, origin-checked,
payload-bounded endpoints:

~~~text
POST /api/v1/learning-summary
POST /api/v1/adaptive/proposal
POST /api/v1/adaptive/proposal/:id/decision
POST /api/v1/assessment/start
POST /api/v1/assessment/:runId/answer
GET  /api/v1/assessment/:runId
POST /api/v1/assessment/banks/draft
POST /api/v1/assessment/banks/publish
POST /api/v1/visual-explanations/offer
POST /api/v1/privacy/adaptive-data-export
DELETE /api/v1/privacy/adaptive-data
~~~

Every route requires bearer verification, consent/feature-flag check,
rate/cost protection, schema validation and course/module/objective ownership
validation.

### 10.2 New course modules

| Module | Responsibility |
| --- | --- |
| "course/learning-telemetry.js" | local event buffer, active-time accounting, batching, visibility/consent/guest behaviour |
| "course/adaptive-support.js" | proposal UI, cooldowns, temporary support/re-entry cards, focus management |
| "course/assessment.js" | assessment-only rendering, empty answer field, speech/typing integration, saved one-question flow |
| "course/visual-explanations.js" | mascot-rail replacement, manual visual action, text equivalent/restore |
| "course/readability-support.js" | ruler, overlay, spacing/font controls, chunking, accurate cue highlighting |
| "course/adaptive.css" | scoped responsive/reduced-motion styles |

"course/course.js" remains the orchestrator. Do not create an independent,
competing course state machine.

### 10.3 State and environment

The browser resume state stores references only:

~~~js
adaptive: {
  consentVersion: 1,
  enabled: true,
  currentModuleSummaryId: "...",
  activeProposalId: "...",
  temporarySupport: { key: "", value: "", expiresAtTask: "" },
  assessmentRunId: "..."
}
~~~

Full summaries stay server-side. Browser state holds no credential, raw event
stream, permanent answer key or model instruction.

Local defaults remain disabled/restrictive. The production runtime and the
committed Render Blueprint enable the learner-facing, consent-gated feature
flags below unless Render explicitly sets one to `false`; private educator
publishing remains disabled until its individual encrypted credentials are
configured.

~~~text
ADAPTIVE_LEARNING_ENABLED=false
BEHAVIOUR_CONTEXT_ENABLED=false
MASCOT_PARTNER_AI_ENABLED=false
AI_ASSESSMENTS_ENABLED=false
AI_VISUALS_ENABLED=false
# Model roles are pinned in server/config.mjs; this is documentation only.
# GPT-5.4 Nano = verification; GPT-5.4 Mini = bounded adaptive work;
# GPT-5.1 = final assessment-bank generation.
OPENAI_MONTHLY_APP_USD_CAP=14
OPENAI_MONTHLY_USER_USD_CAP=2
ADAPTIVE_MONTHLY_APP_USD_CAP=2
ADAPTIVE_MONTHLY_USER_USD_CAP=0.5
OPENAI_ASSESSMENT_MONTHLY_APP_USD_CAP=3
OPENAI_ASSESSMENT_MONTHLY_USER_USD_CAP=0.5
OPENAI_ASSESSMENT_REQUESTS_PER_MINUTE=2
GEMINI_CHAT_API_KEYS=<comma-separated server-only chat keys>
GEMINI_TEST_API_KEYS=<comma-separated server-only heavy keys>
ASSESSMENT_REVIEWER_UIDS=<comma-separated Firebase reviewer UIDs>
LEARNING_ANALYTICS_RETENTION_DAYS=<approved value>
FIREBASE_STORAGE_BUCKET=<approved bucket when visuals ship>
~~~

The production Blueprint enables the first five flags and the public Firebase
Storage bucket identifier only. It intentionally does **not** enable
`EDUCATOR_WORKSPACE_ENABLED` or
`COURSE_PUBLISHING_ENABLED`: those services fail closed until Render holds all
of `ADMIN_BOOTSTRAP_CODE_SHA256`, `ROLE_CODE_PEPPER`, private Firebase Storage,
and the private GitHub/Supabase backup credentials. A boolean cannot safely
replace those secrets.

Secrets remain in Render encrypted variables and local ignored "security/api.env";
they never go to Git. "server/config.mjs" must enforce hard maximums. Disabled
flags must block persistence and provider calls, not merely hide buttons.

## 11. Prompt, evaluator and safety policy

All prompts are short, versioned and tested. Each includes exact scope,
approved facts/objective IDs, language, output schema and prohibited behaviour:

- no diagnosis/medical advice;
- no answer completion, option selection, hidden rubric or score disclosure;
- no private-information request;
- no unsupported course fact;
- no setting outside the allow list;
- no prompt/system/cost/model disclosure;
- interaction context is not a learner trait.

Response evaluation asks only whether an *authored objective* was demonstrated;
it does not exact-match a preferred sentence. It returns "uncertain" rather
than guessing. Ambiguity triggers supported review, not harsh failure.

Use provider-appropriate input safety checks, output safety/quality validation
and HTML escaping. Model text is never injected as markup.

## 12. Accessibility, Urdu and visual quality

- Urdu UI, proposal cards, encouragements, visual captions and Course AI remain
  pure Urdu script in Urdu mode.
- Existing rule remains: regular typing target text is English in Urdu mode.
- A product decision is required for AI test answers in Urdu mode. Proposed
  first rule: Urdu prompt/support, English typed response, and spoken Urdu only
  where an approved rubric/transcription path supports it.
- Every adaptive string must pass language, direction and typography checks.
  Never simply mirror English punctuation/order into Urdu.
- 400% zoom, 320 CSS pixel reflow, keyboard-only use, visible focus,
  screen-reader labels, no-colour-only meaning and reduced-motion are release
  blockers.
- Visuals have alt text/text equivalent and cannot be the only route to learn
  or answer.
- TTS starts only by user action, has a Stop control and preserves current
  browser/Speechmatics fallbacks.

## 13. Testing and evaluation

### 13.1 Unit/API tests

Add tests for:

- consent off: no telemetry upload/model call;
- active time through hidden tabs, idle, modal, navigation and interrupted
  requests;
- bounded validation/aggregation, hashed IDs and no persisted raw
  answer/audio/chat fields;
- shared app/user budget across chat, Nano adaptation and Mini generation;
- expired reservations, provider error, Firebase failure and safe fallback;
- every structured schema, malformed output, unknown setting/objective, extra
  field, answer leakage and unsafe copy;
- proposal accept/decline/cooldown/temporary-expiry;
- item limits: module <= 4 open + <= 5 MCQ; final <= 9 open + 12 MCQ;
- no target overlay in assessment mode, score absent from learner API/DOM,
  retry ceiling, resume state;
- STT editable response/no raw recording persistence;
- visual expiry, alt text, mascot restoration, and feature flag off state.

### 13.2 Browser and screenshot QA

Test signed-in consent on/off and guest mode through every course phase,
assessment response mode and return path. Capture and inspect desktop, tablet
and mobile in:

- English/Urdu;
- mascot on/off;
- Calm/Playful and Flat/Balanced/Vivid;
- Still/Gentle/Lively;
- focused/balanced/open layouts;
- slow network, provider failure, cap reached and AI disabled states;
- keyboard-only, screen-reader landmarks/focus, 200%/400% zoom;
- long generated Urdu content, proposal non-overlap and visual rail layout.

### 13.3 Model-quality evaluation

Before release, create a versioned dataset of approved course facts, English and
Urdu prompts, adversarial/answer-leakage attempts, ambiguous answers and
unsafe-language cases.

Release gates measure schema validity, source grounding, duplicate question
rate, answer-leakage rate (zero), diagnostic/medical claim rate (zero),
language/direction accuracy, false proposal rate, cost, latency, timeout and
fallback rates. Use deterministic validators, adversarial tests and human
curriculum review; never a model self-review alone.

## 14. Delivery phases

### Phase A — governance and metadata

1. Approve consent, age/guardian, retention and deletion rules.
2. Add explicit learning-objective IDs to English/Urdu curriculum.
3. Add flags, shared budget policy and privacy-safe schemas.
4. Create tests/model evaluation fixtures first.

### Phase B — local deterministic support

1. Implement local event aggregation behind flags.
2. Add local task-initiation/re-entry/readability/visual-offer UI.
3. Add learner controls, cooldowns and data management UI.
4. Confirm all current course paths work with features disabled.

### Phase C — authenticated summaries/proposals

1. Add Firestore summary service/consent-gated API.
2. Add deterministic candidate policy and server validation.
3. Add Gemini-first structured proposals/encouragement with the guarded OpenAI fallback.
4. Add Yes/No proposal card and audit trail.
5. Run signed-in, offline and failure screenshot QA.

### Phase D — readability and visuals

1. Ship safe CSS/text-equivalent controls.
2. Add authored visual representations and mascot rail replacement.
3. Add cue highlighting only after audio timing validation.
4. Keep generative images disabled pending provider/budget/moderation/storage
   approval.

### Phase E — AI assessments

1. Build assessment state/UI independently from guided typing.
2. Build hourly Gemini-heavy bank generation, validators and human-approval workflow, with OpenAI Mini only as fallback.
3. Add Gemini-lite/deterministic selection and scoped response evaluation.
4. Add bounded review/retry/final flow.
5. Validate no-score/no-answer-leakage guarantees.

Current implementation note: the bank validator, reviewer-only draft/publish
workflow, one-question run API and transient open-response evaluator are
implemented behind `AI_ASSESSMENTS_ENABLED=false`. A generated bank remains
`pending-human-review` until an explicitly configured reviewer publishes it.
The learner endpoint never returns an answer guide, rubric, correct option,
numeric score or stored raw response. The separate learner-facing assessment
renderer should be enabled only after a reviewer publishes a bank and the
passing/retry policy below is approved.

### Phase F — controlled rollout

1. Internal accounts with mocks and tightly capped real providers.
2. Small signed-in opt-in cohort; monitor safety, cost, failure and UX.
3. Curriculum/privacy/accessibility review.
4. Gradual enablement with independent kill switches for summaries, proposals,
   encouragements, assessments and visuals.

Every phase must be independently deployable and reversible.

## 15. Decisions required before coding

These choices materially change the system and cannot be guessed safely:

1. **Consent audience:** learner age range, guardian/school workflow, wording
   and approved retention period.
2. **Guest scope:** signed-in-only AI/adaptive features (recommended first
   release) or a separately approved anonymous-consent system.
3. **Assessment progression:** approve the proposed two-recheck ceiling and
   supported continue path, or provide another non-infinite policy.
4. **Urdu test answers:** English typing only, Urdu speech, both, or another
   rule.
5. **Human reviewer:** who approves every new generated assessment bank and
   curriculum version before learner exposure.
6. **Visual provider/budget:** allocate image cost inside the fixed USD 15
   budget or keep generative visuals off while authored visuals ship first.
7. **Educator/guardian data access:** default is none. Any dashboard requires a
   separately permissioned/privacy-reviewed design.
8. **Passing policy:** objective thresholds and final completion wording. The
   model must not invent thresholds.

## 16. Definition of done

This initiative is ready only when:

- consent, minimisation, retention, export and deletion work;
- no secret, raw audio, raw chat history, keystroke log or persistent raw
  answer text is exposed or committed;
- AI cannot make a lasting setting change without learner choice;
- every model output is structured, schema-validated, source-scoped and has an
  authored fallback;
- caps are shared across all new AI features;
- Course AI/assessment never leak answers or hidden scoring;
- requested assessment limits and no-visible-score rule hold;
- retry is bounded and supportive;
- reading/task-initiation/TTS/visual controls are optional and accessible;
- English/Urdu, mascot on/off, schemes, colour, encouragement, layout and
  desktop/tablet/mobile receive automated plus screenshot QA;
- unit/API/browser/model-quality suites pass; and
- production kill switches disable calls and data persistence as well as UI.
