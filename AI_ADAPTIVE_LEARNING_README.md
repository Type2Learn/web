# Type2Learn adaptive learning and AI plan

Status: **planning only**. This document does not enable new behavioural
telemetry, adaptive decisions, generated tests, images, or learner-profile
data.

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
| Assessment integrity | Course AI cannot reveal answers, select an option, write a response for the learner, or expose answer keys or scoring criteria. |
| No endless gate | Learners must never be trapped in unlimited retesting. Rechecks are targeted, limited, and provide a supported way forward. |
| Accessibility | All support, visual and test flows must work with keyboard, screen reader, zoom, reduced motion, English and Urdu. Existing Urdu-mode typing targets stay English. |
| Fail closed | If authentication, consent, Firestore, budget, schema validation, moderation, provider, or asset storage fails, use authored support only. Do not make a personalised claim. |

Product language must remain educational and respectful. It does not give
medical, diagnostic, crisis, or treatment advice.

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
- "server/config.mjs" pins regular Course AI to "gpt-5-nano" and explicitly
  reserves "gpt-5.1-codex-mini" for future test generation only.
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
| Assessment | bank/item/objective IDs, response mode, completion, outcome category, evidence coverage, retry state | Targeted review without visible scores | permanent raw answer text, rankings, time score |

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
end, Nano may produce a brief personalised message from:

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

The existing routing policy stays intact:

| Job | Model | Boundary |
| --- | --- | --- |
| Existing Course AI chat | gpt-5-nano | Current page only, concise, signed-in, no automatic fallback |
| Summary wording, proposal ranking, re-entry copy, encouragement, response classification | gpt-5-nano | Strict structured schema and low output cap |
| New module/final assessment bank generation | gpt-5.1-codex-mini | Higher-complexity server-side generation only; never chat fallback |
| Image generation | Disabled pending approval | Separate provider/model/moderation/object-store/shared-cost design |

Use the Responses API, "store: false", strict Structured Outputs, bounded
inputs, per-purpose timeouts and server validation. The browser receives only
validated UI data, never a model instruction/command.

Official OpenAI references used for this routing:

- [Responses API guide](https://developers.openai.com/api/docs/guides/migrate-to-responses)
- [Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Model catalogue](https://developers.openai.com/api/docs/models)

### 8.1 Shared budget

Product direction sets USD 15/month total and USD 2/month per user. This must
be a single shared account ceiling across every AI kind, not separate limits
that add up above USD 15.

| Reserve | Monthly application cap | Use |
| --- | ---: | --- |
| Live Nano support | USD 10 | chat, summaries, proposals, encouragements, response classification |
| Mini assessment banks | USD 3 | cache by curriculum version/language, never per chat |
| Safety/retry reserve | USD 2 | controlled retry/failure margin |
| Total | **USD 15** | hard shared account cap |

Image generation cannot begin without explicitly reallocating this table or
raising the product budget. Every call reserves maximum cost before provider
access and settles actual use afterward. Existing per-user/per-minute limits
apply to every added purpose.

Mini generation must deduplicate by course, module, language, curriculum
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
- strict current-question/current-objective model context.

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

Proposed safe limit:

1. initial module assessment;
2. one targeted review/re-check;
3. one alternative-format re-check (typed or MCQ, learner choice);
4. allow continue with a review marker and a supportive revisit path.

The exact passing threshold and whether any course blocks progress require
product/educational approval. The model cannot invent them.

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
  -> Nano/deterministic selector chooses learner item
  -> scoped response evaluator
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
| "server/adaptive-support-service.mjs" | deterministic policy, Nano proposal/encouragement, schema validation, cooldown/consent |
| "server/assessment-service.mjs" | bank lifecycle, item selection, response evaluation, retry/final state |
| "server/assessment-schemas.mjs" | strict schemas, enums, objective validation |
| "server/visual-explanation-service.mjs" | visual intent, moderation, cache/storage metadata; disabled until visual release |
| "server/adaptive-policy.mjs" | versioned limits, trigger rules, cooldowns, retention, feature flags |
| "server/privacy-service.mjs" | consent versioning, export/delete workflow, retention jobs |

After tests exist, "server.mjs" can add authenticated, origin-checked,
payload-bounded endpoints:

~~~text
POST /api/v1/learning-summary
POST /api/v1/adaptive/proposal
POST /api/v1/adaptive/proposal/:id/decision
POST /api/v1/assessment/start
POST /api/v1/assessment/:runId/answer
GET  /api/v1/assessment/:runId
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

New Render/local variables use disabled/restrictive defaults:

~~~text
ADAPTIVE_LEARNING_ENABLED=false
AI_ASSESSMENTS_ENABLED=false
AI_VISUALS_ENABLED=false
OPENAI_TEST_GENERATION_MODEL=gpt-5.1-codex-mini
OPENAI_TOTAL_MONTHLY_APP_USD_CAP=15
OPENAI_TOTAL_MONTHLY_USER_USD_CAP=2
OPENAI_ASSESSMENT_MONTHLY_APP_USD_CAP=3
OPENAI_ASSESSMENT_REQUESTS_PER_MINUTE=2
LEARNING_ANALYTICS_RETENTION_DAYS=<approved value>
FIREBASE_STORAGE_BUCKET=<approved bucket when visuals ship>
~~~

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
3. Add Nano structured proposals/encouragement.
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
2. Build Mini bank generation, validators and human-approval workflow.
3. Add Nano/deterministic selection and scoped response evaluation.
4. Add bounded review/retry/final flow.
5. Validate no-score/no-answer-leakage guarantees.

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

## 16. Research/design references

The request named “Stanford NNEA.” I could not identify a source with that
exact name in available results, so Type2Learn must not attribute these
recommendations to a specific NNEA publication without a verified source.

The requested directions broadly align with Stanford public student-support
resources about task initiation, dyslexia reading strategies, visual learning,
text-to-speech and adjustable reading presentation. They are design
inspirations, not clinical validation of this product:

- [Stanford Center for Teaching and Learning: Getting Started on Tasks](https://ctl.stanford.edu/students/getting-started-tasks)
- [Stanford Student Learning Programs: Strategies for Managing Dyslexia](https://studentlearning.stanford.edu/strategies-managing-dyslexia)
- [Stanford Center for Teaching and Learning: Navigating Stanford as a Neurodiverse Student](https://ctl.stanford.edu/navigating-stanford-neurodiverse-student)

Before public evidence-based claims, Type2Learn needs independent curriculum
review, accessibility review, appropriate study/evaluation and approved wording.

## 17. Definition of done

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
