# Type2Learn Goals and Delivery Plan

## North-star outcome

Deliver a trustworthy, accessible Type2Learn web platform where a learner can choose private support settings, be routed to a suitable starting point, complete a real active-typing learning loop, recover safely after interruption, and show meaningful learning evidence to themselves and - where authorized - to a teacher or family member.

The product must work without a diagnosis, preserve learner dignity, and be honest about what is released, planned, or not yet validated.

## First-slice definition of success

The initial usable vertical slice proves all of the following:

- A visitor understands that Type2Learn is active learning through typing, not a speed test or passive course library.
- A learner can complete onboarding, choose or skip private settings, select a path, and enter an age-respectful lesson.
- The lesson has a visible objective, one current action, accessible response routes, specific feedback, correction/reconstruction, application or transfer, and a meaningful completion condition.
- Work survives typing, settings, help, pause, refresh, connection loss, and return after absence. Resume restores the exact state.
- Keyboard-only, reduced motion, sound off, readable text, screen-reader semantics, mobile reflow, and no-color-only state work in the core flow.
- An authorized teacher view can inspect final evidence, support use, correction, and complete/paused/review status without surveillance scoring.
- Public pages have accurate status labels, Privacy/Terms/Accessibility/Support routes, and no unsupported medical, learning-outcome, or accreditation claims.

## Delivery phases

### Phase 0 - Foundation (current)

- Keep agent.md, context.md, and this file current.
- Preserve the required offline archive rule and local zip/ exclusion.
- Receive the repository URL; inspect its framework, conventions, deployment, data services, CI, and existing changes before application work.
- Confirm decisions that change scope: initial curriculum/language, launch audience/region, auth model, hosting, legal entity, brand assets, and permitted public claims.

### Phase 1 - Landing and trust MVP

Build the fast, accessible public site:

- semantic navigation and responsive layout;
- hero with active-learning promise and a deterministic, keyboard-accessible, skip-able 60-second typing demo;
- concise active-learning explanation, pathways, neuroinclusive controls, research/evidence limits, responsible-AI boundaries, team summary, FAQ, CTA, and legal/support footer;
- accurate prototype/released labels, no autoplay, no essential motion, no external social embed, and no typed-input tracking;
- accessible placeholders or completed routes for Team, Schools, Research, Privacy, Terms, Accessibility, Security, and Support.

Exit gate: the first viewport and demo work without sound or animation; keyboard, reduced-motion, zoom, and privacy checks pass; only truthful claims and approved team data are public.

### Phase 2 - Core learner vertical slice

Build one reusable lesson engine and one literacy-first, audio-capable course:

- neutral route-selection onboarding and changeable private support settings;
- authorable structured content, not duplicated lesson pages;
- Read/Hear -> Recall -> Type/Produce -> Check -> Correct/Reconstruct -> Apply -> Return loop;
- continuous local save, authenticated persistence when ready, pause, refresh/resume, temporary offline resilience, and Return Win;
- basic teacher evidence view and resettable demo state;
- content-specific feedback, correction, transfer, and later review;
- deterministic fallback when backend or AI is unavailable.

Exit gate: all showcase routes complete without manual intervention; independent responses hide supports where appropriate; attempts, hints, corrections, review context, and resume state persist; accessibility and mobile checks pass.

### Phase 3 - Backend, roles, and data readiness

- Secure auth and authorization for relevant learner, parent/guardian, teacher, administrator, specialist, and service roles.
- Role-based access, audit history, content publishing status, assignments, human review/override, export/deletion paths, and school boundaries.
- Backups, monitoring, secure secrets, safe logging, incident response, support/security routes, and retention jobs.
- Complete privacy, consent, safeguarding, vendor, legal, and accessibility gates before production learner or school data.

### Phase 4 - Module expansion and co-design

1. Expand Word Builder with reviewed literacy and academic word objects.
2. Add Focus Sprint's Now -> Next -> Done planning, bounded sprints, recovery, and support reporting.
3. Add Predictable Path's lesson shell, Preview Card, literal help ladder, sensory manifest, transitions, and Change Card.
4. Expand subject and language pathways only with curriculum, linguistic, accessibility, and user review.

### Phase 5 - Pilot and evidence

- Conduct usability and accessibility safety work before outcome claims.
- Pilot a defined version, content set, population, dose, and measures with proper consent and governance.
- Measure trained performance, transfer, delayed retention, coursework/connected-text performance, learner experience, technical reliability, and adverse effects - not just time, points, taps, words displayed, or speed.
- Publish limitations and null findings honestly.

## Current priority order

1. Connect the repository and preserve its conventions.
2. Establish the landing/trust foundation and design system.
3. Implement the reusable loop with one complete literacy-first course.
4. Add safe backend persistence and authorized teacher evidence.
5. Validate with people, then expand modules.

## Product-owner decisions needed

- Repository URL and preferred deployment/hosting environment.
- Initial curriculum and language scope, plus approved content/audio assets.
- Release audience, school/parent account model, and launch geography.
- Approved logo/brand assets, team biographies/portraits/contact visibility, official social URLs, and feature-status labels.
- Legal entity, vendors/hosting, consent and retention settings, pricing/billing, school agreement, and launch-market legal review.

## Always-on quality gates

- No Git commit is complete until the exact-commit local archive exists in zip/, as required by agent.md.
- No change ships without appropriate functional, responsive, keyboard, reduced-motion, and accessibility verification.
- No public content lacks source, owner, status, and factual review.
- No production data feature lacks privacy, safeguarding, security, access-control, and deletion consideration.
- No public claim outruns released capability or evidence.
