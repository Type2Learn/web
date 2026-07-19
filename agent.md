# Type2Learn Agent Rules

## Project authority

Type2Learn is a K-12 active-learning platform. Learners read or hear a bounded idea, recall or reconstruct it, type or otherwise produce a response, receive specific feedback, correct it, apply it, and return to it later. It is not a speed-first typing tutor, passive video library, timer around a worksheet, or points machine.

Read context.md and goal.md before making product decisions. The supplied materials in ../Resource are the source of truth until an approved decision supersedes them. Never silently invent curriculum coverage, research outcomes, prices, team credentials, legal details, integrations, or social URLs.

## Hardcoded rule: offline archive for every Git commit

**Whenever changes are committed to GitHub, immediately create a ZIP archive of that exact committed code inside the local zip/ folder in this repository. This is mandatory.**

1. Archive the committed tree, never the working directory:
   git archive --format=zip --output "zip/type2learn-<short-commit-sha>.zip" HEAD
2. Use the commit SHA in the filename; keep all prior archives as the offline history.
3. Verify that the intended commit is HEAD and the ZIP exists before reporting a commit as complete.
4. zip/ must stay local-only and untracked. It is ignored by .gitignore.
5. If a commit is amended, rebased, or replaced, archive the resulting commit as a new ZIP. Never overwrite a different commit's archive.

Do not make a Git commit if its archive cannot be created. If Git or the archive command is unavailable, report that explicitly rather than describing the commit workflow as complete.

## Product, inclusion, and UX rules

- Build active learning, not public competition. Do not rank learners by typing speed, errors, disability, or a focus score.
- Keep grade-level intellectual expectations separate from chosen supports or presentation age.
- Present supports as private, configurable controls. Never require a diagnosis or infer ADHD, autism, dyslexia, intelligence, motivation, emotion, effort, or compliance from behaviour or telemetry.
- Never add webcam monitoring, gaze/face/emotion analysis, browser policing, surveillance feeds, or punitive streaks.
- Make the current action and completion condition clear. Feedback must name a useful next action and require reconstruction after answer reveal.
- Save meaningful work continuously. Help, settings, pause, refresh, and temporary offline use must not destroy a learner's work.
- Tie rewards to demonstrated learning, correction, transfer, review, or re-entry - never idle time, random taps, or answer exposure.
- Make return after absence calm and shame-free. Do not remove mastery, earned items, or progress because of missed days.
- Use stable landmarks and predictable controls. Motion can clarify state, but it must never gate content or compete with the task.
- Build from 320 px mobile upward and test keyboard-only use, screen readers, touch, 200% text zoom, 400% browser reflow, high contrast, and reduced motion.

## Accessibility, privacy, AI, and safeguarding

- WCAG 2.2 AA is the minimum target. Support keyboard access, visible focus, semantic names/states/errors, captions/transcripts, text/spacing/contrast/audio/pacing controls, and no color-only meaning.
- Respect prefers-reduced-motion and provide a product motion control. No autoplay essential audio, flashing failure state, or forced time limit.
- Minimize data. Learner content, progress, support settings, typed responses, and raw keystroke telemetry are private by default.
- Do not add advertising pixels, session replay of typed input, cross-site behavioural profiling, data brokerage, or targeted advertising.
- Never train public or third-party foundation models on learner data without separate, explicit, age-appropriate permission.
- AI may only assist within constrained, reviewable inputs and outputs. It must not diagnose, discipline, make high-stakes decisions, or publish unchecked curriculum. Keep deterministic human-authored fallbacks for learning-critical flows.
- Child accounts, school data, public sharing, certificates, payments, and social integrations need the appropriate consent, privacy, safeguarding, legal, and accessibility gates before release.
- Privacy Policy and Terms of Service in the source pack are drafts, not legal advice. Do not publish them as final until counsel approves the actual entity, address, launch markets, vendors, retention, consent, billing, dispute, and school-agreement details.
- Label concepts, prototypes, beta features, screenshots, curriculum, and certificates honestly. Do not claim a cure, diagnosis, universal result, accreditation, or measured learning outcome without the required evidence.

## Engineering and public-site rules

- Store lessons and content in reviewed, versioned objects/manifests; do not duplicate hard-coded screens per course.
- Use role-based access, least privilege, auditability, secure transport, safe logging, and clear recovery states before calling learner or school data production-ready.
- Public pages need semantic HTML, accessible forms, explicit external-link labels, visible Privacy/Terms/Accessibility/Support routes, and truthful feature-status labels.
- Official LinkedIn and GitHub links remain hidden or visibly inactive until the accounts are team-controlled, verified, and governed.

## Work discipline

1. Inspect existing work and preserve unrelated changes.
2. Keep material decisions traceable to context.md, goal.md, or an approved owner decision.
3. Make the smallest coherent change that advances the current milestone.
4. Run relevant functional, responsive, keyboard, reduced-motion, and accessibility checks.
5. Update project guidance when a material decision changes.
6. Before and after every Git commit, follow the hardcoded archive rule.

## Source materials reviewed

- Type2Learn_Concept(1).pdf
- Type2Learn_Focus_Sprint_K12_ADHD_PDR_v1.0.docx
- Type2Learn_Predictable_Path_K12_Autism_PDR_v1.0.docx
- Type2Learn_Word_Builder_K12_Dyslexia_PDR_v1.0(1).docx
- Type2Learn_Landing_Page_PDR.pdf
- Type2Learn_Team_Page.pdf
- Type2Learn_LinkedIn_and_GitHub_Page.pdf
- Type2Learn_Privacy_Policy.pdf
- Type2Learn_Terms_of_Service.pdf

The final five files are contained in Type2Learn_PDF_Pack(1).zip.
