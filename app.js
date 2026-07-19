(() => {
  "use strict";

  const route = document.body.dataset.route || "home";
  const navItems = [
    ["how-it-works", "How it works"],
    ["pathways", "Pathways"],
    ["learners", "Learners"],
    ["families", "Families"],
    ["schools", "Schools"],
    ["team", "Team"],
    ["community", "Community & help"],
    ["trust", "Trust"]
  ];

  const iconPaths = {
    arrow: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    keyboard: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M10 10h.01M13 10h.01M16 10h.01M7 14h6M16 14h1"/>',
    path: '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M7.5 16.5 16.5 7.5"/>',
    sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3"/><path d="M1 14h6M9 8h6M17 12h6"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    school: '<path d="m2 10 10-5 10 5-10 5-10-5Z"/><path d="M6 12v5c3 2 9 2 12 0v-5"/><path d="M22 10v6"/>',
    flask: '<path d="M9 3h6"/><path d="M10 3v6.5L4.5 19a2 2 0 0 0 1.74 3h11.52a2 2 0 0 0 1.74-3L14 9.5V3"/><path d="M8 15h8"/>',
    layers: '<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
    pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    message: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8A8.5 8.5 0 0 1 12.5 20a8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7A8.38 8.38 0 0 1 4 11.5 8.5 8.5 0 0 1 8.7 3.9 8.38 8.38 0 0 1 12.5 3h.5a8.48 8.48 0 0 1 8 8v.5Z"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
    lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    spark: '<path d="m12 2 1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2Z"/>',
    headphones: '<path d="M3 14h3v5H3zM18 14h3v5h-3z"/><path d="M3 14a9 9 0 0 1 18 0"/>',
    home: '<path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V10Z"/><path d="M9 22v-7h6v7"/>'
  };

  const icon = (name, small) => '<svg aria-hidden="true" class="icon' + (small ? ' icon-sm' : '') + '" viewBox="0 0 24 24">' + (iconPaths[name] || iconPaths.spark) + '</svg>';
  const status = (text, kind) => '<span class="status-chip chip-' + (kind || 'blue') + '">' + text + '</span>';
  const button = (label, href, kind, attrs) => '<a class="button button-' + (kind || 'secondary') + '" href="' + href + '"' + (attrs || '') + '>' + label + icon('arrow', true) + '</a>';

  const brand = () => '<a class="brand" href="/" aria-label="Type2Learn home"><img class="brand-mark" src="/assets/type2learn-logo.png" alt=""><span class="brand-copy"><span class="brand-name">TYPE2LEARN</span><span class="brand-tagline">Learn actively</span></span></a>';

  const nav = () => {
    const links = navItems.map(([key, label]) => '<a href="/' + key + '/"' + (route === key ? ' aria-current="page"' : '') + '>' + label + '</a>').join('');
    return '<header class="site-header"><div class="scroll-progress" aria-hidden="true"><i id="scroll-progress"></i></div><div class="header-inner">' + brand() + '<nav class="desktop-nav" aria-label="Primary">' + links + '</nav><div class="header-actions"><button class="motion-switch" id="motion-toggle" type="button" aria-pressed="false" aria-label="Turn off decorative motion">' + icon('pause', true) + '<span class="motion-switch-label">Motion</span><span class="motion-switch-state">On</span></button><a class="button button-primary is-small" href="/pathways/">Explore paths' + icon('arrow', true) + '</a><button class="menu-toggle" id="menu-toggle" type="button" aria-expanded="false" aria-controls="mobile-nav" aria-label="Open menu">' + icon('menu') + '</button></div></div><nav class="mobile-nav" id="mobile-nav" aria-label="Mobile primary">' + links + '<a class="button button-primary" href="/pathways/">Explore paths' + icon('arrow', true) + '</a></nav></header>';
  };

  const footer = () => '<footer class="site-footer"><div class="content-wrap footer-top"><div class="footer-brand">' + brand() + '<p class="footer-description">Active, typing-based learning with learner-controlled support. Built around participation, privacy, and clear next steps.</p><span class="footer-preview-label">Educational product preview</span></div><div class="footer-grid"><div><h2>Explore</h2><a href="/how-it-works/">How it works & evidence</a><a href="/pathways/">Pathways</a><a href="/learners/">For learners</a><a href="/families/">For families</a></div><div><h2>Trust</h2><a href="/trust/#accessibility">Accessibility</a><a href="/trust/#privacy">Privacy</a><a href="/trust/#security">Security</a><a href="/trust/#terms">Terms</a></div><div><h2>Connect</h2><a href="/team/">Team</a><a href="/community/">Community</a><a href="/community/#support">Support</a><a href="/schools/">For schools</a><span>Social channels: planned</span></div></div></div><div class="content-wrap footer-bottom"><span>© 2026 Type2Learn. Educational product preview.</span><span class="footer-status"><i></i>Public information is a work in progress.</span></div></footer>';

  const nativeBuilderCredit = '<section class="builder-credit" aria-label="Website development credit"><div class="content-wrap builder-credit-inner reveal"><span class="builder-monogram" aria-hidden="true">N</span><div class="builder-copy"><p>Made with Native.builder</p><strong>Designed and developed in collaboration with an AI-native building environment.</strong><span>Human direction, product context, and accessibility standards shaped every decision.</span></div><a class="builder-credit-link" href="https://builder.nativelyai.com/" target="_blank" rel="noopener noreferrer"><span>Visit Native.builder</span><span class="builder-link-icon" aria-hidden="true">↗</span><span class="sr-only"> (opens in a new tab)</span></a></div></section>';

  const siteCta = () => '<section class="site-cta" aria-labelledby="site-cta-title"><div class="content-wrap"><div class="site-cta-panel reveal"><div class="cta-orbit" aria-hidden="true"><i></i><i></i><i></i></div><div class="site-cta-copy"><p class="section-kicker">Start with one clear next step</p><h2 id="site-cta-title" data-animate-words>See how active learning feels in practice.</h2><p>Explore the learning pathways or try the private, local demonstration. No account, timer, or speed score required.</p></div><div class="site-cta-actions">' + button('Try the learning demo', '/#demo', 'primary') + button('Explore pathways', '/pathways/', 'light') + '</div></div></div></section>';

  const shell = (content) => '<div class="site-shell">' + nav() + '<main id="main-content">' + content + siteCta() + nativeBuilderCredit + '</main>' + footer() + '</div>';

  const pageHero = (eyebrow, title, copy, asideTitle, asideCopy) => '<section class="page-hero" data-hero-scene><div class="hero-atmosphere" aria-hidden="true"><i></i><i></i><i></i></div><div class="content-wrap"><div class="breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span><span>' + eyebrow + '</span></div><div class="page-hero-grid"><div class="page-hero-copy"><p class="eyebrow"><span class="eyebrow-dot"></span>' + eyebrow + '</p><h1 data-animate-words>' + title + '</h1><p>' + copy + '</p><button class="scroll-cue" type="button" data-scroll-next aria-label="Scroll to the next section"><span class="scroll-mouse" aria-hidden="true"><i></i></span><span>Scroll to explore</span></button></div><aside class="page-hero-aside reveal" data-tilt><span class="aside-label">Current direction</span><strong>' + asideTitle + '</strong><span>' + asideCopy + '</span><i class="aside-path" aria-hidden="true"></i></aside></div></div></section>';

  const card = (iconName, title, text, bullets, badge) => '<article class="page-card reveal">' + (badge || '') + '<div class="page-icon">' + icon(iconName) + '</div><h3>' + title + '</h3><p>' + text + '</p>' + (bullets ? '<ul>' + bullets.map((item) => '<li>' + item + '</li>').join('') + '</ul>' : '') + '</article>';

  const moduleMarks = {
    book: '/assets/modules/word-builder.webp',
    path: '/assets/modules/focus-sprint.webp',
    layers: '/assets/modules/predictable-path.webp'
  };

  const moduleCard = (iconName, title, label, text, items, kind) => '<article class="module-card reveal">' + status(label, kind) + '<div class="module-mark" aria-hidden="true"><img src="' + moduleMarks[iconName] + '" alt=""></div><h3>' + title + '</h3><p>' + text + '</p><ul class="check-list">' + items.map((item) => '<li>' + item + '</li>').join('') + '</ul></article>';

  const landing = () => {
    const loop = [
      ['01', 'Read / Hear', 'Open one clear, bounded idea.'],
      ['02', 'Recall', 'Use a cue before the full answer appears.'],
      ['03', 'Type / Produce', 'Show what you understand in a usable response.'],
      ['04', 'Check', 'Receive immediate, specific feedback.'],
      ['05', 'Correct', 'Reconstruct after seeing a model.'],
      ['06', 'Apply', 'Use the idea in a meaningful task.'],
      ['07', 'Return', 'Revisit it later for durable learning.']
    ].map((item, index) => '<article class="loop-step reveal" data-delay="' + (index % 4) + '"><span class="loop-index">' + item[0] + '</span><h3>' + item[1] + '</h3><p>' + item[2] + '</p></article>').join('');

    const modules = moduleCard('book', 'Word Builder', 'Adapted', 'Structured literacy and academic word learning through sound, spelling, meaning, correction, and return.', ['Reviewed word objects', 'Meaningful reconstruction', 'Delayed retrieval'], 'blue') + moduleCard('path', 'Focus Sprint', 'Adapted', 'Bounded grade-level work with a visible plan, one current action, and calm re-entry.', ['Now → Next → Done', 'Autosave and resume', 'Support without focus scores'], 'teal') + moduleCard('layers', 'Predictable Path', 'Adapted', 'Stable lesson structure, explicit transition information, and learner-controlled sensory settings.', ['Preview Card', 'Literal instruction options', 'Declared sensory events'], 'green');

    return shell('<section class="hero" data-hero-scene><div class="hero-atmosphere" aria-hidden="true"><i></i><i></i><i></i></div><div class="content-wrap hero-grid"><div class="hero-copy-block"><p class="eyebrow"><span class="eyebrow-dot"></span>Active learning, one keystroke at a time</p><h1 data-animate-words>Learn by typing. Build knowledge that stays.</h1><p class="hero-copy">Type2Learn turns lessons into guided recall, correction, and practice - so progress means participation, not just pressing play.</p><div class="hero-actions">' + button('Try the learning demo', '#demo', 'primary', ' data-scroll-target="demo"') + button('Explore pathways', '/pathways/', 'secondary') + '</div><div class="trust-inline"><span>' + icon('check', true) + 'No speed-first ranking</span><span>' + icon('shield', true) + 'Private by default for young learners</span><span>' + icon('sliders', true) + 'Controls before assumptions</span></div><button class="scroll-cue" type="button" data-scroll-next aria-label="Scroll to the learning demonstration"><span class="scroll-mouse" aria-hidden="true"><i></i></span><span>See the learning loop</span></button></div><div class="hero-workspace reveal" data-delay="1" data-tilt><div class="workspace-top"><div class="workspace-brand">' + brand() + '<span>Guided lesson preview</span></div><div class="workspace-controls">' + status('Prototype', 'amber') + '</div></div><div class="workspace-surface"><div class="workspace-heading"><span class="workspace-number">01</span><div><h2>Explain what a variable stores</h2><p>One useful idea. One visible next action.</p></div></div><div class="now-next-done"><div class="task-state is-now"><span class="state-name">Now</span><strong>Complete the idea</strong><span>A variable stores a value that can...</span></div><div class="task-state"><span class="state-name">Next</span><strong>Check your wording</strong><span>See what the definition means.</span></div><div class="task-state"><span class="state-name">Done</span><strong>Apply it in code</strong><span>Create a score value.</span></div></div><div class="workspace-progress"><span>Learning path</span><div class="progress-bar"><i></i></div><span>1 of 3</span></div></div><div class="logo-source-frame"><img src="/assets/type2learn-logo.png" alt="Type2Learn T2L logo"></div></div></div></section><section class="section is-paper" id="demo"><div class="content-wrap"><div class="section-heading"><div class="section-heading-copy"><p class="section-kicker">Try the mechanism</p><h2 data-animate-words>A small interaction. A genuine learning moment.</h2><p>This local demo does not create an account or store your response. It demonstrates the first part of the Type2Learn loop.</p></div>' + status('Live on this page', 'green') + '</div><div class="demo-card reveal"><div class="demo-top"><div><p class="card-label">Step 3 of 7 · Type / Produce</p><h2>Complete the idea without looking.</h2></div>' + status('No timer', 'teal') + '</div><div class="demo-prompt"><strong>Recall cue</strong><p>A variable stores a value that can ...</p></div><form class="demo-form" id="typing-demo"><label class="sr-only" for="demo-answer">Your answer</label><input id="demo-answer" autocomplete="off" spellcheck="false" placeholder="Type your response here"><button class="button button-primary" type="submit">Check response' + icon('arrow', true) + '</button></form><p class="demo-feedback" id="demo-feedback" aria-live="polite">You can skip this preview at any time.</p><div class="demo-footer"><span>Meaningful variants are accepted where the objective allows them.</span><button class="text-link" id="skip-demo" type="button">Skip this demo</button></div><div class="controls-row"><span class="control-preview">' + icon('pause', true) + 'Reduced motion ready</span><span class="control-preview">' + icon('headphones', true) + 'Sound is off</span><span class="control-preview">' + icon('message', true) + 'Literal instructions available</span><span class="control-preview">' + icon('keyboard', true) + 'Keyboard first</span></div></div></div></section><section class="section is-cloud"><div class="content-wrap"><div class="section-heading"><div class="section-heading-copy"><p class="section-kicker">The learning loop</p><h2 data-animate-words>Watching can feel productive. Learning asks you to retrieve.</h2><p>Video, audio, examples, and support can all be valuable. Type2Learn adds the action layer: a clear objective, active response, correction, application, and return.</p></div></div><div class="learning-loop">' + loop + '</div></div></section><section class="section is-paper"><div class="content-wrap"><div class="section-heading"><div class="section-heading-copy"><p class="section-kicker">Three connected experiences</p><h2 data-animate-words>Support the work - not a label.</h2><p>Each experience keeps the academic target visible while offering private, configurable ways to enter, sustain, and complete meaningful learning.</p></div></div><div class="module-grid">' + modules + '</div></div></section><section class="section is-cloud"><div class="content-wrap"><div class="support-panel reveal"><p class="section-kicker">Private learning controls</p><h2>Different minds need different controls - not different expectations of dignity.</h2><p>Every learner can choose what helps them participate. Settings are private by default and are not a diagnosis.</p><div class="support-items"><div class="support-item"><strong>Motion and sound</strong><span>Reduced motion, no surprise animation, no autoplay audio.</span></div><div class="support-item"><strong>Reading and response</strong><span>Text size, spacing, read-aloud, captions, typing, speech, and more.</span></div><div class="support-item"><strong>Planning and pacing</strong><span>Visible steps, timer choice, pause, resume, and one next action.</span></div><div class="support-item"><strong>Help and clarity</strong><span>Literal instructions, examples, source highlights, and alternatives.</span></div></div></div></div></section><section class="section is-paper"><div class="content-wrap"><div class="section-heading"><div class="section-heading-copy"><p class="section-kicker">Built for the real people around learning</p><h2 data-animate-words>One learning tool. Clear routes for every audience.</h2></div></div><div class="audience-grid"><article class="audience-card reveal"><div class="audience-icon">' + icon('keyboard') + '</div><h3>Learners</h3><p>See what to do now, keep your work, choose your controls, and build proof of what you can do.</p><a class="card-footer" href="/learners/">See learner controls ' + icon('arrow', true) + '</a></article><article class="audience-card reveal" data-delay="1"><div class="audience-icon">' + icon('users') + '</div><h3>Families</h3><p>Understand the learning routine and privacy defaults without being asked to monitor every moment.</p><a class="card-footer" href="/families/">Explore family use ' + icon('arrow', true) + '</a></article><article class="audience-card reveal" data-delay="2"><div class="audience-icon">' + icon('school') + '</div><h3>Schools and professionals</h3><p>See meaningful learning evidence, support context, and clear boundaries - never a surveillance score.</p><a class="card-footer" href="/schools/">See the school approach ' + icon('arrow', true) + '</a></article></div></div></section><section class="section is-pale"><div class="content-wrap"><div class="evidence-grid"><article class="evidence-card reveal">' + status('Supported', 'green') + '<h3>Active practice</h3><p>Retrieval, feedback, and return shape the interaction model.</p></article><article class="evidence-card reveal" data-delay="1">' + status('Adapted', 'blue') + '<h3>Product translation</h3><p>Interface mechanics are designed hypotheses, not automatic proof.</p></article><article class="evidence-card reveal" data-delay="2">' + status('Community-informed', 'teal') + '<h3>Co-design</h3><p>Lived experience should change product decisions, not decorate a launch story.</p></article><article class="evidence-card reveal" data-delay="3">' + status('Planned', 'amber') + '<h3>Pilot and measurement</h3><p>Learning claims follow defined study, consent, and outcome evidence.</p></article></div></div></section><section class="section is-paper"><div class="content-wrap"><div class="section-heading"><div class="section-heading-copy"><p class="section-kicker">Common questions</p><h2 data-animate-words>Clear about what Type2Learn is - and what it is not.</h2></div><a class="button button-secondary" href="/community/#support">Get support' + icon('arrow', true) + '</a></div><div class="faq-list"><details class="faq-card reveal"><summary>Is Type2Learn a typing tutor?</summary><p>Typing is the active interaction layer. The goal is subject and skill learning through recall, feedback, correction, transfer, and review - not speed alone.</p></details><details class="faq-card reveal" data-delay="1"><summary>Does it diagnose or treat dyslexia, ADHD, or autism?</summary><p>No. Type2Learn offers learner-controlled supports and evidence-informed product ideas. It is an educational platform, not a clinical, diagnostic, or treatment service.</p></details><details class="faq-card reveal" data-delay="2"><summary>What does the platform collect?</summary><p>The product direction is data minimization: private learning work and settings, no targeted advertising, no learner-data sale, and no public-model training without explicit age-appropriate permission.</p></details><details class="faq-card reveal" data-delay="3"><summary>Are all of these experiences released?</summary><p>No. This public preview labels the status of concepts honestly. The first build focuses on one complete literacy-first learning route and a reusable active-learning engine.</p></details></div></div></section><section class="section is-cloud"><div class="content-wrap"><div class="quote-block reveal"><p>Made with learners. Led with accountability.</p><span>Meet the team, inspect the evidence approach, or explore the learning pathways.</span><div class="inline-actions">' + button('Meet the team', '/team/', 'secondary') + button('Explore pathways', '/pathways/', 'primary') + '</div></div></div></section>');
  };

  const howItWorks = () => shell(pageHero('How it works', 'A clear learning action, then a useful next step.', 'Type2Learn structures participation around small, meaningful objectives. The mechanism is designed to make learning visible without turning the learner into a timer, score, or data point.', 'Status', 'The active-learning demonstration on the home page is a local prototype. Broader learning routes are planned.') + '<section class="page-section"><div class="content-wrap"><h2>One loop, from first instruction to durable return.</h2><p>The product makes the task concrete, protects the learner’s work, and only recognizes completion when the academic objective has meaningful evidence.</p><div class="learning-loop">' + [['01', 'Choose', 'See the objective, prerequisite, duration range, and options.'], ['02', 'Understand', 'Read, hear, inspect, or ask for literal wording.'], ['03', 'Recall', 'Work from a cue before the complete model appears.'], ['04', 'Produce', 'Type, build, label, solve, or answer using an accessible route.'], ['05', 'Correct', 'Receive focused feedback and reconstruct after support.'], ['06', 'Apply', 'Use the idea in a new problem, sentence, project, or explanation.'], ['07', 'Return', 'Review later and resume calmly after interruption.']].map((item) => '<article class="loop-step reveal"><span class="loop-index">' + item[0] + '</span><h3>' + item[1] + '</h3><p>' + item[2] + '</p></article>').join('') + '</div></div></section><section class="page-section is-pale"><div class="content-wrap"><h2>Learning support that stays in proportion.</h2><p>Closed and structured responses can receive immediate feedback. Open responses may be queued for human review rather than treated as definitely right or wrong.</p><div class="page-grid">' + card('file', 'Protected progress', 'Autosave and precise resume preserve meaningful work.', ['Typing state and response', 'Hints, evidence, and scratch work', 'Pause and recovery path']) + card('sliders', 'Learner controls', 'Settings affect presentation, not the academic value of a learner.', ['Motion, sound, text, and spacing', 'Timer visibility and focus mode', 'Literal instructions and alternatives']) + card('shield', 'Useful integrity', 'Learning evidence is not invisible surveillance.', ['No webcam or gaze tracking', 'No public speed rank', 'Human review for consequential decisions']) + '</div></div></section><section class="page-section"><div class="content-wrap"><div class="callout"><h3>What “done” means</h3><p>A lesson ends when the learner has supplied the agreed learning evidence - such as a corrected response, explanation, transfer task, or project step. Waiting out a timer, tapping randomly, or exposing an answer is never the goal.</p></div></div></section><section class="page-section is-pale" id="evidence"><div class="content-wrap"><h2>Evidence informs the design. Learners test the decision.</h2><p>A learning principle can guide a product hypothesis, but it does not prove that every implementation works. Type2Learn separates what is supported, adapted, experimental, and community-informed.</p><div class="evidence-grid"><article class="evidence-card reveal">' + status('Supported', 'green') + '<h3>General principle</h3><p>Direct research informs the learning or accessibility principle.</p></article><article class="evidence-card reveal" data-delay="1">' + status('Adapted', 'blue') + '<h3>Product translation</h3><p>A design choice applies the principle and still needs testing.</p></article><article class="evidence-card reveal" data-delay="2">' + status('Experimental', 'violet') + '<h3>Measured hypothesis</h3><p>An uncertain interaction is evaluated, not marketed as fact.</p></article><article class="evidence-card reveal" data-delay="3">' + status('Community-informed', 'teal') + '<h3>Lived experience</h3><p>A decision changed after feedback from people affected by it.</p></article></div><div class="callout evidence-callout"><h3>A responsible pilot measures more than clicks.</h3><p>Future pilots must name the version, course, population, consent, governance, transfer, delayed retention, learner experience, limitations, and adverse experiences.</p></div></div></section>');

  const pathways = () => shell(pageHero('Pathways', 'A reusable learning engine. Purposeful routes.', 'The first delivery direction is one complete literacy-first, audio-capable course. Word Builder, Focus Sprint, and Predictable Path share a content and support foundation while serving different learning tasks.', 'Initial direction', 'Literacy-first MVP with structured content, local progress protection, and a reusable learning loop.') + '<section class="page-section"><div class="content-wrap"><h2>Three experiences, one dignity-first foundation.</h2><p>Academic level, presentation age, and learner support need are separate. A learner never has to accept a childish experience because a task needs more structure.</p><div class="module-grid">' + moduleCard('book', 'Word Builder', 'Adapted', 'Structured literacy and academic word learning.', ['Sound, pattern, and meaning', 'Type after support fades', 'Correction, transfer, and return'], 'blue') + moduleCard('path', 'Focus Sprint', 'Adapted', 'Bounded grade-level academic work with visible planning.', ['One objective', 'Now → Next → Done', 'Pause, break, and re-entry'], 'teal') + moduleCard('layers', 'Predictable Path', 'Adapted', 'Stable lesson delivery with fewer hidden expectations.', ['Preview before start', 'Visible path and change notices', 'Sensory and help controls'], 'green') + '</div></div></section><section class="page-section is-pale"><div class="content-wrap"><h2>The first pathway is small on purpose.</h2><p>A credible first release proves a complete learning loop rather than presenting a large but shallow library.</p><div class="path-grid"><article class="path-card reveal">' + status('First', 'green') + '<div class="path-icon">' + icon('headphones') + '</div><h3>Audio-led literacy route</h3><p>One complete, age-respectful course that lets a learner hear, recall, type, correct, apply, and return.</p></article><article class="path-card reveal" data-delay="1">' + status('Foundation', 'blue') + '<div class="path-icon">' + icon('keyboard') + '</div><h3>Reusable response engine</h3><p>Structured content, valid response options, clear feedback, and protected progress.</p></article><article class="path-card reveal" data-delay="2">' + status('Planned expansion', 'amber') + '<div class="path-icon">' + icon('layers') + '</div><h3>Subject and support routes</h3><p>Add content and module-specific mechanics after user testing and content review.</p></article></div></div></section>');

  const learners = () => shell(pageHero('For learners', 'Your learning. Your controls. Your next step.', 'Type2Learn is designed to make the work clearer without making assumptions about you. Choose what helps, keep your progress, and return without shame after a break.', 'Private by default', 'Settings are learner controls, not a diagnosis or a public score.') + '<section class="page-section"><div class="content-wrap"><h2>What the learner experience should answer.</h2><p>Every core screen should answer what am I doing now, what comes after it, what is finished, and what can I change if this presentation is not working.</p><div class="page-grid">' + card('path', 'Know the path', 'One current action is visually dominant. Next and Done remain visible but quieter.', ['Clear objective', 'Visible completion condition', 'No surprise steps']) + card('sliders', 'Choose supports', 'Change presentation without losing credit or academic access.', ['Text, spacing, contrast', 'Audio, motion, and sensory choices', 'Literal instructions and examples']) + card('pause', 'Pause and return', 'Work remains protected when you need to pause, exit, or come back later.', ['Exact resume state', 'No punitive streaks', 'Calm Return Win']) + '</div></div></section><section class="page-section is-pale"><div class="content-wrap"><div class="support-panel"><p class="section-kicker">A promise to learners</p><h2>We will not ask you to prove a label to get a clearer learning experience.</h2><p>Use the settings that help you participate. Your support choices should remain private by default and never reduce the value of what you know.</p><div class="inline-actions">' + button('Try the local demo', '/#demo', 'primary') + button('How the loop works', '/how-it-works/', 'secondary') + '</div></div></div></section>');

  const families = () => shell(pageHero('For families', 'Progress you can understand - without becoming a constant monitor.', 'Type2Learn is designed to reduce friction around getting started, staying with meaningful work, and returning after a gap. It does not replace human relationships, professional support, or family judgment.', 'Account views', 'Family reports and account controls are planned and must be implemented with clear permissions.') + '<section class="page-section"><div class="content-wrap"><h2>A supportive routine, not pressure at home.</h2><p>Family-facing information should focus on assigned learning, meaningful completion, due review, and one useful support routine - not a stream of private drafts or behavioural interpretation.</p><div class="page-grid">' + card('home', 'Open the saved work', 'A helpful prompt is to read the visible Now action and return to the saved step.', ['No forced long session', 'Calm re-entry', 'Visible learner control']) + card('shield', 'Private by default', 'Personal settings, reflections, and unfinished attempts are not treated as family surveillance.', ['Permission-aware sharing', 'No advertising profile', 'Age-appropriate defaults']) + card('message', 'Ask about the learning', 'The useful question is what was learned, corrected, or applied - not whether a learner was perfectly focused.', ['Respectful language', 'No deficit framing', 'Clear support route']) + '</div></div></section><section class="page-section is-pale"><div class="content-wrap"><div class="callout"><h3>Important boundary</h3><p>Type2Learn is an educational product. It does not diagnose, treat, or replace professional assessment, accommodations, medication, behavioural care, sleep, or human support.</p></div></div></section>');

  const schools = () => shell(pageHero('For schools', 'Meaningful evidence. Clear safeguards. No surveillance score.', 'The educator view is designed to distinguish academic work, support used, correction, completion, and review needs. It must never reduce a learner to a focus percentage or behavioural ranking.', 'School readiness', 'School deployment is planned and requires a separate agreement, role controls, privacy review, and accessibility readiness.') + '<section class="page-section"><div class="content-wrap"><h2>What authorized educators should be able to see.</h2><p>Reporting is useful only when it helps a person teach, adjust an assignment, or identify a valid reason for human review.</p><div class="page-grid">' + card('file', 'Academic evidence', 'Final work, selected evidence, strategy use, and transfer should be inspectable.', ['Objective-level progress', 'Final artifact where authorized', 'Teacher-reviewed response state']) + card('sliders', 'Support context', 'A report can show which support helped without making it a negative behaviour score.', ['Hint and correction level', 'Accessible input route', 'Paused or resumed state']) + card('shield', 'Clear boundaries', 'No live keystroke feed, webcam monitoring, gaze tracking, or classroom compliance score.', ['Role-based access', 'Auditability', 'Human override']) + '</div></div></section><section class="page-section is-pale"><div class="content-wrap"><h2>Deployment gates before school data.</h2><table class="plain-table"><thead><tr><th>Area</th><th>Required direction</th></tr></thead><tbody><tr><td>Data</td><td>School-controlled purpose, role boundaries, export/deletion paths, and a DPA or equivalent agreement.</td></tr><tr><td>Accessibility</td><td>WCAG 2.2 AA target plus task-level testing with assistive-technology users.</td></tr><tr><td>Safeguarding</td><td>Clear escalation, incident, and privacy process before broad student rollout.</td></tr><tr><td>Claims</td><td>Released curriculum and measured outcomes only; no unsupported efficacy statement.</td></tr></tbody></table></div></section>');

  const research = () => shell(pageHero('Research', 'Evidence informs the design. Learners test the decision.', 'Type2Learn translates established learning principles into product hypotheses, then tests the interaction with people. A principle supporting the general idea is not proof that every implementation works.', 'Claims policy', 'Type2Learn is educational, not clinical or diagnostic. Product outcomes require direct, transparent evaluation.') + '<section class="page-section"><div class="content-wrap"><h2>Use clear labels for what we know and what we are testing.</h2><p>These labels prevent an appealing feature from being mistaken for a universal or measured result.</p><div class="evidence-grid"><article class="evidence-card reveal">' + status('Supported', 'green') + '<h3>General principle</h3><p>A direct research basis informs the learning or accessibility principle.</p></article><article class="evidence-card reveal" data-delay="1">' + status('Adapted', 'blue') + '<h3>Product translation</h3><p>A design choice applies the principle and still needs testing.</p></article><article class="evidence-card reveal" data-delay="2">' + status('Experimental', 'violet') + '<h3>Hypothesis</h3><p>An uncertain interaction is being evaluated, not marketed as fact.</p></article><article class="evidence-card reveal" data-delay="3">' + status('Community-informed', 'teal') + '<h3>Lived experience</h3><p>A decision changed after feedback from people affected by it.</p></article></div></div></section><section class="page-section is-pale"><div class="content-wrap"><h2>What a responsible pilot would measure.</h2><p>Future pilots must name the version, course, population, dose, comparison, consent, governance, outcomes, limitations, and adverse experiences.</p><div class="page-grid">' + card('check', 'Learning', 'Trained performance, transfer, delayed retention, and connected-text or coursework use.', ['Not clicks or minutes alone', 'Separate correctness from support', 'Record content version']) + card('users', 'Experience', 'Learner understanding, dignity, cognitive load, confidence, and teacher usefulness.', ['Age fit', 'Accessibility barriers', 'Voluntary feedback']) + card('shield', 'Integrity', 'Publish limitations and null findings; keep privacy and safety review independent of marketing.', ['Consent and assent', 'Minimized data', 'No diagnosis claim']) + '</div></div></section>');

  const team = () => {
    const roles = [
      ['Learning research', 'Evidence review, pilot design, measurement quality, and honest claims.'],
      ['Accessibility', 'Task-level access, assistive technology testing, language, and recovery.'],
      ['Education engineering', 'Reliable learning systems, protected progress, privacy, and secure delivery.']
    ].map((role, index) => '<article class="collaborator-role reveal" data-delay="' + index + '"><span>0' + (index + 1) + '</span><h3>' + role[0] + '</h3><p>' + role[1] + '</p></article>').join('');
    return shell(pageHero('Team', 'Built with learners. Led with accountability.', 'Type2Learn brings product, research, accessibility, and engineering together around active learning that respects different minds and paths to confidence.', 'Profile standard', 'The founder portrait is supplied. Supporting collaborator photography is clearly labelled as illustrative until approved profiles are available.') + '<section class="page-section founder-section"><div class="content-wrap"><div class="founder-feature" data-team-feature><figure class="founder-portrait"><img src="/assets/team/founder-muhammad-taha.webp" alt="Muhammad Taha Bin Zaeem, founder of Type2Learn"></figure><div class="founder-copy"><p class="section-kicker">Founder · Product direction</p><h2>Muhammad Taha Bin Zaeem</h2><p class="founder-statement">“Learning technology should make the next meaningful action clearer without making a learner smaller.”</p><p>He leads Type2Learn’s vision, product direction, partnerships, and responsible growth—connecting the learning experience to clear standards for evidence, privacy, accessibility, and learner dignity.</p><div class="founder-responsibilities"><span>Vision & strategy</span><span>Learning experience</span><span>Responsible growth</span></div></div></div></div></section><section class="page-section is-pale collaborators-section"><div class="content-wrap"><div class="collaborator-intro"><p class="section-kicker">The team being built</p><h2>Multidisciplinary by design.</h2><p>No one discipline can decide what meaningful, accessible learning should feel like. Research, lived experience, education practice, accessibility, and engineering need equal authority at the table.</p></div><figure class="collaborator-visual" data-team-feature><img src="/assets/team/illustrative-collaborators.webp" alt="Illustrative group of learning research, accessibility, and education engineering collaborators"><figcaption>Illustrative collaborator photography · Temporary until approved team profiles are published.</figcaption></figure><div class="collaborator-roles">' + roles + '</div></div></section><section class="page-section"><div class="content-wrap"><div class="support-panel"><p class="section-kicker">Made with, not for</p><h2>Participation should change the product.</h2><p>Type2Learn should involve learners, educators, families, accessibility specialists, and professionals in identifying barriers, testing flows, reviewing language, and deciding what changes. Participation is voluntary, safe, accessible, and appropriately recognized.</p><div class="support-items"><div class="support-item"><strong>Listen</strong><span>Start from real barriers, routines, and goals.</span></div><div class="support-item"><strong>Prototype</strong><span>Test language, flow, sensory load, and usefulness.</span></div><div class="support-item"><strong>Measure</strong><span>Look beyond speed to comprehension and independence.</span></div><div class="support-item"><strong>Publish limits</strong><span>Separate evidence, inference, prototype, and plan.</span></div></div></div></div></section>');
  };

  const community = () => shell(pageHero('Community', 'Bring a question, insight, or challenge that makes learning better.', 'Type2Learn aims to grow through respectful collaboration with learners, families, educators, specialists, researchers, and contributors. No one needs a public social profile to use ordinary learner features.', 'Community channel', 'A monitored feedback and contribution channel is planned. Public social and code links remain unavailable until governance is ready.') + '<section class="page-section"><div class="content-wrap"><h2>Different expertise, one standard: respect the learner.</h2><p>Collaboration must improve product decisions rather than become a testimonial or a request to disclose sensitive information.</p><div class="page-grid">' + card('users', 'Lived experience', 'Feedback can identify barriers, test controls, and challenge assumptions.', ['Voluntary participation', 'No required public attribution', 'No pressure to disclose diagnoses']) + card('school', 'Education practice', 'Teachers and school leaders can test curricular fit, clarity, and daily workflow.', ['Clear implementation questions', 'Age-respectful content', 'No claims without permission']) + card('flask', 'Research and accessibility', 'Specialists can review evidence, language, measurement, access, and safety.', ['Appropriate scope', 'Compensate where possible', 'Traceable decisions']) + '</div></div></section><section class="page-section is-pale"><div class="content-wrap"><div class="status-banner">' + icon('message') + '<div><strong>Community channel planned</strong><p>Contact and contribution routes will appear only after they are monitored, privacy-reviewed, accessible, and governed. The site does not currently request learner feedback or personal data.</p></div></div></div></section><section class="page-section" id="support"><div class="content-wrap"><h2>Help should end in a calm next step.</h2><p>Support stays plain-language, accessible, and connected to the actual product state. It asks only for the information needed to recover from a barrier.</p><div class="page-grid">' + card('home', 'Getting started', 'Choose a path, adjust controls, understand the first objective, and begin safely.', ['What the demo does', 'Where settings live', 'How to reset a preview']) + card('sliders', 'Controls and access', 'Use motion, sound, text, spacing, focus, literal-instruction, and input options.', ['Keyboard help', 'Pause and resume', 'Accessible recovery']) + card('shield', 'Privacy and escalation', 'Know when to involve a parent, school, or accountable support route without oversharing.', ['Privacy request boundary', 'Accessibility barrier route', 'School support ownership']) + '</div><div class="status-banner support-status">' + icon('message') + '<div><strong>Monitored support channel pending configuration</strong><p>This preview intentionally has no contact form. A live support route requires accountable ownership, response targets, privacy review, accessibility checks, and escalation handling.</p></div></div></div></section>');

  const trust = () => shell(pageHero('Trust', 'One clear place for access, privacy, security, and terms.', 'Trust information should be easy to find and consistent with the service that actually exists. This consolidated page separates current preview behaviour from requirements that still need implementation or legal review.', 'Publication status', 'Product requirements are shown transparently. Final legal notices and monitored reporting routes remain pending review.') + '<section class="page-section trust-overview"><div class="content-wrap"><h2>Four commitments. One accountable standard.</h2><p>Use this page to understand how Type2Learn approaches access, data, protection, and service boundaries without searching across several thin policy pages.</p><nav class="trust-index" aria-label="Trust page sections"><a href="#accessibility"><span>01</span>Accessibility</a><a href="#privacy"><span>02</span>Privacy</a><a href="#security"><span>03</span>Security</a><a href="#terms"><span>04</span>Terms</a></nav></div></section><section class="page-section is-pale trust-section" id="accessibility"><div class="content-wrap"><p class="section-kicker">01 · Accessibility</p><h2>Access is a requirement, not an add-on.</h2><p>Type2Learn targets WCAG 2.2 AA and task-level testing with people who use assistive technology. Keyboard operation, useful zoom and reflow, understandable status, and reduced-motion alternatives are product requirements.</p><div class="page-grid">' + card('keyboard', 'Operate', 'Primary tasks work by keyboard with clear focus, logical order, and touch-safe targets.', ['No mouse-only action', 'No precision drag requirement', 'Named controls and status']) + card('eye', 'Perceive', 'Content remains understandable with text controls, contrast, captions, and no color-only state.', ['Readable at zoom', 'No essential motion', 'Sound independent']) + card('message', 'Understand', 'Instructions, errors, completion, and recovery remain clear and programmatically exposed.', ['Literal wording option', 'Visible completion condition', 'Useful recovery messages']) + '</div></div></section><section class="page-section trust-section" id="privacy"><div class="content-wrap"><p class="section-kicker">02 · Privacy</p><h2>Collect less. Explain it clearly.</h2><p>The intended product posture is data minimization, private learner work, purpose-limited progress records, no targeted advertising, and no sale of learner data. This public preview loads Cloudflare Web Analytics; the final privacy notice must document the deployed analytics configuration and actual data flow.</p><div class="page-grid">' + card('shield', 'Data boundaries', 'Collect only what is needed to run learning, save progress, secure accounts, and provide chosen controls.', ['Private by default', 'No diagnosis inference', 'Documented retention']) + card('lock', 'Young learner safeguards', 'Consent, school authority, role access, export, and deletion must match launch geography and service behaviour.', ['Age-appropriate defaults', 'Permission-aware sharing', 'No marketing profile']) + card('school', 'School controls', 'School deployment requires a defined educational purpose, access boundaries, and an appropriate data agreement.', ['School-controlled records', 'Export and deletion paths', 'Clear incident process']) + '</div></div></section><section class="page-section is-pale trust-section" id="security"><div class="content-wrap"><p class="section-kicker">03 · Security</p><h2>Protect learning with reviewable controls.</h2><p>The intended posture is least privilege, secure engineering, safe logging, dependency review, recovery planning, and transparent incident handling. These are requirements—not certification claims.</p><div class="page-grid">' + card('lock', 'Access control', 'Role boundaries, unique accounts, privileged access protection, audit history, and prompt offboarding.', ['Teacher and school separation', 'Least privilege', 'Human review']) + card('shield', 'Secure delivery', 'Encrypted transport and storage, protected secrets, dependency monitoring, backups, and recovery.', ['Vulnerability handling', 'Safe operational logging', 'Incident exercises']) + card('file', 'Transparent response', 'Contain, investigate, preserve evidence, assess risk, and communicate appropriately.', ['Documented ownership', 'Clear escalation', 'No silent data practice']) + '</div><div class="status-banner support-status">' + icon('lock') + '<div><strong>Security disclosure route pending governance</strong><p>A monitored security contact should be published only after response ownership and handling safeguards are ready.</p></div></div></div></section><section class="page-section trust-section" id="terms"><div class="content-wrap"><p class="section-kicker">04 · Terms</p><h2>Terms must match the service that launches.</h2><p>Final terms need to reflect the real legal entity, markets, accounts, school authority, billing, support, disputes, and released features. Current statements are product direction, not final legal advice.</p><div class="page-grid">' + card('file', 'Honest service description', 'Describe released, beta, experimental, and planned features accurately.', ['No guarantee of future features', 'No false accreditation', 'No clinical positioning']) + card('users', 'Young learner boundaries', 'Eligibility, consent, public sharing, accounts, and school authority must remain age-appropriate.', ['Private defaults for minors', 'Accessible appeal path', 'No required social profile']) + card('shield', 'Counsel-required review', 'Payments, refunds, liability, governing law, and school terms need market-specific approval.', ['Entity and notice details', 'Update and acceptance process', 'Separate school agreements']) + '</div><div class="callout evidence-callout"><h3>Preview boundary</h3><p>This site does not create a learner account or transmit the local demo response. Product and policy language must be updated whenever that behaviour changes.</p></div></div></section>');

  const legalPage = (kind) => {
    const isPrivacy = kind === 'privacy';
    const title = isPrivacy ? 'Privacy should be clear, minimal, and child-aware.' : 'Terms should match the service that actually exists.';
    const copy = isPrivacy ? 'This page summarizes the product’s intended privacy posture. The supplied Privacy Policy is a detailed draft and cannot become an operative policy until legal, technical, and operational details are confirmed.' : 'This page identifies the intended terms posture. The supplied Terms of Service are a detailed draft and cannot become operative terms until the launch service, legal entity, markets, payment model, and school agreements are confirmed.';
    const cards = isPrivacy ? card('shield', 'Data minimization', 'Collect the information needed to run learning, save progress, secure accounts, and support chosen controls.', ['No sale or data brokerage', 'No targeted advertising', 'Private learner work by default']) + card('lock', 'Learner data boundaries', 'Student content and telemetry must not become a public-model training product without separate age-appropriate permission.', ['No diagnostic inference', 'Purpose-limited analytics', 'Role-based access']) + card('school', 'School controls', 'School deployment requires an agreement, defined purpose, access boundaries, export, retention, and deletion controls.', ['School-controlled records', 'DPA or equivalent', 'Clear incident process']) : card('file', 'Honest service description', 'Describe only released, beta, experimental, or planned features accurately.', ['No guarantee of future features', 'No false accreditation', 'No clinical positioning']) + card('users', 'Young learner safeguards', 'Eligibility, consent, public sharing, accounts, and school authority must match launch geography and service behaviour.', ['Parent/guardian or school path', 'Private defaults for minors', 'Accessible appeal and support']) + card('shield', 'Counsel-required terms', 'Payments, refunds, disputes, governing law, liability, and school terms need market-specific legal approval.', ['Entity and notice details', 'School agreement controls', 'Update and acceptance process']);
    const details = isPrivacy ? '<section class="page-section is-pale"><div class="content-wrap"><h2>Intended data boundaries.</h2><p>These are implementation commitments to verify before launch, not a substitute for the final privacy notice.</p><div class="page-grid">' + card('users', 'Account and role data', 'Use only the identity and role information needed to provide an authorized account.', ['Age and consent where required', 'School and class boundaries', 'Private account defaults']) + card('file', 'Learning and progress', 'Keep lesson attempts, corrections, review, and progress in the educational context that needs them.', ['Purpose-limited records', 'Versioned learning content', 'Export and deletion paths']) + card('keyboard', 'Typed work and telemetry', 'Treat raw input, timing, correction, and pause information as potentially sensitive.', ['No marketing profiling', 'Documented retention', 'No diagnosis inference']) + '</div></div></section>' : '<section class="page-section is-pale"><div class="content-wrap"><h2>Terms direction for the real service.</h2><p>These points guide product implementation; the final terms must match actual account, billing, school, and legal operations.</p><div class="page-grid">' + card('check', 'Learning integrity', 'Learners can use valid assistive technology, but should not automate or impersonate academic participation.', ['Accommodation-aware', 'No hidden high-stakes flag', 'Human review path']) + card('spark', 'AI and support', 'AI can assist practice but can be wrong; it does not replace learner, teacher, or professional judgment.', ['No diagnosis', 'Constrained outputs', 'Visible uncertainty']) + card('users', 'Public sharing', 'Profiles, certificates, and social sharing remain optional, private/limited by default for minors, and age-appropriate.', ['No required social account', 'Consent-aware visibility', 'Accurate certificate language']) + '</div></div></section>';
    return shell(pageHero(isPrivacy ? 'Privacy' : 'Terms', title, copy, 'Publication status', (isPrivacy ? 'Privacy Policy draft' : 'Terms of Service draft') + ' — pending legal review.') + '<section class="page-section"><div class="content-wrap"><div class="status-banner">' + icon('file') + '<div><strong>Draft, not final legal advice</strong><p>Before publication, confirm the registered entity, address, launch markets, vendors, hosting regions, consent, retention, billing, dispute process, and school terms with qualified counsel.</p></div></div><div class="page-grid" style="margin-top:32px">' + cards + '</div></div></section>' + details + '<section class="page-section"><div class="content-wrap"><h2>What this product preview does not do.</h2><p>It does not collect a learning response, create a child account, run advertising pixels, record sessions, or offer a live school deployment. Public policy pages must remain accurate as the product changes.</p></div></section>');
  };

  const accessibility = () => shell(pageHero('Accessibility', 'Access is a requirement, not an add-on.', 'Type2Learn aims for WCAG 2.2 AA and task-level testing with people who use assistive technology. The learning experience must remain useful across different input, reading, sensory, and communication needs.', 'Accessibility route', 'A monitored accessibility feedback path is planned; this preview does not collect reports.') + '<section class="page-section"><div class="content-wrap"><h2>Core accessibility commitments.</h2><p>Each experience should work as a whole, not just pass a visual review.</p><div class="page-grid">' + card('keyboard', 'Operate', 'All primary tasks work by keyboard with clear focus and logical order.', ['No mouse-only action', 'No precision drag requirement', 'Touch-safe targets']) + card('eye', 'Perceive', 'Content remains understandable with text controls, contrast, captions, transcripts, and no color-only state.', ['Readable at zoom', 'No essential motion', 'Sound independent']) + card('message', 'Understand', 'Instructions, errors, completion, and recovery are clear and programmatically exposed.', ['Literal wording option', 'Visible completion condition', 'Useful status messages']) + '</div></div></section><section class="page-section is-pale"><div class="content-wrap"><h2>How we plan to test.</h2><table class="plain-table"><thead><tr><th>Context</th><th>Required check</th></tr></thead><tbody><tr><td>Keyboard and screen reader</td><td>Interactive content, forms, menus, status, and error recovery are operable and named.</td></tr><tr><td>Zoom and mobile</td><td>320 px layout, 200% text zoom, 400% reflow, touch targets, and reading order remain useful.</td></tr><tr><td>Motion and sensory settings</td><td>Reduced motion removes decorative movement; no essential information relies on animation or autoplay audio.</td></tr><tr><td>Learner testing</td><td>Feedback identifies barriers and informs changes before making conformance or outcome claims.</td></tr></tbody></table></div></section>');

  const security = () => shell(pageHero('Security', 'Protect learning with clear, reviewable controls.', 'Type2Learn’s intended security posture is built on least privilege, secure engineering, privacy-aware design, and clear recovery. It does not claim a certification or security outcome that has not been independently verified.', 'Security reporting', 'A dedicated, monitored security disclosure route is planned before public production use.') + '<section class="page-section"><div class="content-wrap"><h2>Security principles for a learning platform.</h2><p>The details must match the actual architecture and vendors before launch. These are product requirements, not a certification claim.</p><div class="page-grid">' + card('lock', 'Access control', 'Role boundaries, least privilege, unique accounts, and MFA for privileged access.', ['Teacher and school separation', 'Audit history', 'Prompt offboarding']) + card('shield', 'Secure delivery', 'Encrypted transport and storage, dependency monitoring, safe logging, backups, and recovery.', ['Secure secrets', 'Vulnerability handling', 'Incident exercises']) + card('file', 'Transparent response', 'Contain, investigate, preserve evidence, assess risk, and communicate appropriately when an incident occurs.', ['Documented ownership', 'Clear escalation', 'No silent data practice']) + '</div></div></section><section class="page-section is-pale"><div class="content-wrap"><div class="status-banner">' + icon('lock') + '<div><strong>Security disclosure route pending governance</strong><p>Do not send sensitive reports through an unmonitored public form. A security contact and disclosure policy should be published only once ownership, response process, and handling safeguards are ready.</p></div></div></div></section>');

  const support = () => shell(pageHero('Support', 'Clear help, clear boundaries, calm next steps.', 'The support experience should help a learner or adult recover from a barrier without exposing private work unnecessarily or turning routine support into surveillance.', 'Support route', 'support@type21earn.tech is proposed, but must be configured and monitored before it is treated as a live support channel.') + '<section class="page-section"><div class="content-wrap"><h2>Help topics for the first release.</h2><p>Support should be plain-language, accessible, and connected to actual product states.</p><div class="page-grid">' + card('home', 'Getting started', 'Choose a path, adjust controls, understand the first objective, and begin safely.', ['What the demo does', 'Where settings live', 'How to reset a preview']) + card('sliders', 'Controls and access', 'Use motion, sound, text, spacing, timer, focus, literal-instruction, and input options.', ['Keyboard help', 'Pause and resume', 'Accessible recovery']) + card('shield', 'Privacy and escalation', 'Know when to ask a parent, school, or support route without sharing unnecessary personal information.', ['Privacy request boundary', 'Accessibility barrier route', 'School support ownership']) + '</div></div></section><section class="page-section is-pale"><div class="content-wrap"><div class="status-banner">' + icon('message') + '<div><strong>Monitored support channel pending configuration</strong><p>This preview intentionally has no contact form. A real support route needs accountable ownership, response targets, privacy review, accessibility checks, and escalation handling.</p></div></div></div></section>');

  const pageMap = {
    home: landing,
    "how-it-works": howItWorks,
    pathways,
    learners,
    families,
    schools,
    team,
    community,
    trust,
    research: howItWorks,
    privacy: trust,
    terms: trust,
    accessibility: trust,
    security: trust,
    support: community
  };

  const root = document.getElementById('app');
  root.innerHTML = (pageMap[route] || landing)();

  const pageTitles = {
    home: 'Type2Learn — Learn by typing',
    "how-it-works": 'How Type2Learn works',
    pathways: 'Type2Learn pathways',
    learners: 'For learners — Type2Learn',
    families: 'For families — Type2Learn',
    schools: 'For schools — Type2Learn',
    team: 'Team — Type2Learn',
    community: 'Community and help — Type2Learn',
    trust: 'Trust — Type2Learn',
    research: 'How Type2Learn works',
    privacy: 'Trust — Type2Learn',
    terms: 'Trust — Type2Learn',
    accessibility: 'Trust — Type2Learn',
    security: 'Trust — Type2Learn',
    support: 'Community and help — Type2Learn'
  };
  document.title = pageTitles[route] || pageTitles.home;

  const scrollStory = () => {
    const scenes = [
      ['01', 'Encounter', 'Meet one clear idea.', 'Read or hear a bounded idea with the objective and next action visible.', '/assets/story/learner-encounter.webp', 'A Pakistani secondary-school learner typing at a home study desk.'],
      ['02', 'Recall', 'Recall before the reveal.', 'Use a cue, pause, and bring the idea back from memory before the full model appears.', '/assets/story/learner-recall.webp', 'The same learner pausing to recall an idea beside a laptop and notebook.'],
      ['03', 'Produce', 'Make your thinking visible.', 'Type a useful response in your own words so understanding becomes something you can work with.', '/assets/story/learner-produce.webp', 'The learner actively typing a response while working through the lesson.'],
      ['04', 'Correct & apply', 'Improve it, then use it.', 'Compare, correct without shame, and apply the stronger idea in a meaningful task.', '/assets/story/learner-apply.webp', 'The same learner applying the idea and typing with quiet confidence.'],
      ['05', 'Return', 'Come back. Keep what you earned.', 'Revisit the idea later. Durable progress follows learning evidence and return, not speed.', '/assets/story/learner-return.webp', 'The learner returning to a familiar idea in a calm later study session.']
    ];

    return '<section class="scroll-story" id="learning-story" aria-labelledby="story-title"><div class="story-stage"><canvas class="story-canvas" id="story-canvas" aria-hidden="true"></canvas><div class="story-scenes">' + scenes.map((scene, index) => '<figure class="story-scene' + (index === 0 ? ' is-active' : '') + '" data-story-scene="' + index + '"><img src="' + scene[4] + '" alt="' + scene[5] + '"></figure>').join('') + '</div><div class="story-shade" aria-hidden="true"></div><div class="story-ui content-wrap"><div class="story-topline"><p><span>Type2Learn</span> · Learning route</p><div class="story-counter" aria-live="polite"><span id="story-current">01</span><i></i><span>' + String(scenes.length).padStart(2, '0') + '</span></div></div><div class="story-copy"><p class="story-kicker">Scroll-controlled learning story</p><h2 id="story-title">Learning is something you do.</h2><div class="story-steps">' + scenes.map((scene, index) => '<article class="story-step' + (index === 0 ? ' is-active' : '') + '" data-story-step="' + index + '"><span>' + scene[0] + ' · ' + scene[1] + '</span><h3>' + scene[2] + '</h3><p>' + scene[3] + '</p></article>').join('') + '</div><a class="button button-primary story-action" href="#demo" data-scroll-target="demo">Try the learning demo' + icon('arrow', true) + '</a></div><div class="story-route" aria-hidden="true">' + scenes.map((scene) => '<span>' + scene[1] + '</span>').join('') + '<i id="story-route-progress"></i></div></div></div></section>';
  };

  const enhancePage = () => {
    document.body.classList.add('route-' + route);

    if (route === 'home') {
      const hero = document.querySelector('#main-content > .hero');
      if (hero) hero.insertAdjacentHTML('afterend', scrollStory());

      const supportPanel = document.querySelector('.support-panel');
      const supportHeading = supportPanel && supportPanel.querySelector('h2');
      if (supportPanel && supportHeading) {
        supportPanel.classList.add('anaphora-panel');
        supportPanel.closest('section').classList.add('anaphora-section');
        supportHeading.className = 'anaphora-heading';
        supportHeading.setAttribute('aria-label', 'Different minds need different controls — not different expectations of dignity.');
        supportHeading.innerHTML = '<span class="anaphora-drop" aria-hidden="true">D</span><span class="anaphora-lines" aria-hidden="true"><span>ifferent minds need</span><span>ifferent controls — not</span><span>ifferent expectations of dignity.</span></span>';
      }
    }

    const sections = Array.from(document.querySelectorAll('#main-content > section:not(.builder-credit)'));
    sections.forEach((section, index) => {
      section.dataset.sectionIndex = String(index + 1).padStart(2, '0');
      const wrap = section.querySelector(':scope > .content-wrap');
      if (wrap && !section.matches('.hero, .page-hero, .site-cta')) {
        const marker = document.createElement('span');
        marker.className = 'section-marker';
        marker.setAttribute('aria-hidden', 'true');
        marker.textContent = section.dataset.sectionIndex;
        wrap.prepend(marker);
      }
    });

    document.querySelectorAll('.page-section > .content-wrap > h2').forEach((heading) => {
      heading.dataset.animateWords = '';
      heading.classList.add('section-title');
    });

    document.querySelectorAll('.page-section > .content-wrap > p, .plain-table, .status-banner, .callout, .quote-block').forEach((node) => {
      node.classList.add('reveal');
    });

    document.querySelectorAll('.learning-loop').forEach((loop) => {
      loop.dataset.workflow = '';
      loop.style.setProperty('--loop-progress', '0');
      loop.querySelectorAll('.loop-step').forEach((step, index) => {
        step.dataset.stepIndex = String(index);
      });
    });
  };

  const animateWords = () => {
    document.querySelectorAll('[data-animate-words]').forEach((element) => {
      const original = element.textContent.trim();
      if (!original || element.dataset.wordsReady) return;
      element.dataset.wordsReady = 'true';
      element.setAttribute('aria-label', original);
      element.innerHTML = original.split(/\s+/).map((word, index) => '<span aria-hidden="true" class="word-unit" style="--word-index:' + index + '">' + word + '</span>').join(' ');
    });
  };

  const setupReveals = () => {
    const nodes = Array.from(document.querySelectorAll('.reveal'));
    if (document.body.classList.contains('motion-off') || !('IntersectionObserver' in window)) {
      nodes.forEach((node) => node.classList.add('is-visible'));
      document.querySelectorAll('[data-animate-words]').forEach((node) => node.classList.add('is-inview'));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    nodes.forEach((node) => {
      if (node.getBoundingClientRect().top < window.innerHeight * .94) node.classList.add('is-visible');
      else observer.observe(node);
    });

    const headingObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-inview');
          headingObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.45, rootMargin: '0px 0px -8% 0px' });
    document.querySelectorAll('[data-animate-words]').forEach((node) => headingObserver.observe(node));
  };

  const setMotion = (off, persist = true) => {
    document.body.classList.toggle('motion-off', off);
    const toggle = document.getElementById('motion-toggle');
    if (toggle) {
      toggle.setAttribute('aria-pressed', String(off));
      toggle.setAttribute('aria-label', off ? 'Turn on decorative motion' : 'Turn off decorative motion');
      toggle.innerHTML = icon(off ? 'spark' : 'pause', true) + '<span class="motion-switch-label">Motion</span><span class="motion-switch-state">' + (off ? 'Off' : 'On') + '</span>';
    }
    if (off) {
      document.querySelectorAll('.reveal').forEach((node) => node.classList.add('is-visible'));
      document.querySelectorAll('[data-animate-words]').forEach((node) => node.classList.add('is-inview'));
    }
    if (persist) {
      try { window.localStorage.setItem('type2learn-motion', off ? 'off' : 'on'); } catch (error) { /* Settings remain available for this page. */ }
    }
    window.dispatchEvent(new CustomEvent('type2learn:motion', { detail: { off } }));
  };

  const setupScrollExperience = () => {
    const progress = document.getElementById('scroll-progress');
    const header = document.querySelector('.site-header');
    let framePending = false;

    const updateScroll = () => {
      const available = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
      const ratio = Math.min(Math.max(window.scrollY / available, 0), 1);
      if (progress) progress.style.transform = 'scaleX(' + ratio + ')';
      if (header) header.classList.toggle('is-scrolled', window.scrollY > 12);
      document.documentElement.style.setProperty('--page-scroll', ratio.toFixed(4));
      framePending = false;
    };

    window.addEventListener('scroll', () => {
      if (!framePending) {
        framePending = true;
        window.requestAnimationFrame(updateScroll);
      }
    }, { passive: true });
    updateScroll();

    document.querySelectorAll('[data-scroll-next]').forEach((button) => {
      button.addEventListener('click', () => {
        const section = button.closest('section');
        const next = section && section.nextElementSibling;
        if (next) next.scrollIntoView({ behavior: document.body.classList.contains('motion-off') ? 'auto' : 'smooth', block: 'start' });
      });
    });

    if ('IntersectionObserver' in window) {
      document.querySelectorAll('[data-workflow]').forEach((loop) => {
        const steps = Array.from(loop.querySelectorAll('.loop-step'));
        const stepObserver = new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const activeIndex = Number(entry.target.dataset.stepIndex || 0);
            steps.forEach((step, index) => {
              step.classList.toggle('is-current', index === activeIndex);
              step.classList.toggle('is-complete', index < activeIndex);
            });
            const progressValue = steps.length > 1 ? activeIndex / (steps.length - 1) : 1;
            loop.style.setProperty('--loop-progress', progressValue.toFixed(3));
          });
        }, { threshold: 0.6, rootMargin: '-18% 0px -32% 0px' });
        steps.forEach((step) => stepObserver.observe(step));
      });
    }
  };

  const setupPointerMotion = () => {
    if (!window.matchMedia('(pointer: fine)').matches) return;
    document.querySelectorAll('[data-hero-scene]').forEach((scene) => {
      scene.addEventListener('pointermove', (event) => {
        if (document.body.classList.contains('motion-off')) return;
        const rect = scene.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
        const y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
        scene.style.setProperty('--pointer-x', x.toFixed(3));
        scene.style.setProperty('--pointer-y', y.toFixed(3));
      });
      scene.addEventListener('pointerleave', () => {
        scene.style.setProperty('--pointer-x', '0');
        scene.style.setProperty('--pointer-y', '0');
      });
    });
  };

  const setupControls = () => {
    const menu = document.getElementById('menu-toggle');
    const mobileNav = document.getElementById('mobile-nav');
    if (menu && mobileNav) {
      menu.addEventListener('click', () => {
        const open = menu.getAttribute('aria-expanded') === 'true';
        menu.setAttribute('aria-expanded', String(!open));
        menu.setAttribute('aria-label', open ? 'Open menu' : 'Close menu');
        mobileNav.classList.toggle('is-open', !open);
      });
    }

    const motion = document.getElementById('motion-toggle');
    if (motion) motion.addEventListener('click', () => setMotion(!document.body.classList.contains('motion-off')));

    document.querySelectorAll('[data-scroll-target]').forEach((link) => {
      link.addEventListener('click', (event) => {
        const target = document.getElementById(link.dataset.scrollTarget);
        if (target) {
          event.preventDefault();
          target.scrollIntoView({ behavior: document.body.classList.contains('motion-off') ? 'auto' : 'smooth', block: 'start' });
          const input = target.querySelector('input');
          if (input) window.setTimeout(() => input.focus(), 450);
        }
      });
    });

    const demo = document.getElementById('typing-demo');
    const feedback = document.getElementById('demo-feedback');
    if (demo && feedback) {
      demo.addEventListener('submit', (event) => {
        event.preventDefault();
        const input = document.getElementById('demo-answer');
        const answer = input.value.trim().toLowerCase().replace(/[.!?]/g, '');
        const accepted = ['a value that can change', 'a value that changes', 'value that changes', 'a changing value'];
        if (accepted.includes(answer) || (answer.includes('value') && answer.includes('chang'))) {
          feedback.className = 'demo-feedback is-correct';
          feedback.textContent = 'Good correction-ready response. Next, the lesson would ask you to apply the idea in code.';
        } else if (!answer) {
          feedback.className = 'demo-feedback is-needs-work';
          feedback.textContent = 'Try one short phrase. The cue is: “A variable stores a value that can ...”';
        } else {
          feedback.className = 'demo-feedback is-needs-work';
          feedback.textContent = 'You have started the idea. Revisit the cue and explain what can happen to the stored value.';
        }
      });
      const skip = document.getElementById('skip-demo');
      if (skip) skip.addEventListener('click', () => {
        feedback.className = 'demo-feedback';
        feedback.textContent = 'Demo skipped. You can return whenever you want; no response was kept.';
      });
    }
  };

  enhancePage();
  let savedMotion = null;
  try { savedMotion = window.localStorage.getItem('type2learn-motion'); } catch (error) { /* Use the system preference. */ }
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  setMotion(savedMotion ? savedMotion === 'off' : prefersReducedMotion, false);
  animateWords();
  setupReveals();
  setupControls();
  setupScrollExperience();
  setupPointerMotion();
  import('/experience.js').catch(() => document.body.classList.add('experience-fallback'));
})();
