const posts = [
  {
    id: '01',
    slug: 'the-promise',
    template: 'split',
    status: 'OUR VISION',
    title: 'Learn by typing.\nBuild knowledge\nthat stays.',
    body: 'Meet one idea. Recall it. Type or produce it. Check it. Correct it. Use it. Return to it.',
    emphasis: 'Because learning is something you do.',
    useCase: 'For neurodivergent learners who need active practice, controllable supports, and a route back to the idea.',
    question: 'What helps an idea stay with you?',
    image: '../../assets/story/hero-learner.webp',
    position: '58% center'
  },
  {
    id: '02',
    slug: 'active-not-passive',
    template: 'top',
    status: 'OUR METHOD',
    title: 'Pressing play is not\nthe same as practising.',
    body: 'Video, audio and examples can help. Type2Learn adds the action layer: a clear objective, an active response, useful feedback, application and return.',
    useCase: 'For learners who benefit from one bounded action instead of passive, unstructured content.',
    question: 'Where does your learning become active?',
    image: '../../assets/pages/how-learning.webp',
    position: '52% 40%'
  },
  {
    id: '03',
    slug: 'beyond-speed',
    template: 'split',
    status: 'DESIGN PRINCIPLE',
    title: 'Fast isn’t the same\nas learned.',
    body: 'Type2Learn is not a public typing-speed race. Progress should mean a meaningful response, correction and learning evidence—not merely time, clicks, points or speed.',
    useCase: 'For neurodivergent learners whose understanding should never be reduced to typing speed.',
    question: 'What should progress measure?',
    image: '../../assets/auth/login-library.webp',
    position: '64% center'
  },
  {
    id: '04',
    slug: 'dignity-and-control',
    template: 'split',
    status: 'ACCESS & DIGNITY',
    title: 'Different minds need\ndifferent controls—\nnot different expectations\nof dignity.',
    body: 'Motion. Sound. Spacing. Pacing. Literal instructions. Response options. Chosen by the learner. Private by default.',
    useCase: 'For learners who need motion, sound, spacing, pacing, or instruction controls without lowered expectations.',
    question: 'What control would have helped you?',
    image: './generated/learner-controls.png',
    position: '60% center',
    generated: true
  },
  {
    id: '05',
    slug: 'support-without-a-label',
    template: 'top',
    status: 'LEARNER CONTROL',
    title: 'Support should not\nrequire a label.',
    body: 'Learners should be able to choose what helps them participate without disclosing a diagnosis. Settings are controls—not clinical conclusions.',
    useCase: 'For anyone who needs support without disclosing a diagnosis or accepting a label.',
    question: 'What support should everyone be able to choose?',
    image: '../../assets/pages/learners-access.webp',
    position: '54% center'
  },
  {
    id: '06',
    slug: 'one-clear-next-action',
    template: 'split',
    status: 'PRODUCT DIRECTION',
    title: 'One clear\nnext action.',
    body: 'Make the objective visible. Show what is happening now, what comes next, and how to pause without losing the work.',
    useCase: 'For learners who face initiation or working-memory barriers and need one visible next step.',
    question: 'What makes starting easier for you?',
    image: '../../assets/auth/login-home-study.webp',
    position: '64% center'
  },
  {
    id: '07',
    slug: 'dignified-correction',
    template: 'top',
    status: 'FEEDBACK PRINCIPLE',
    title: 'Correction should make\nthe idea stronger—\nnot the learner smaller.',
    body: 'Compare. Explain the mismatch. Rebuild. Try again. Feedback should protect dignity and keep the learner in the work.',
    useCase: 'For learners who need specific, non-shaming feedback and a real chance to reconstruct the answer.',
    question: 'What did useful feedback feel like?',
    image: './generated/dignified-feedback.png',
    position: '58% 58%',
    generated: true
  },
  {
    id: '08',
    slug: 'calm-return',
    template: 'split',
    status: 'PRODUCT DIRECTION',
    title: 'Paused doesn’t\nmean lost.',
    body: 'The response, cursor, hints, settings and next step should still be there after a pause, refresh, connection loss or time away.',
    useCase: 'For learners whose attention, energy, access, or routine changes—and who need progress to survive the pause.',
    question: 'What would make returning feel possible?',
    image: './generated/calm-return.png',
    position: '60% center',
    generated: true
  },
  {
    id: '09',
    slug: 'word-builder',
    template: 'module',
    status: 'ADAPTED CONCEPT · IN DEVELOPMENT',
    module: 'WORD BUILDER',
    title: 'Words are built—\nnot flashed past.',
    body: 'Hear the pattern. Spell it. Reconstruct it. Connect meaning. Use it. Return later.',
    emphasis: 'Typing is the response channel—not the learning goal.',
    useCase: 'For learners who need structured literacy, reconstruction, meaning, and delayed return—including many dyslexic learners.',
    question: 'What makes a new word stay with you?',
    image: '../../assets/modules/word-builder.webp'
  },
  {
    id: '10',
    slug: 'focus-sprint',
    template: 'module',
    status: 'ADAPTED CONCEPT · IN DEVELOPMENT',
    module: 'FOCUS SPRINT',
    title: 'Focus needs a path—\nnot a score.',
    body: 'Now → Next → Done. One current action. Optional short breaks. Saved work. A calm return.',
    emphasis: 'No single “focus score” should define a learner.',
    useCase: 'For ADHD and other neurodivergent learners who choose visible steps, flexible pacing, and calm re-entry.',
    question: 'What helps you re-enter the work?',
    image: '../../assets/modules/focus-sprint.webp'
  },
  {
    id: '11',
    slug: 'predictable-path',
    template: 'module',
    status: 'ADAPTED CONCEPT · IN DEVELOPMENT',
    module: 'PREDICTABLE PATH',
    title: 'Predictability should\ninform—not restrict.',
    body: 'Preview the objective, steps, interaction, duration range, sensory events and what changes next. Keep choice visible.',
    useCase: 'For autistic and other learners who choose predictable transitions, literal instructions, and sensory control.',
    question: 'What do you wish you knew before a lesson began?',
    image: '../../assets/modules/predictable-path.webp'
  },
  {
    id: '12',
    slug: 'evidence-not-surveillance',
    template: 'top',
    status: 'REPORTING PRINCIPLE',
    title: 'Evidence,\nnot surveillance.',
    body: 'Show the work, the correction, the support context and the learning status—without diagnostic inference, public error histories or one score for a person.',
    useCase: 'For neurodivergent learners who deserve useful learning evidence without surveillance or inferred labels.',
    question: 'What should teachers see—and what should remain private?',
    image: '../../assets/story/school-learning.webp',
    position: '54% center'
  },
  {
    id: '13',
    slug: 'private-by-default',
    template: 'split',
    status: 'TRUST STANDARD',
    title: 'Private by default\nis a product decision.',
    body: 'No learner-data sale. No targeted advertising. No diagnosis inferred from typing. No default public sharing for minors.',
    emphasis: 'Trust must be designed before launch.',
    useCase: 'For learners whose accessibility preferences may be sensitive and must remain private by default.',
    question: 'What would earn your trust?',
    image: '../../assets/pages/trust-family.webp',
    position: '66% center'
  },
  {
    id: '14',
    slug: 'made-with-not-for',
    template: 'top',
    status: 'COMMUNITY INVITATION',
    title: 'Lived experience should\nchange the product.',
    body: 'Not decorate the launch story. We want neurodivergent people, families, educators and specialists to challenge our assumptions and improve the next decision.',
    useCase: 'For neurodivergent people whose lived experience should change actual product decisions.',
    question: 'What are we missing?',
    image: '../../assets/story/team-codesign.webp',
    position: '50% 46%'
  },
  {
    id: '15',
    slug: 'global-interest',
    template: 'traffic',
    status: 'EARLY WEBSITE REACH · 22 JUL 2026',
    title: 'The next step\nis listening.',
    body: 'The Type2Learn website recorded 1,372 unique visitors in the previous seven days, with requests coming from multiple regions. Now we need lived-experience voices to shape what comes next.',
    useCase: 'For neurodivergent visitors and contributors whose experience can shape the next version—not just the launch story.',
    question: 'Where are you joining from?',
    visitors: '1,372',
    countries: [
      ['Netherlands', '3,190', 100],
      ['Pakistan', '1,756', 55],
      ['United States', '987', 31],
      ['Germany', '125', 4],
      ['Russian Federation', '109', 3.4]
    ],
    source: 'Cloudflare Web Analytics · previous 7 days. Country figures are requests; unique visitors are a separate metric.'
  },
  {
    id: 'FEATURED',
    slug: 'project-overview',
    template: 'featured',
    status: 'TYPE2LEARN · PROJECT OVERVIEW',
    title: 'Learn by typing.\nBuild knowledge\nthat stays.',
    body: 'Type2Learn is a nonprofit building active, typing-based learning for K–12 learners in Pakistan—with low-literacy and neurodivergent learners considered from the start.',
    useCase: 'For neurodivergent and low-literacy K–12 learners, with supports available without diagnosis or disclosure.',
    image: './generated/featured-learning-path.png',
    position: 'center center',
    generated: true
  }
];

const sharedFooter = `
  <footer class="post-footer">
    <div class="footer-rule" aria-hidden="true"></div>
    <div class="footer-grid">
      <div>
        <p class="footer-kicker">NEURODIVERGENT VOICES WANTED</p>
        <p class="footer-question">Are you neurodivergent and willing to help shape Type2Learn?</p>
      </div>
      <a class="footer-email" href="mailto:contact@type2learn.tech">contact@type2learn.tech</a>
    </div>
    <p class="footer-note">Voluntary. No diagnosis details needed. Under 18? Ask a parent or guardian to contact us.</p>
  </footer>`;

function brandHeader(post) {
  const number = post.id === 'FEATURED' ? 'FEATURED' : `${post.id} / 15`;
  return `
    <header class="post-header">
      <div class="brand-lockup">
        <img src="../../assets/type2learn-logo.png" alt="">
        <span><b>TYPE2LEARN</b><small>LEARN ACTIVELY</small></span>
      </div>
      <span class="post-number">${number}</span>
    </header>`;
}

function picture(post) {
  if (!post.image) return '';
  const label = post.template === 'module' ? '' : '<span class="illustrative-label">ILLUSTRATIVE SCENE</span>';
  return `<div class="post-picture" style="--photo:url('${post.image}');--photo-position:${post.position || 'center'}">${label}</div>`;
}

function copyBlock(post) {
  const compact = post.title.replaceAll('\n', '').length > 54 ? ' compact' : '';
  return `
    <div class="copy-panel">
      <p class="status-label">${post.status}</p>
      ${post.module ? `<p class="module-name">${post.module}</p>` : ''}
      <h2 class="post-title${compact}">${post.title.replaceAll('\n', '<br>')}</h2>
      <p class="post-body">${post.body}</p>
      ${post.emphasis ? `<p class="post-emphasis">${post.emphasis}</p>` : ''}
      <p class="use-case"><b>NEUROINCLUSIVE USE CASE</b><span>${post.useCase}</span></p>
      ${post.question ? `<p class="engagement-question">${post.question}</p>` : ''}
    </div>`;
}

function trafficStage(post) {
  const bars = post.countries.map(([name, value, width]) => `
    <li><div class="traffic-row"><span>${name}</span><b>${value}</b></div><i style="--bar:${width}%"></i></li>`).join('');
  return `
    <section class="post-stage traffic-stage">
      <div class="traffic-copy">
        <p class="status-label">${post.status}</p>
        <h2 class="post-title">${post.title.replaceAll('\n', '<br>')}</h2>
        <p class="post-body">${post.body}</p>
        <p class="use-case"><b>NEUROINCLUSIVE USE CASE</b><span>${post.useCase}</span></p>
        <p class="engagement-question">${post.question}</p>
      </div>
      <div class="traffic-data">
        <p class="traffic-label">UNIQUE VISITORS · PREVIOUS 7 DAYS</p>
        <p class="visitor-number">${post.visitors}</p>
        <svg class="traffic-line" viewBox="0 0 460 150" role="img" aria-label="Unique visitors rose across the seven-day view">
          <defs><linearGradient id="line-gradient" x1="0" x2="1"><stop stop-color="#19c85a"/><stop offset=".5" stop-color="#19bdeb"/><stop offset="1" stop-color="#1769f5"/></linearGradient></defs>
          <path d="M8 132 L82 132 L156 132 L230 130 L304 56 L378 16 L452 38" fill="none" stroke="url(#line-gradient)" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M8 132 L82 132 L156 132 L230 130 L304 56 L378 16 L452 38 L452 142 L8 142 Z" fill="url(#line-gradient)" opacity=".09"/>
        </svg>
        <p class="traffic-label request-label">TOP TRAFFIC REGIONS · REQUESTS</p>
        <ul class="traffic-bars">${bars}</ul>
        <p class="traffic-source">${post.source}</p>
      </div>
    </section>`;
}

function featuredStage(post) {
  return `
    <section class="post-stage featured-stage">
      ${picture(post)}
      <div class="featured-copy">
        <p class="status-label">${post.status}</p>
        <h2 class="post-title">${post.title.replaceAll('\n', '<br>')}</h2>
        <p class="post-body">${post.body}</p>
        <p class="use-case"><b>NEUROINCLUSIVE USE CASE</b><span>${post.useCase}</span></p>
        <div class="learning-route">
          <div><span>READ / HEAR</span><b>→</b><span>RECALL</span><b>→</b><span>TYPE / PRODUCE</span><b>→</b><span>CHECK</span></div>
          <div><b class="route-continuation">↳</b><span>CORRECT</span><b>→</b><span>APPLY</span><b>→</b><span>RETURN</span></div>
        </div>
        <div class="featured-modules">
          <p><b>WORD BUILDER</b><span>Structured literacy and academic words</span></p>
          <p><b>FOCUS SPRINT</b><span>Now → Next → Done and calm re-entry</span></p>
          <p><b>PREDICTABLE PATH</b><span>Clear steps and learner-controlled settings</span></p>
        </div>
        <p class="stage-note"><b>CURRENT STAGE</b> Product preview and literacy-first foundation. Features and outcomes still require responsible testing with people.</p>
      </div>
    </section>`;
}

function renderPost(post) {
  let stage;
  if (post.template === 'traffic') {
    stage = trafficStage(post);
  } else if (post.template === 'featured') {
    stage = featuredStage(post);
  } else {
    stage = `<section class="post-stage">${picture(post)}${copyBlock(post)}</section>`;
  }
  return `
    <article class="post template-${post.template}" id="post-${post.slug}" data-slug="${post.slug}" aria-label="Type2Learn LinkedIn post ${post.id}">
      ${brandHeader(post)}
      ${stage}
      ${sharedFooter}
    </article>`;
}

document.querySelector('#campaign-grid').innerHTML = posts.map(renderPost).join('');
