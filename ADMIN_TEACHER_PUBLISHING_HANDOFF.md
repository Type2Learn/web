# Admin, Teacher, Institute, and Theory-Publishing Handoff

**Branch:** `work-after-hackatron-sub`  
**Working checkout:** `H:\Type2Learn\Type2Learn-web\tmp\branch-dev`  
**Read first:** `agent.md`, `context.md`, and `goal.md` in the repository root. The rules in `agent.md`, especially the exact-commit `zip/` archive rule, are mandatory.

This document records the state of the educator-workspace and reusable theory-course work as it stands at the handoff. It is deliberately candid: the feature is a tested implementation slice behind configuration flags, not a claim that a school-data production service is fully configured or released.

## What has been implemented

### 1. Access, roles, codes, and private rosters

- Server-enforced roles are defined in `server/access-policy.mjs`:
  `platform-admin`, `institute-owner`, `teacher`, and `learner`.
- `server/access-service.mjs` implements:
  - one-time bootstrap of the first platform admin using a SHA-256 hash of a setup code;
  - expiring, one-use, revocable role and learner-invite codes stored as HMAC digests (the raw code is only returned at creation time);
  - Firebase custom-claim refresh plus a fresh Firestore account/membership check on every protected request;
  - organisation membership, private roster reads, and audit records;
  - code listing/revocation and membership revocation.
- The newly added membership-revocation work is important: educator/learner roles granted by an organisation only remain effective while the membership is active. Revoking membership marks it inactive in Firestore, recomputes roles, refreshes claims, and writes an audit record. Platform-admin is deliberately organisation-independent.
- `workspace.js` now displays issued codes (with only a short opaque digest reference), supports revoking unused codes, and lets authorised staff remove a roster member. The prior client-side source-upload field mismatch was corrected from `source` to `sourceFile`.
- API entry points are registered in `server.mjs` under `/api/v1/access/`.

### 2. Theory-course authoring pipeline

- `server/theory-course-markdown.mjs` defines and parses `type2learn-theory-course/v1` Markdown.
- It validates ordered modules, bilingual English/Urdu content, short reading sections, supports, activity/check structures, final exam structure, and four-option MCQs.
- It compiles a **private authoring manifest** (review details and answer keys) and a **learner-safe manifest** (no answer keys, original uploads, or admin notes).
- `server/course-authoring-service.mjs` accepts private source submissions, validates types/sizes/checksums, extracts safe text from supported textual formats, and keeps scanned/unknown material private with a requires-transcription state.
- Upload intake exposes theory now. Theory + coding, interactive/project, and other types are visibly locked in the educator UI and rejected server-side.
- `server/course-workflow.mjs` is the canonical state machine:

  ```text
  submitted → source-reviewed → markdown-draft → validation-ready
  → ai-draft-ready → admin-review → audio-ready → backups-pending
  → backups-verified → approved → published
  ```

  Returned/rejected transitions are also explicit. Do not bypass the state machine in a UI route.

### 3. AI drafting and human review

- `server/model-provider.mjs` and the authoring service use Gemini first with OpenAI only as the constrained fallback.
- AI output is schema-shaped JSON and is limited to filling missing plain-language summaries, examples, hints, and fallback four-option MCQs. It is marked as draft and is not learner-visible until human acceptance/review.
- `server/fallback-assessment-bank.mjs` provides deterministic fallback MCQ structures.
- Human narration asset handling is part of `server/course-authoring-service.mjs`. Learner device text-to-speech remains an intentional, labelled fallback and must not autoplay.

### 4. Review, backup, approval, and course distribution

- `/admin/` is implemented by `admin/index.html`, `workspace.js`, and `workspace.css`. It contains initial setup, code management, submission/review controls, Markdown/AI/audio/backup state, audit-oriented messaging, and a learner-preview shell.
- `/teacher/` and `/institute/` have source submission, theory-only type cards, learner invites, roster controls, catalogue/distribution controls, and safe View-as-learner preview shells.
- `server/course-backup-service.mjs` is the publishing gate. Before it allows publication, it requires verified Firebase, private GitHub metadata, Supabase package storage, and a human-acknowledged downloadable ZIP. It rejects attempts made before `backups-pending` and blocks if any receipt is missing.
- `server/course-package.mjs` builds deterministic package ZIPs. Never commit raw educator uploads, learner data, credentials, raw codes, or Firebase service-account data to GitHub.
- `server/course-catalog-service.mjs` handles publishing/distribution, organisation-only and selected-learner assignment states, and platform-wide release requests. Admin approval remains the final release boundary.

### 5. Reusable learner course player

- `/courses/` uses `courses/index.html` and `courses/catalogue.js` to fetch accessible learner catalogue entries.
- `course/dynamic-course.js` and `course/dynamic-course.css` render learner-safe theory manifests by `courseId`, persist progress through `server/course-progress-service.mjs`, run private answer checks server-side, and display optional supports through the existing shared support-settings model.
- The player supports bounded content, reading, examples, hints, typed/alternative response routes, four-option checks, exams, results, and the current shared supports. It intentionally reuses existing learner settings instead of creating a separate educator-only support model.

## Critical known limitation: the legacy course is not yet fully source-replaced

The existing **Introduction to Neurodivergent Conditions** learner experience has a deterministic Markdown migration object in `server/legacy-neurodivergent-migration.mjs`, and the catalogue route can recognise it as a legacy course. However, the established `/course/` experience still ultimately imports hard-coded content from `course/course-content.js` through `course/course.js`.

The relevant code is:

| Purpose | Files |
| --- | --- |
| Existing legacy course engine/content | `course/course.js`, `course/course-content.js`, `course/index.html` |
| Legacy migration object | `server/legacy-neurodivergent-migration.mjs` |
| Catalogue and legacy guard | `server/course-catalog-service.mjs`, `course/course-router.js` |
| Generic manifest player | `course/dynamic-course.js`, `course/dynamic-course.css` |

The next implementation owner should deliberately complete this migration while preserving the proven learner UX and its settings, progress, TTS, and exam behaviour. Do **not** shortcut this by exposing private answer keys in a browser manifest. This is the largest remaining item relative to the original “replace hard-coded course source” requirement.

## UI and route map

| Route | Main files | Intended access |
| --- | --- | --- |
| `/admin/` | `admin/index.html`, `workspace.js`, `workspace.css` | platform admin |
| `/teacher/` | `teacher/index.html`, `workspace.js`, `workspace.css` | teacher / institute owner as appropriate |
| `/institute/` | `institute/index.html`, `workspace.js`, `workspace.css` | institute owner |
| `/redeem/` | `redeem/index.html`, `redeem/redeem.js` | signed-in code recipient |
| `/courses/` | `courses/index.html`, `courses/catalogue.js` | learner catalogue |
| `/course/?courseId=…` | `course/course-router.js`, `course/dynamic-course.js` | allowed learner course |
| Existing `/course/` | `course/index.html`, `course/course.js` | legacy neurodivergent prototype |

`?demo=1` is available on the workspace pages for visual-only inspection. It is not an authentication or security substitute and must never make protected server actions available.

## Server map and configuration

`server.mjs` is the Node entry point. The services are designed to remain disabled until configured; this is intentional.

Minimum private-workspace configuration is loaded by `server/config.mjs`:

```text
EDUCATOR_WORKSPACE_ENABLED=true
COURSE_PUBLISHING_ENABLED=true
FIREBASE_PROJECT_ID=…
FIREBASE_SERVICE_ACCOUNT_JSON=…
FIREBASE_STORAGE_BUCKET=…
ADMIN_BOOTSTRAP_CODE_SHA256=…
ROLE_CODE_PEPPER=…
```

Backup verification additionally requires:

```text
COURSE_BACKUP_GITHUB_REPOSITORY=owner/private-repository
COURSE_BACKUP_GITHUB_TOKEN=…
COURSE_BACKUP_GITHUB_BRANCH=main
SUPABASE_BACKUP_URL=…
SUPABASE_BACKUP_SERVICE_ROLE_KEY=…
SUPABASE_BACKUP_BUCKET=…
```

AI drafting may use configured Gemini keys (`GEMINI_API_KEY`, `GEMINI_API_KEYS`, or existing aliases) and falls back only to the approved OpenAI configuration (`OPENAI_API_KEY` plus the approved endpoint). Do not put any secret in a browser bundle, Markdown package, archive intended for sharing, or the private backup repository.

Firebase Security Rules, bucket permissions, real service-account provisioning, retention/deletion policy, consent/safeguarding review, and real external backup credentials still need production-owner review before school or learner data is used. The code’s feature flags and server checks are guardrails, not a completed legal or operations programme.

## Tests and checks already available

The suite uses Node’s test runner:

```powershell
npm.cmd test
```

Before the current handoff changes, the complete suite passed with **935 tests**. The handoff commit adds an access-policy test for inactive memberships; rerun the full command after checkout to obtain the current exact count.

Important test folders:

| Area | Tests |
| --- | --- |
| roles/codes/invites | `tests/access/` |
| Markdown/compiler/intake/review | `tests/course-authoring/` |
| catalogue/progress/publishing/backup | `tests/course-authoring/`, `tests/auth/` |
| generic learner player and UI | `tests/ui/` |
| existing shared settings and course | existing root and course tests |

Useful local commands:

```powershell
node --check server.mjs
node --check server/access-service.mjs
node --check workspace.js
npm.cmd test
npm.cmd start
```

The last visual checks used Playwright/Edge screenshots in ignored `tmp/screenshots/` and confirmed the admin publishing demo, teacher mobile publishing demo, and learner catalogue demo render. An in-app browser was unavailable in that environment, so hardware microphone playback, real Firebase authentication, and real third-party backup writes still require an interactive configured-browser/integration pass.

## Recent commits in this workstream

These commits were pushed to `work-after-hackatron-sub`, and each exact tree was archived locally in ignored `zip/`:

```text
ad5ff7d chore(admin): establish access roles and code foundation
bfc864e feat(authoring): add bilingual theory Markdown compiler
2da92e7 feat(authoring): add secure course intake and review workflow
91619dd feat(publish): add verified multi-backup release gate
32008b6 feat(review): add private educator workspaces and source review
54d0a7b fix(review): include shared workspace assets
e95d9e9 feat(course): generalise catalogue, learner manifests, progress, and assessments
a370d44 fix(course): enforce catalogue access for progress saves
b7de08e feat(review): enforce human workflow approvals
159f77d feat(course): apply supports to generic theory player
```

The commit that adds this handoff file completes the small final audit fixes: working source-file lookup, full opaque IDs for code revocation, issued-code UI, roster-member revocation, and immediate role invalidation after membership revocation.

## Recommended continuation order

1. **Finish the intentional legacy-course migration.** Make `Introduction to Neurodivergent Conditions` a normal reviewed Markdown/manifest course without regressing its existing accessible learner experience or leaking answer keys.
2. **Add Firebase emulator/integration coverage.** Exercise bootstrap, code redemption/expiry/revocation, membership revocation, Firestore membership enforcement, Storage access, and audit receipts against real rules.
3. **Exercise real admin review end to end.** Upload supported and scanned source examples; validate bilingual Markdown; review/accept AI drafts; upload human narration; verify all four backups; publish; assign; log in as a learner and complete a course.
4. **Complete visual/accessibility evidence.** Capture browser screenshots for the required workflow states; test keyboard-only use, 320 px/mobile, 200% text zoom, 400% reflow, reduced motion, high contrast, and screen-reader semantics.
5. **Before production data:** obtain owner decisions and legal/privacy/safeguarding approvals, configure least-privilege Firebase/Storage rules and private backup repositories, establish retention/deletion and monitoring practices, and make no claim that this is production-ready before those gates are complete.

## Safe working practices for the next model

- Keep using the isolated checkout or confirm `git status` before editing. The main repository workspace has historical user-owned changes that must not be reset or overwritten.
- Use `apply_patch` for edits.
- After every new commit, immediately create and verify exactly:

  ```powershell
  git archive --format=zip --output "zip/type2learn-<short-commit-sha>.zip" HEAD
  ```

  `zip/` remains ignored and must contain the exact committed tree, never a dirty working copy.
- Use only learner-safe manifests in browser responses. Keep raw uploads, review notes, raw codes, identifiers, provider credentials, and answer keys server-side.
- Maintain theory-only enforcement until a separately reviewed coding/project engine exists.
- Treat AI as constrained, review-required drafting assistance only. It must not publish courses, diagnose learners, or process learner data for this workflow.
