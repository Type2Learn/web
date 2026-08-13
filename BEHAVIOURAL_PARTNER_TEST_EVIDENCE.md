# Behavioural Learning Partner — Automated Test Evidence

This matrix verifies the Behavioural Learning Partner without provider keys,
Firebase credentials, browser storage, a microphone, or real learner data.
Every case is deterministic and can run on a local machine or CI.

```bash
npm test
```

## Matrix

| Product feature | Test file | Independently named cases | What the cases prove |
| --- | --- | ---: | --- |
| Unified Behaviour Context and learner controls | `tests/behaviour/context-matrix.test.mjs` | 170 | All 144 role/presence/on-off/proactive/channel combinations normalise safely; threshold boundaries, session reset, visibility aggregation, and raw-content exclusion work. |
| Four fictional partner roles and presentation surfaces | `tests/behaviour/learning-partner-matrix.test.mjs` | 138 | Eleven modules × English/Urdu × four roles retain authored task-bound copy; Focused/Quiet surfaces do not compete with the task; assessment support remains process-only; voice requires review. |
| Privacy, validation, dismissal, and model-message guardrails | `tests/behaviour/privacy-contract-matrix.test.mjs` | 124 | One hundred untrusted payload shapes are redacted; unsafe model wording is rejected; disabled/dismissed partner state yields no directive; enum/ID/counter bounds are enforced. |
| Unified downstream use | `tests/behaviour/unified-feature-matrix.test.mjs` | 261 | Behaviour states can trigger one reversible presentation proposal, alter only question ordering, and are allow-listed before Adaptive Recall sees them. No state creates a score or learner label. |
| Existing Type2Learn AI, assessment, auth, voice, mascot, and UI tests | `tests/ai`, `tests/auth`, `tests/ui`, `tests/voice` | 42+ | Regression coverage for the surrounding course and AI safety paths. |

The new behavioural matrix contains **693 independently named automated cases**.
Combined with the existing suite, it gives the system **735 passing checks**.

## Latest local evidence

On 11 August 2026, the full deterministic test suite completed with:

```text
tests  735
pass   735
fail   0
```

The four feature matrices also pass independently: Behaviour Context **170/170**,
Learning Partner roles and surfaces **138/138**, privacy and model guardrails
**124/124**, and unified downstream use **261/261**.

The counts above are deterministic Node tests. The optional Playwright smoke
script is deliberately reported separately: this workstation's NixOS loader
cannot launch Playwright's downloaded Chromium binary, so it is not included
in the passing total. That is an environment limitation, not a waived browser
test; run `npm run test:ui` on Render CI or a standard Linux runner for the
visual guest-course smoke test.

## Important limits that are intentionally tested

- No raw typed response, individual keystroke, recording, transcript, full chat
  message, answer key, score, IP address, fingerprint, or learner profile may
  enter the Behaviour Context contract.
- The partner must be on, proactive offers must be on, and at least two neutral
  signals must match before one offer can appear.
- A dismissal suppresses that offer for the current task.
- Behaviour can select presentation/order only. It never decides readiness,
  pass/fail, an assessment result, or a saved preference.
- Gemini Flash-Lite wording is optional; authored fallback content remains the
  normal safe path for no-consent, no-network, provider failure, or invalid JSON.

For a deployment, set `BEHAVIOUR_CONTEXT_ENABLED=true` and,
if personalised wording is wanted, `MASCOT_PARTNER_AI_ENABLED=true`. Consent,
Firebase, and `ADAPTIVE_LEARNING_ENABLED=true` remain required before any
compact module summary is uploaded.
