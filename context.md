# Type2Learn Product Context

## Product summary

Type2Learn is a K-12 platform for active, typing-based learning. The learner should read or hear a small idea, recall it, type or produce a response, check and correct it, apply it, and return later. Progress means participation and learning evidence - not merely time, clicks, points, or speed.

Primary audiences are K-12 learners in Pakistan, including low-literacy and neurodivergent learners, plus families, educators, schools, specialists, researchers, and future contributors. The platform is educational, not clinical or diagnostic. Supports are available to everyone without requiring a label or disclosure.

Public promise: Learn by typing. Build knowledge that stays.

## Three connected learning modules

### Word Builder

Word Builder is structured literacy and academic word learning. It covers sound awareness, phonics, spelling patterns, morphology, vocabulary, connected text, and disciplinary language.

- Typing is the response and evidence channel, not the learning goal.
- Use reviewed word and lesson objects, approved audio, error-specific feedback, reconstruction, transfer, and delayed retrieval.
- Keep instructional skill level separate from presentation age, vocabulary, imagery, and subject context.
- Do not show a public typing-speed score, public error history, or instruction countdown.

### Focus Sprint

Focus Sprint supports initiation, working memory, correction, and return to grade-level academic work.

- Use an objective card and a visible Now -> Next -> Done plan.
- Typical authored windows are 3, 5, or 7 minutes, but meaningful academic completion - not the countdown - governs success. Learners can hide time.
- Continuously save the exact state: response, cursor, scratch work, evidence, hints, and active step.
- Offer respectful immediate feedback, optional short breaks, private distraction recovery, and a Return Win after absence.
- Teacher reporting separates academic work, supports, correction, completion, and review; it must not create one focus score.

### Predictable Path

Predictable Path is a configurable delivery layer around ordinary curriculum, not a separate subject or cosmetic autism mode.

- Use a stable shell: course/lesson, Step X of Y, Settings/Help/Pause/Exit, visible path, one active task, support panel, and consistent Back/Save/Continue controls.
- Every lesson starts with a Preview Card showing objective, steps, duration range, interactions, sensory events, completion, unlock, and declared changes.
- Literal instructions state action, object, quantity, source, response form, and completion condition.
- Lesson manifests declare every audio, animation, vibration, flash, video, and celebration. Disabled channels require an equivalent alternative.
- Transition notices and Change Cards explain what ends, what stays saved, what follows, sensory differences, and learner choices.

## Initial delivery direction

The concept document recommends a literacy-first MVP: one complete literacy course, simple starting-point selection, the typing engine, and an audio-led/non-reader path. The three PDRs each define a high-fidelity module vertical slice.

Default reconciliation until the product owner decides otherwise:

1. Build one reusable active-learning engine and routing onboarding.
2. Deliver one literacy-first, audio-capable end-to-end course.
3. Make content manifests, settings, autosave, analytics, response components, and reporting reusable by all three modules.
4. Add advanced Focus Sprint and Predictable Path surfaces after the core loop is reliable, accessible, and tested with people.

The initial slice proves real launch, response, feedback, correction, autosave, pause/refresh, return, completion, and authorized teacher evidence. It does not claim a complete K-12 intervention or measured outcome.

## Website and IA

The public site must explain the active-learning mechanism quickly, establish trust, and offer each audience a relevant next action. It should be calm, modern, readable, age-respectful, and controllable.

Suggested routes:

- / - landing page and a deterministic 60-second typing demonstration
- /how-it-works - active-learning loop
- /pathways - released learning routes and prerequisites
- /learners, /families, /schools, /research, /team, and /community
- /privacy, /terms, /accessibility, /security, and /support
- authentication plus protected learner and educator application routes

Landing requirements:

- The first viewport explains active learning without sound, motion, diagnosis, or prior knowledge.
- The hero offers a real, skip-able, keyboard-accessible, local/transient typing demo and controls preview for reduced motion, sound off, and literal instructions.
- The site needs audience-specific paths for learners, families, schools, professionals/researchers, contributors, and partners.
- Explain evidence, limitations, responsible AI, privacy, team accountability, and product previews with accurate status labels.
- Do not use social links inside primary child lesson flows. External links are labelled, privacy-preserving, and only live when official accounts are ready.

## Visual system

| Token | Value | Use |
| --- | --- | --- |
| Growth Green | #19C85A | starts, progress, positive pathway state |
| Learning Teal | #19C5B5 | secondary learning and co-design |
| Focus Cyan | #19BDEB | feedback and interaction highlights |
| Trust Blue | #1769F5 | links, focus rings, professional actions |
| Deep Ink | #0A1630 | text, navigation, high-contrast icons |
| Cloud White | #F5FAFF / white | calm background and cards |

Use a highly legible sans-serif such as Inter, Atkinson Hyperlegible, or a tested system fallback. Prefer content clarity, clear widths, 16-24 px cards, subtle shadows, and limited directional green-to-blue gradient. Dots, nodes, paths, and animation are decorative unless they communicate a real state.

## Accessibility and data baseline

- WCAG 2.2 AA minimum; full keyboard operation, visible focus, screen-reader names/states/errors, logical tab order, captions/transcripts, touch-safe targets, and no precision-drag-only action.
- Respect reduced motion; no autoplay essential audio; static equivalents for essential movement; no color-only state.
- Settings may include text size, line/letter/word spacing, content width, contrast, audio, timer visibility, focus mode, literal instructions, sensory settings, and valid alternative input.
- Test at 320 px, tablet, desktop, 200% text zoom, 400% reflow, high contrast, keyboard-only, touch, and common screen-reader/browser combinations.
- Autosave acknowledgement should be within two seconds under normal conditions, with local fallback in connection loss and clear recovery messages.
- Use role-based access, least privilege, audit logs, encrypted transport/storage, multi-factor authentication for privileged users, backup/recovery, dependency monitoring, and secure incident response.
- First-party analytics only. Never include typed lesson content, exact age, school, disability label, direct identifier, or free-text support data in event properties.

Minimum data objects: LearnerProfile, LessonManifest, LearnerAttempt, Assignment, versioned content objects, ChangeRecord, AssetRecord, and AdvisorDecision.

## Privacy, legal, social, and team status

The Privacy Policy and Terms are detailed publication drafts, not final legal documents. Before launch, obtain counsel approval for the legal entity, address, privacy lead, launch markets, vendors/hosting, consent, retention, payments/refunds, governing law, and school data agreement.

Required posture: no learner-data sale, targeted advertising, data brokerage, public-model training without explicit permission, or default public sharing for minors. School use requires role controls, export/deletion, student-data boundaries, and a DPA or equivalent agreement.

Official LinkedIn and GitHub URLs are placeholders. Link them only after organization ownership, multiple administrators/owners, MFA, recovery, moderation, security disclosure, and public-code review are ready.

Public team mapping, pending each person's approval of their displayed information:

| Person | Role |
| --- | --- |
| Muhammad Taha Bin Zaeem | Founder |
| Muhammad Fahad Younus | Co-founder & AI Lead |
| Idrees Babar | Co-founder & Research Lead |
| Alizay Hassan | Co-founder & Product Lead |
| Muhammad Hamiz Bin Kahsif | Co-founder & Engineering Lead |

Use support@type21earn.tech as the proposed general support route only after it is configured and monitored.

## Evidence labels

Use clear status language for product and research communication:

- Supported - direct research basis for a general principle.
- Adapted - product translation that still needs testing.
- Experimental - hypothesis being evaluated.
- Community-informed - changed because of lived-experience input.
- Planned - not released and not an outcome claim.
