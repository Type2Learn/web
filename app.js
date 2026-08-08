(() => {
  "use strict";

  const route = document.body.dataset.route || "home";
  const locale = document.body.dataset.locale || document.documentElement.lang || "en";
  const isUrdu = locale.toLowerCase().startsWith("ur");
  const routeKey = route.endsWith("-ur") ? route.slice(0, -3) : route;
  const isHomeRoute = routeKey === "home";
  const colorModeApi = (() => {
    if (window.Type2LearnColorMode) return window.Type2LearnColorMode;
    const modes = ['flat', 'balanced', 'vivid'];
    const storageKey = 'type2learn-color-mode';
    const themeColors = { flat: '#F5F4F0', balanced: '#F5FAFF', vivid: '#E6F6FF' };
    const validMode = (value) => modes.includes(value) ? value : 'balanced';
    const read = () => {
      try { return validMode(window.localStorage.getItem(storageKey)); } catch (_) { return 'balanced'; }
    };
    const apply = (value, persist = false) => {
      const mode = validMode(value);
      document.documentElement.dataset.colorMode = mode;
      document.documentElement.style.colorScheme = 'light';
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColors[mode]);
      if (persist) {
        try { window.localStorage.setItem(storageKey, mode); } catch (_) { /* Keep the choice for this visit. */ }
      }
      window.dispatchEvent(new CustomEvent('type2learn:color-mode', { detail: { mode } }));
      return mode;
    };
    const api = { modes, get: () => validMode(document.documentElement.dataset.colorMode || read()), set: (value, persist = true) => apply(value, persist) };
    window.Type2LearnColorMode = api;
    apply(read(), false);
    return api;
  })();
  const colorModeLabels = isUrdu
    ? { flat: 'سادہ', balanced: 'متوازن', vivid: 'نمایاں' }
    : { flat: 'Flat', balanced: 'Balanced', vivid: 'Vivid' };
  const colorModeLabel = (mode) => colorModeLabels[mode] || colorModeLabels.balanced;
  const colorModeAria = (mode) => isUrdu
    ? 'رنگ کا انداز: ' + colorModeLabel(mode) + '۔ اگلا انداز منتخب کرنے کے لیے دبائیں۔'
    : 'Color mode: ' + colorModeLabel(mode) + '. Activate to choose the next color mode.';
  const colorModeControl = () => {
    const mode = colorModeApi.get();
    return '<button class="color-mode-switch" type="button" data-color-mode-toggle data-color-mode="' + mode + '" aria-label="' + colorModeAria(mode) + '"><span class="color-mode-swatch" aria-hidden="true"></span><span class="color-mode-label">' + (isUrdu ? 'رنگ' : 'Color') + '</span><span class="color-mode-state" data-color-mode-state>' + colorModeLabel(mode) + '</span></button>';
  };
  const navItems = isUrdu ? [
    ["how-it-works", "طریقۂ کار"],
    ["learning-together", "مل کر سیکھنا"],
    ["participation-trust", "شرکت اور اعتماد"],
    ["team", "ٹیم"]
  ] : [
    ["how-it-works", "How it works"],
    ["learning-together", "Learning together"],
    ["participation-trust", "Participation & trust"],
    ["team", "Team"]
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
  const button = (label, href, kind) => '<a class="button button-' + (kind || 'secondary') + '" href="/login/">' + label + icon('arrow', true) + '</a>';

  const brand = () => '<a class="brand" href="' + (isUrdu ? "/ur/" : "/") + '" aria-label="' + (isUrdu ? "Type2Learn — فعال سیکھیں — مرکزی صفحہ" : "Type2Learn — Learn actively — home") + '"><img class="brand-mark" src="/assets/type2learn-logo-nav.webp" width="160" height="141" alt=""><span class="brand-copy"><span class="brand-name">TYPE2LEARN</span><span class="brand-tagline">' + (isUrdu ? "فعال سیکھیں" : "Learn actively") + '</span></span></a>';

  const nav = () => {
    const links = navItems.map(([key, label]) => '<a href="' + (isUrdu ? "/ur/" + key + "/" : "/" + key + "/") + '"' + (routeKey === key ? ' aria-current="page"' : '') + '>' + label + '</a>').join('');
    const trustAnchor = routeKey === 'participation-trust' && ['#accessibility', '#security', '#support', '#video-conversations'].includes(window.location.hash)
      ? window.location.hash
      : '';
    const englishRoute = (isHomeRoute ? "/" : "/" + routeKey + "/") + trustAnchor;
    const urduRouteAliases = {
      accessibility: '/ur/participation-trust/#accessibility',
      security: '/ur/participation-trust/#security',
      support: '/ur/participation-trust/#support'
    };
    const hasUrduCounterpart = isHomeRoute
      || navItems.some(([key]) => key === routeKey)
      || Object.prototype.hasOwnProperty.call(urduRouteAliases, routeKey);
    const urduRoute = urduRouteAliases[routeKey] || ((isHomeRoute ? "/ur/" : "/ur/" + routeKey + "/") + trustAnchor);
    const languageSwitch = '<a class="language-switch" href="' + (isUrdu ? englishRoute : urduRoute) + '" lang="' + (isUrdu ? "en" : "ur") + '">' + (isUrdu ? "English" : "اردو") + '</a>';
    const motionLabel = isUrdu ? "حرکت" : "Motion";
    const motionState = isUrdu ? "آن" : "On";
    const getStarted = isUrdu ? "شروع کریں" : "Get started";
    const openMenu = isUrdu ? "مینو کھولیں" : "Open menu";
    return '<header class="site-header"><div class="scroll-progress" aria-hidden="true"><i id="scroll-progress"></i></div><div class="header-inner">' + brand() + '<nav class="desktop-nav" aria-label="' + (isUrdu ? "مرکزی نیویگیشن" : "Primary") + '">' + links + '</nav><div class="header-actions">' + (hasUrduCounterpart ? languageSwitch : '') + colorModeControl() + '<button class="motion-switch" id="motion-toggle" type="button" aria-pressed="false" aria-label="' + motionLabel + ' ' + motionState + '">' + icon('pause', true) + '<span class="motion-switch-label">' + motionLabel + '</span><span class="motion-switch-state">' + motionState + '</span></button><a class="button button-primary is-small" href="/login/">' + getStarted + icon('arrow', true) + '</a><button class="menu-toggle" id="menu-toggle" type="button" aria-expanded="false" aria-controls="mobile-nav" aria-label="' + openMenu + '">' + icon('menu') + '</button></div></div><nav class="mobile-nav" id="mobile-nav" aria-label="' + (isUrdu ? "موبائل نیویگیشن" : "Mobile primary") + '">' + links + (hasUrduCounterpart ? languageSwitch : '') + colorModeControl() + '<a class="button button-primary" href="/login/">' + getStarted + icon('arrow', true) + '</a></nav></header>';
  };

  const urduFooter = () => '<footer class="site-footer"><div class="content-wrap footer-top"><div class="footer-brand">' + brand() + '<p class="footer-description">فعال، ٹائپنگ پر مبنی سیکھنا جس میں سیکھنے والے کے اپنے کنٹرولز موجود ہیں۔ شرکت، رازداری اور واضح اگلے قدم کے گرد بنایا گیا۔</p><span class="footer-preview-label">تعلیمی مصنوعات کا پیش منظر</span></div><div class="footer-grid"><div><h2>دریافت کریں</h2><a href="/ur/how-it-works/">طریقۂ کار اور بنیاد</a><a href="/ur/pathways/">سیکھنے کے راستے</a><a href="/ur/learners/">سیکھنے والے کے کنٹرولز</a><a href="/ur/families/">خاندانوں کے لیے</a></div><div><h2>اعتماد</h2><a href="/ur/trust/#accessibility">رسائی پذیری</a><a href="/privacy/">رازداری پالیسی <span lang="en">(English)</span></a><a href="/ur/trust/#security">سکیورٹی</a><a href="/terms/">سروس کی شرائط <span lang="en">(English)</span></a></div><div><h2>رابطہ</h2><a href="/ur/team/">بانی ٹیم</a><a href="/ur/co-design/">مشترکہ ڈیزائن</a><a href="/ur/community/">کمیونٹی</a><a href="/ur/schools/">اسکولوں کے لیے</a><div class="footer-social-links"><a href="https://github.com/Type2Learn" target="_blank" rel="noopener noreferrer">GitHub <span aria-hidden="true">↗</span><span class="sr-only"> (نئے ٹیب میں کھلتا ہے)</span></a><a href="https://www.linkedin.com/company/type2learn/" target="_blank" rel="noopener noreferrer">LinkedIn <span aria-hidden="true">↗</span><span class="sr-only"> (نئے ٹیب میں کھلتا ہے)</span></a></div></div></div></div><div class="content-wrap footer-bottom"><span>© 2026 Type2Learn۔ غیر منافع بخش مقصد کے ساتھ زیرِ تیاری تعلیمی اقدام۔</span><span class="footer-status"><i></i>عوامی معلومات پر مسلسل کام جاری ہے۔</span></div></footer>';
  const footer = () => isUrdu ? urduFooter() : '<footer class="site-footer"><div class="content-wrap footer-top"><div class="footer-brand">' + brand() + '<p class="footer-description">Active, typing-based learning with learner-controlled support. Built around participation, privacy, and clear next steps.</p><span class="footer-preview-label">Educational product preview</span></div><div class="footer-grid"><div><h2>Explore</h2><a href="/how-it-works/">How it works & evidence</a><a href="/pathways/">Pathways</a><a href="/learners/">For learners</a><a href="/families/">For families</a></div><div><h2>Trust</h2><a href="/trust/#accessibility">Accessibility</a><a href="/privacy/">Privacy Policy</a><a href="/trust/#security">Security</a><a href="/terms/">Terms of Service</a></div><div><h2>Connect</h2><a href="/team/">Founding team</a><a href="/co-design/">Co-design</a><a href="/community/">Community</a><a href="/community/#support">Support</a><a href="/schools/">For schools</a><div class="footer-social-links"><a href="https://github.com/Type2Learn" target="_blank" rel="noopener noreferrer">GitHub <span aria-hidden="true">↗</span><span class="sr-only"> (opens in a new tab)</span></a><a href="https://www.linkedin.com/company/type2learn/" target="_blank" rel="noopener noreferrer">LinkedIn <span aria-hidden="true">↗</span><span class="sr-only"> (opens in a new tab)</span></a></div></div></div></div><div class="content-wrap footer-bottom"><span>© 2026 Type2Learn. An education initiative being developed with a nonprofit mission.</span><span class="footer-status"><i></i>Public information is a work in progress.</span></div></footer>';

  const nativeBuilderCredit = isUrdu ? '<section class="builder-credit" aria-label="ویب سائٹ کی تیاری کا کریڈٹ"><div class="content-wrap builder-credit-inner reveal"><img class="builder-monogram" src="/assets/brand-marks/native-builder.svg" width="32" height="32" alt=""><div class="builder-copy"><p>ویب سائٹ کا کریڈٹ · native.builder</p><strong>Type2Learn کے لیے native.builder کے ساتھ تیار کیا گیا۔</strong></div><a class="builder-credit-link" href="https://builder.nativelyai.com/" target="_blank" rel="noopener noreferrer"><span>native.builder ملاحظہ کریں</span><span class="builder-link-icon" aria-hidden="true">↗</span><span class="sr-only"> (نئے ٹیب میں کھلتا ہے)</span></a></div></section>' : '<section class="builder-credit" aria-label="Website development credit"><div class="content-wrap builder-credit-inner reveal"><img class="builder-monogram" src="/assets/brand-marks/native-builder.svg" width="32" height="32" alt=""><div class="builder-copy"><p>Website credit · native.builder</p><strong>Built with native.builder for Type2Learn.</strong></div><a class="builder-credit-link" href="https://builder.nativelyai.com/" target="_blank" rel="noopener noreferrer"><span>Visit native.builder</span><span class="builder-link-icon" aria-hidden="true">↗</span><span class="sr-only"> (opens in a new tab)</span></a></div></section>';

  const ctaDefinitions = {
    home: ['Start with one clear next step', 'See how active learning feels in practice.', 'Explore the learning pathways or begin a guided recall activity designed around one clear next step.', 'Try it now', '/#demo', 'Explore pathways', '/pathways/'],
    'how-it-works': ['Put the method to work', 'Move from a clear action to durable return.', 'Choose a pathway built around recall, useful feedback, application, and a calm way back in.', 'Explore pathways', '/pathways/', 'Try it now', '/#demo'],
    'learning-together': ['Keep the learner at the centre', 'Make each support role clear.', 'See the shared responsibilities that let families, educators, and schools support learning without turning it into surveillance.', 'See participation & trust', '/participation-trust/', 'Read the method', '/how-it-works/'],
    'participation-trust': ['Keep the record accountable', 'Make every contribution and boundary visible.', 'See the learning method, then return here as participation evidence and support governance grow.', 'Read how it works', '/how-it-works/', 'Meet the team', '/team/'],
    pathways: ['Choose a route', 'Start with the work the learner needs to do.', 'Compare the learning pathways, then follow the route that makes the objective and the next action visible.', 'For learners', '/learners/', 'For schools', '/schools/'],
    learners: ['Keep the learner in control', 'Choose support without lowering the expectation.', 'See the pathways, controls, and learning routines designed to protect progress and learner dignity.', 'Explore pathways', '/pathways/', 'For families', '/families/'],
    families: ['Support the learning, not surveillance', 'Make the routine clear for everyone around it.', 'Understand what the learner is doing, how support works, and where privacy boundaries stay firm.', 'See learner controls', '/learners/', 'Read the trust center', '/trust/'],
    schools: ['Plan a responsible route', 'Bring active learning into a clear school workflow.', 'Review the method, evidence boundaries, implementation responsibilities, and safeguards before a pilot.', 'Review the method', '/how-it-works/', 'Read the trust center', '/trust/'],
    team: ['Build with accountability', 'Meet the people responsible for the next decision.', 'Move through the leadership profiles, then see how evidence, access, and community shape the work.', 'Explore the method', '/how-it-works/', 'Community & help', '/community/'],
    'co-design': ['Shape a decision, not a slogan', 'Help make active learning clearer and more respectful.', 'Read the current participation status, the safeguards required before testing, and the decisions contributors are intended to influence.', 'Meet the founding team', '/team/', 'Community & help', '/community/'],
    community: ['Bring a useful question', 'Help make the next learning decision better.', 'Find the right route for support, contribution, co-design, or a clear product question.', 'Explore pathways', '/pathways/', 'Read the trust center', '/trust/'],
    trust: ['Keep the standard visible', 'Read how access, privacy, security, and terms connect.', 'Use one accountable trust center to understand the safeguards around learning and participation.', 'Explore the method', '/how-it-works/', 'Community & help', '/community/']
  };
  const urduCtaDefinitions = {
    "how-it-works": ['طریقے کو عمل میں لائیں', 'واضح عمل سے پائیدار واپسی تک جائیں۔', 'یادداشت، مفید رائے، استعمال اور پرسکون واپسی کے گرد بنایا گیا راستہ منتخب کریں۔', 'راستے دریافت کریں', '/ur/pathways/', 'اب آزمائیں', '/login/'],
    "learning-together": ['سیکھنے والے کو مرکز میں رکھیں', 'ہر معاون کردار واضح بنائیں۔', 'ذمہ داریوں کا مشترکہ معیار دیکھیں جس سے خاندان، اساتذہ اور اسکول سیکھنے کو نگرانی بنائے بغیر مدد دے سکیں۔', 'شرکت اور اعتماد دیکھیں', '/ur/participation-trust/', 'طریقہ پڑھیں', '/ur/how-it-works/'],
    "participation-trust": ['ریکارڈ کو جواب دہ رکھیں', 'ہر شراکت اور حد کو واضح بنائیں۔', 'تعلیمی طریقہ دیکھیں، پھر شرکت کے شواہد اور مدد کی حکمرانی بڑھنے پر یہاں واپس آئیں۔', 'طریقہ دیکھیں', '/ur/how-it-works/', 'ٹیم سے ملیں', '/ur/team/'],
    pathways: ['اپنا راستہ منتخب کریں', 'وہاں سے آغاز کریں جہاں سیکھنے والے کو کام کرنا ہے۔', 'تین راستوں کا موازنہ کریں اور وہ راستہ چنیں جو مقصد اور اگلا قدم واضح رکھے۔', 'سیکھنے والوں کے لیے', '/ur/learners/', 'اسکولوں کے لیے', '/ur/schools/'],
    learners: ['اختیار سیکھنے والے کے پاس', 'مدد منتخب کریں، توقع کم نہ کریں۔', 'راستے، کنٹرولز اور روٹین دیکھیں جو پیش رفت اور وقار کی حفاظت کرتے ہیں۔', 'راستے دریافت کریں', '/ur/pathways/', 'خاندانوں کے لیے', '/ur/families/'],
    families: ['مدد، نگرانی نہیں', 'سیکھنے کی روٹین سب کے لیے واضح بنائیں۔', 'جانیں کہ سیکھنے والا کیا کر رہا ہے، مدد کیسے کام کرتی ہے، اور رازداری کی حد کہاں قائم رہتی ہے۔', 'سیکھنے والے کے کنٹرولز', '/ur/learners/', 'اعتماد کا مرکز', '/ur/trust/'],
    schools: ['ذمہ دار راستہ بنائیں', 'فعال سیکھنے کو واضح اسکولی عمل میں لائیں۔', 'آزمائش سے پہلے طریقہ، ثبوت کی حدود، نفاذ کی ذمہ داریاں اور حفاظتی اصول دیکھیں۔', 'طریقہ دیکھیں', '/ur/how-it-works/', 'اعتماد کا مرکز', '/ur/trust/'],
    team: ['جوابدہی کے ساتھ تعمیر', 'اگلے فیصلے کے ذمہ دار لوگوں سے ملیں۔', 'قیادت کے پروفائلز دیکھیں، پھر جانیں کہ ثبوت، رسائی اور کمیونٹی کام کو کیسے ڈھالتے ہیں۔', 'طریقہ دریافت کریں', '/ur/how-it-works/', 'کمیونٹی اور مدد', '/ur/community/'],
    "co-design": ['نعرے نہیں، فیصلے بدلیں', 'فعال سیکھنے کو زیادہ واضح اور باوقار بنانے میں مدد کریں۔', 'شرکت کی موجودہ حیثیت، جانچ سے پہلے ضروری حفاظتی اصول، اور وہ فیصلے دیکھیں جن پر شراکت دار اثر ڈال سکیں گے۔', 'بانی ٹیم سے ملیں', '/ur/team/', 'کمیونٹی اور مدد', '/ur/community/'],
    community: ['ایک مفید سوال لائیں', 'اگلے تعلیمی فیصلے کو بہتر بنانے میں مدد کریں۔', 'سپورٹ، شراکت، مشترکہ ڈیزائن یا واضح مصنوعات کے سوال کے لیے درست راستہ تلاش کریں۔', 'راستے دریافت کریں', '/ur/pathways/', 'اعتماد کا مرکز', '/ur/trust/'],
    trust: ['معیار واضح رکھیں', 'رسائی، رازداری، سکیورٹی اور شرائط کا تعلق سمجھیں۔', 'سیکھنے اور شرکت کے حفاظتی اصول ایک جواب دہ مرکز میں دیکھیں۔', 'طریقہ دریافت کریں', '/ur/how-it-works/', 'کمیونٹی اور مدد', '/ur/community/']
  };

  const ctaRoute = ({ research: 'how-it-works', support: 'community', privacy: 'trust', terms: 'trust', accessibility: 'trust', security: 'trust' })[routeKey] || routeKey;
  const routeCtaArt = (routeName) => {
    if (routeName === 'how-it-works') {
      const actions = isUrdu ? ['منتخب', 'سمجھیں', 'یاد', 'بنائیں', 'درست', 'استعمال', 'واپسی'] : ['Choose', 'Understand', 'Recall', 'Produce', 'Correct', 'Apply', 'Return'];
      return '<div class="route-cta-art method-route-art" aria-hidden="true"><div class="method-route-core"><strong>' + (isUrdu ? 'عمل' : 'DO') + '</strong><span>' + (isUrdu ? 'فعال سیکھنا' : 'Active learning') + '</span></div><div class="method-route-track">' + actions.map((action, index) => '<i style="--art-index:' + (index + 1) + '"><b>' + String(index + 1).padStart(2, '0') + '</b><span>' + action + '</span></i>').join('') + '</div></div>';
    }
    if (routeName === 'team') {
      const roles = isUrdu ? [['01', 'سمت'], ['02', 'انجینئرنگ'], ['03', 'تحقیق'], ['04', 'AI'], ['05', 'مصنوعات']] : [['01', 'Vision'], ['02', 'Engineering'], ['03', 'Research'], ['04', 'AI'], ['05', 'Product']];
      return '<div class="route-cta-art team-route-art" aria-hidden="true"><div class="team-route-axis"><span>' + (isUrdu ? 'ایک مقصد' : 'One mission') + '</span><strong>05</strong></div>' + roles.map((role, index) => '<i style="--art-index:' + (index + 1) + '"><b>' + role[0] + '</b><span>' + role[1] + '</span><em></em></i>').join('') + '</div>';
    }
    if (routeName === 'co-design') {
      const decisions = isUrdu
        ? [['01', 'حد طے کریں'], ['02', 'رضامندی'], ['03', 'سنیں'], ['04', 'فیصلہ بدلیں'], ['05', 'حیثیت شائع کریں']]
        : [['01', 'Define'], ['02', 'Consent'], ['03', 'Listen'], ['04', 'Change'], ['05', 'Publish status']];
      return '<div class="route-cta-art codesign-route-art" aria-hidden="true"><div class="codesign-route-spine"><span>' + (isUrdu ? 'رائے' : 'Input') + '</span><strong>' + (isUrdu ? 'فیصلہ' : 'Decide') + '</strong></div><ol>' + decisions.map((decision, index) => '<li style="--art-index:' + (index + 1) + '"><b>' + decision[0] + '</b><span>' + decision[1] + '</span><i></i></li>').join('') + '</ol></div>';
    }
    return '<div class="route-cta-art" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>';
  };

  const siteCta = () => {
    if (isUrdu && isHomeRoute) {
      return '<section class="site-cta site-cta-home" data-cta-route="home" aria-labelledby="site-cta-title"><div class="content-wrap"><div class="site-cta-panel reveal"><div class="cta-orbit" aria-hidden="true"><i></i><i></i><i></i></div><div class="site-cta-copy"><p class="section-kicker">ایک واضح اگلے قدم سے آغاز کریں</p><h2 id="site-cta-title">دیکھیں کہ فعال سیکھنا عمل میں کیسا محسوس ہوتا ہے۔</h2><p>سیکھنے کے راستے دریافت کریں یا ایک واضح اگلے قدم کے گرد بنائی گئی رہنمائی والی یادداشت کی سرگرمی سے آغاز کریں۔</p></div><div class="site-cta-actions">' + button('اب آزمائیں', '#demo', 'primary') + button('راستے دریافت کریں', '#pathways', 'light') + '</div></div></div></section>';
    }
    const item = (isUrdu ? urduCtaDefinitions : ctaDefinitions)[ctaRoute] || ctaDefinitions.home;
    const isHome = ctaRoute === 'home';
    const art = isHome ? '<div class="cta-orbit" aria-hidden="true"><i></i><i></i><i></i></div>' : routeCtaArt(ctaRoute);
    return '<section class="site-cta site-cta-' + ctaRoute + '" data-cta-route="' + ctaRoute + '" aria-labelledby="site-cta-title"><div class="content-wrap"><div class="site-cta-panel reveal">' + art + '<div class="site-cta-copy"><p class="section-kicker">' + item[0] + '</p><h2 id="site-cta-title" data-animate-words>' + item[1] + '</h2><p>' + item[2] + '</p></div><div class="site-cta-actions">' + button(item[3], item[4], 'primary') + button(item[5], item[6], 'light') + '</div></div></div></section>';
  };

  const shell = (content) => '<div class="site-shell">' + nav() + '<main id="main-content">' + content + siteCta() + nativeBuilderCredit + '</main>' + footer() + '</div>';

  const pageHero = (eyebrow, title, copy, asideTitle, asideCopy) => '<section class="page-hero" data-hero-scene><div class="hero-atmosphere" aria-hidden="true"><i></i><i></i><i></i></div><div class="content-wrap"><div class="breadcrumb"><a href="' + (isUrdu ? '/ur/' : '/') + '">' + (isUrdu ? 'مرکزی صفحہ' : 'Home') + '</a><span aria-hidden="true">/</span><span>' + eyebrow + '</span></div><div class="page-hero-grid"><div class="page-hero-copy"><p class="eyebrow"><span class="eyebrow-dot"></span>' + eyebrow + '</p><h1 data-animate-words>' + title + '</h1><p>' + copy + '</p><button class="scroll-cue" type="button" data-scroll-next aria-label="' + (isUrdu ? 'اگلا حصہ دیکھنے کے لیے اسکرول کریں' : 'Scroll to explore the next section') + '"><span class="scroll-mouse" aria-hidden="true"><i></i></span><span>' + (isUrdu ? 'آگے دیکھنے کے لیے اسکرول کریں' : 'Scroll to explore') + '</span></button></div><aside class="page-hero-aside reveal" data-tilt><span class="aside-label">' + (isUrdu ? 'موجودہ سمت' : 'Current direction') + '</span><strong>' + asideTitle + '</strong><span>' + asideCopy + '</span><i class="aside-path" aria-hidden="true"></i></aside></div></div></section>';

  const legacyAuthPage = () => {
    const slides = [
      ['/assets/auth/login-library.webp', 'Learn in your own way.', 'Private controls. Clear next steps.', '01'],
      ['/assets/auth/login-studio.webp', 'Return exactly where you stopped.', 'Meaningful work stays ready for you.', '02'],
      ['/assets/auth/login-community.webp', 'Build knowledge that stays.', 'Recall, produce, correct, and apply.', '03'],
      ['/assets/auth/login-science.webp', 'Connect ideas through action.', 'Investigate, type, and make meaning visible.', '04'],
      ['/assets/auth/login-home-study.webp', 'A clear place to begin.', 'Calm guidance for the next useful step.', '05'],
      ['/assets/auth/login-family.webp', 'Support without surveillance.', 'Help stays respectful and learner-led.', '06'],
      ['/assets/auth/login-makerspace.webp', 'Learn with other minds.', 'Collaboration turns ideas into useful work.', '07']
    ];
    const slideshow = slides.map((slide, index) => '<figure class="auth-slide' + (index === 0 ? ' is-active' : '') + '" data-auth-slide="' + index + '" aria-hidden="' + (index === 0 ? 'false' : 'true') + '"><img class="auth-slide-image' + (index === 0 ? ' is-priority' : '') + '" ' + (index === 0 ? 'src="' + slide[0] + '" loading="eager" fetchpriority="high"' : 'data-src="' + slide[0] + '" loading="lazy"') + ' alt="" width="1920" height="1080"><figcaption><span>' + slide[3] + '</span><strong>' + slide[1] + '</strong><small>' + slide[2] + '</small></figcaption></figure>').join('');
    const slideControls = slides.map((slide, index) => '<button type="button" data-auth-slide-button="' + index + '" aria-label="Show background story ' + (index + 1) + '" aria-pressed="' + (index === 0 ? 'true' : 'false') + '"><span>' + slide[3] + '</span><i></i></button>').join('');
    const passwordControl = (target) => '<button class="auth-password-toggle" type="button" data-password-toggle="' + target + '" aria-label="Show password" aria-pressed="false">' + icon('eye', true) + '</button>';
    return '<div class="auth-shell"><div class="auth-slideshow" aria-label="Type2Learn learning stories">' + slideshow + '<div class="auth-slide-wash" aria-hidden="true"></div><div class="auth-slide-controls" aria-label="Background stories">' + slideControls + '</div></div><header class="auth-header">' + brand() + '<div class="auth-header-actions"><a href="/">Back to website</a>' + colorModeControl() + '<button class="motion-switch" id="motion-toggle" type="button" aria-pressed="false" aria-label="Motion On — turn off decorative motion">' + icon('pause', true) + '<span class="motion-switch-label">Motion</span><span class="motion-switch-state">On</span></button></div></header><main id="main-content" class="auth-page"><section class="auth-dialog" aria-labelledby="auth-title" data-auth-dialog><div class="auth-dialog-accent" aria-hidden="true"><i></i><i></i><i></div><div class="auth-dialog-heading"><p class="section-kicker">Secure learning access</p><h1 id="auth-title">Welcome back.</h1><p id="auth-description">Continue from the exact point where your learning paused.</p></div><div class="auth-form-stage"><form class="auth-form is-active" data-auth-form="login" aria-hidden="false"><button class="auth-google-button" type="button" data-google-auth><span class="google-mark" aria-hidden="true">G</span><span>Continue with Google</span></button><div class="auth-divider"><span>or continue with email</span></div><label class="auth-field"><span>Email address</span><input id="login-email" name="email" type="email" autocomplete="email" inputmode="email" placeholder="name@example.com" required></label><label class="auth-field"><span>Password</span><span class="auth-input-control"><input id="login-password" name="password" type="password" autocomplete="current-password" placeholder="Enter your password" minlength="8" required>' + passwordControl('login-password') + '</span></label><div class="auth-form-options"><label class="auth-check"><input id="remember-email" name="remember" type="checkbox"><span class="auth-check-box" aria-hidden="true"></span><span>Remember me</span></label><button type="button" class="auth-text-button" data-auth-mode="reset">Forgot password?</button></div><button class="button button-primary auth-submit" type="submit">Sign in' + icon('arrow', true) + '</button><p class="auth-status" data-auth-status role="status" aria-live="polite"></p><p class="auth-switch">New to Type2Learn? <button type="button" data-auth-mode="register">Create an account</button></p></form><form class="auth-form" data-auth-form="register" aria-hidden="true" hidden><div class="auth-field-row"><label class="auth-field"><span>Full name</span><input id="register-name" name="name" type="text" autocomplete="name" placeholder="Your name" required></label><label class="auth-field"><span>Email address</span><input id="register-email" name="email" type="email" autocomplete="email" inputmode="email" placeholder="name@example.com" required></label></div><label class="auth-field"><span>Create password</span><span class="auth-input-control"><input id="register-password" name="password" type="password" autocomplete="new-password" placeholder="At least 8 characters" minlength="8" required>' + passwordControl('register-password') + '</span></label><label class="auth-field"><span>Confirm password</span><span class="auth-input-control"><input id="register-confirm" name="confirm-password" type="password" autocomplete="new-password" placeholder="Enter it again" minlength="8" required>' + passwordControl('register-confirm') + '</span></label><label class="auth-check auth-terms-check"><input id="register-terms" name="terms" type="checkbox" required><span class="auth-check-box" aria-hidden="true"></span><span>I agree to the <a href="/terms/">Terms of Service</a> and <a href="/privacy/">Privacy Policy</a>.</span></label><button class="button button-primary auth-submit" type="submit">Create account' + icon('arrow', true) + '</button><p class="auth-status" data-auth-status role="status" aria-live="polite"></p><p class="auth-switch">Already have an account? <button type="button" data-auth-mode="login">Sign in</button></p></form><form class="auth-form" data-auth-form="reset" aria-hidden="true" hidden><div class="auth-reset-mark" aria-hidden="true">' + icon('lock') + '</div><p class="auth-reset-copy">Enter the email connected to your Type2Learn account and we will prepare the recovery step.</p><label class="auth-field"><span>Email address</span><input id="reset-email" name="email" type="email" autocomplete="email" inputmode="email" placeholder="name@example.com" required></label><button class="button button-primary auth-submit" type="submit">Send reset link' + icon('arrow', true) + '</button><p class="auth-status" data-auth-status role="status" aria-live="polite"></p><p class="auth-switch"><button type="button" data-auth-mode="login">Back to sign in</button></p></form></div><p class="auth-integration-note"><span></span>Account services are currently being connected</p></section></main></div>';
  };

  const authPage = () => legacyAuthPage().replace('<i></i><i></i><i></div>', '<i></i><i></i><i></i></div>');

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

    return shell('<section class="hero" data-hero-scene><div class="hero-atmosphere" aria-hidden="true"><i></i><i></i><i></i></div><div class="content-wrap hero-grid"><div class="hero-copy-block"><p class="eyebrow"><span class="eyebrow-dot"></span>Active learning, one keystroke at a time</p><h1 data-animate-words>Learn by typing. Build knowledge that stays.</h1><p class="hero-copy">Type2Learn turns lessons into guided recall, correction, and practice - so progress means participation, not just pressing play.</p><div class="hero-actions">' + button('Try the learning demo', '#demo', 'primary') + button('Explore pathways', '/pathways/', 'secondary') + '</div><div class="trust-inline"><span>' + icon('check', true) + 'No speed-first ranking</span><span>' + icon('shield', true) + 'Private by default for young learners</span><span>' + icon('sliders', true) + 'Controls before assumptions</span></div><button class="scroll-cue" type="button" data-scroll-next aria-label="See the learning loop — scroll to the learning demonstration"><span class="scroll-mouse" aria-hidden="true"><i></i></span><span>See the learning loop</span></button></div><div class="hero-workspace reveal" data-delay="1" data-tilt><div class="workspace-top"><div class="workspace-brand">' + brand() + '<span>Guided lesson preview</span></div><div class="workspace-controls">' + status('Prototype', 'amber') + '</div></div><div class="workspace-surface"><div class="workspace-heading"><span class="workspace-number">01</span><div><h2>Explain what a variable stores</h2><p>One useful idea. One visible next action.</p></div></div><div class="now-next-done"><div class="task-state is-now"><span class="state-name">Now</span><strong>Complete the idea</strong><span>A variable stores a value that can...</span></div><div class="task-state"><span class="state-name">Next</span><strong>Check your wording</strong><span>See what the definition means.</span></div><div class="task-state"><span class="state-name">Done</span><strong>Apply it in code</strong><span>Create a score value.</span></div></div><div class="workspace-progress"><span>Learning path</span><div class="progress-bar"><i></i></div><span>1 of 3</span></div></div><div class="logo-source-frame"><img src="/assets/type2learn-logo.png" alt="Type2Learn T2L logo"></div></div></div></section><section class="section is-paper" id="demo"><div class="content-wrap"><div class="section-heading"><div class="section-heading-copy"><p class="section-kicker">Try the mechanism</p><h2 data-animate-words>A small interaction. A genuine learning moment.</h2><p>This local demo does not create an account or store your response. It demonstrates the first part of the Type2Learn loop.</p></div>' + status('Live on this page', 'green') + '</div><div class="demo-card reveal"><div class="demo-top"><div><p class="card-label">Step 3 of 7 · Type / Produce</p><h2>Complete the idea without looking.</h2></div>' + status('No timer', 'teal') + '</div><div class="demo-prompt"><strong>Recall cue</strong><p>A variable stores a value that can ...</p></div><form class="demo-form" id="typing-demo"><label class="sr-only" for="demo-answer">Your answer</label><input id="demo-answer" autocomplete="off" spellcheck="false" placeholder="Type your response here"><button class="button button-primary" type="submit">Check response' + icon('arrow', true) + '</button></form><p class="demo-feedback" id="demo-feedback" aria-live="polite">You can skip this preview at any time.</p><div class="demo-footer"><span>Meaningful variants are accepted where the objective allows them.</span><button class="text-link" id="skip-demo" type="button">Skip this demo</button></div><div class="controls-row"><span class="control-preview">' + icon('pause', true) + 'Reduced motion ready</span><span class="control-preview">' + icon('headphones', true) + 'Sound is off</span><span class="control-preview">' + icon('message', true) + 'Literal instructions available</span><span class="control-preview">' + icon('keyboard', true) + 'Keyboard first</span></div></div></div></section><section class="section is-cloud"><div class="content-wrap"><div class="section-heading"><div class="section-heading-copy"><p class="section-kicker">The learning loop</p><h2 data-animate-words>Watching can feel productive. Learning asks you to retrieve.</h2><p>Video, audio, examples, and support can all be valuable. Type2Learn adds the action layer: a clear objective, active response, correction, application, and return.</p></div></div><div class="learning-loop">' + loop + '</div></div></section><section class="section is-paper"><div class="content-wrap"><div class="section-heading"><div class="section-heading-copy"><p class="section-kicker">Three connected experiences</p><h2 data-animate-words>Support the work - not a label.</h2><p>Each experience keeps the academic target visible while offering private, configurable ways to enter, sustain, and complete meaningful learning.</p></div></div><div class="module-grid">' + modules + '</div></div></section><section class="section is-cloud"><div class="content-wrap"><div class="support-panel reveal"><p class="section-kicker">Private learning controls</p><h2>Different minds need different controls - not different expectations of dignity.</h2><p>Every learner can choose what helps them participate. Settings are private by default and are not a diagnosis.</p><div class="support-items"><div class="support-item"><strong>Motion and sound</strong><span>Reduced motion, no surprise animation, no autoplay audio.</span></div><div class="support-item"><strong>Reading and response</strong><span>Text size, spacing, read-aloud, captions, typing, speech, and more.</span></div><div class="support-item"><strong>Planning and pacing</strong><span>Visible steps, timer choice, pause, resume, and one next action.</span></div><div class="support-item"><strong>Help and clarity</strong><span>Literal instructions, examples, source highlights, and alternatives.</span></div></div></div></div></section><section class="section is-paper"><div class="content-wrap"><div class="section-heading"><div class="section-heading-copy"><p class="section-kicker">Built for the real people around learning</p><h2 data-animate-words>One learning tool. Clear routes for every audience.</h2></div></div><div class="audience-grid"><article class="audience-card reveal"><div class="audience-icon">' + icon('keyboard') + '</div><h3>Learners</h3><p>See what to do now, keep your work, choose your controls, and build proof of what you can do.</p><a class="card-footer" href="/learners/">See learner controls ' + icon('arrow', true) + '</a></article><article class="audience-card reveal" data-delay="1"><div class="audience-icon">' + icon('users') + '</div><h3>Families</h3><p>Understand the learning routine and privacy defaults without being asked to monitor every moment.</p><a class="card-footer" href="/families/">Explore family use ' + icon('arrow', true) + '</a></article><article class="audience-card reveal" data-delay="2"><div class="audience-icon">' + icon('school') + '</div><h3>Schools and professionals</h3><p>See meaningful learning evidence, support context, and clear boundaries - never a surveillance score.</p><a class="card-footer" href="/schools/">See the school approach ' + icon('arrow', true) + '</a></article></div></div></section><section class="section is-pale"><div class="content-wrap"><div class="evidence-grid"><article class="evidence-card reveal">' + status('Supported', 'green') + '<h3>Active practice</h3><p>Retrieval, feedback, and return shape the interaction model.</p></article><article class="evidence-card reveal" data-delay="1">' + status('Adapted', 'blue') + '<h3>Product translation</h3><p>Interface mechanics are designed hypotheses, not automatic proof.</p></article><article class="evidence-card reveal" data-delay="2">' + status('In preparation', 'teal') + '<h3>Co-design process</h3><p>Participation criteria and safeguards are being prepared; no completed external findings are claimed.</p></article><article class="evidence-card reveal" data-delay="3">' + status('Planned', 'amber') + '<h3>Pilot and measurement</h3><p>Learning claims follow defined study, consent, and outcome evidence.</p></article></div></div></section><section class="section is-paper"><div class="content-wrap"><div class="section-heading"><div class="section-heading-copy"><p class="section-kicker">Common questions</p><h2 data-animate-words>Clear about what Type2Learn is - and what it is not.</h2></div><a class="button button-secondary" href="/login/">Get support' + icon('arrow', true) + '</a></div><div class="faq-list"><details class="faq-card reveal"><summary>Is Type2Learn a typing tutor?</summary><p>Typing is the active interaction layer. The goal is subject and skill learning through recall, feedback, correction, transfer, and review - not speed alone.</p></details><details class="faq-card reveal" data-delay="1"><summary>Does it diagnose or treat dyslexia, ADHD, or autism?</summary><p>No. Type2Learn offers learner-controlled supports and evidence-informed product ideas. It is an educational platform, not a clinical, diagnostic, or treatment service.</p></details><details class="faq-card reveal" data-delay="2"><summary>What does the platform collect?</summary><p>The product direction is data minimization: private learning work and settings, no targeted advertising, no learner-data sale, and no public-model training without explicit age-appropriate permission.</p></details><details class="faq-card reveal" data-delay="3"><summary>Are all of these experiences released?</summary><p>No. This public preview labels the status of concepts honestly. The first build focuses on one complete literacy-first learning route and a reusable active-learning engine.</p></details></div></div></section><section class="section is-cloud"><div class="content-wrap"><div class="quote-block reveal"><p>Designed for participation. Led with accountability.</p><span>Meet the team, inspect the evidence approach, or explore the learning pathways.</span><div class="inline-actions">' + button('Meet the team', '/team/', 'secondary') + button('Explore pathways', '/pathways/', 'primary') + '</div></div></div></section>');
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

  const community = () => shell(pageHero('Community', 'Bring a question, insight, or challenge that makes learning better.', 'Type2Learn aims to grow through respectful collaboration with learners, families, educators, specialists, researchers, and contributors. No one needs a public social profile to use ordinary learner features.', 'Official channels', 'Follow Type2Learn on LinkedIn and explore the organization’s public work on GitHub.') + '<section class="page-section"><div class="content-wrap"><h2>Different expertise, one standard: respect the learner.</h2><p>Collaboration must improve product decisions rather than become a testimonial or a request to disclose sensitive information.</p><div class="page-grid">' + card('users', 'Lived experience', 'Feedback can identify barriers, test controls, and challenge assumptions.', ['Voluntary participation', 'No required public attribution', 'No pressure to disclose diagnoses']) + card('school', 'Education practice', 'Teachers and school leaders can test curricular fit, clarity, and daily workflow.', ['Clear implementation questions', 'Age-respectful content', 'No claims without permission']) + card('flask', 'Research and accessibility', 'Specialists can review evidence, language, measurement, access, and safety.', ['Appropriate scope', 'Compensate where possible', 'Traceable decisions']) + '</div></div></section><section class="page-section is-pale"><div class="content-wrap"><div class="status-banner community-social-banner">' + icon('message') + '<div><strong>Connect through the official Type2Learn channels</strong><p>Follow organizational updates on <a href="https://www.linkedin.com/company/type2learn/" target="_blank" rel="noopener noreferrer">LinkedIn<span class="sr-only"> (opens in a new tab)</span></a> or review public repositories on <a href="https://github.com/Type2Learn" target="_blank" rel="noopener noreferrer">GitHub<span class="sr-only"> (opens in a new tab)</span></a>. A monitored learner-support channel remains in preparation.</p></div></div></div></section><section class="page-section" id="support"><div class="content-wrap"><h2>Help should end in a calm next step.</h2><p>Support stays plain-language, accessible, and connected to the actual product state. It asks only for the information needed to recover from a barrier.</p><div class="page-grid">' + card('home', 'Getting started', 'Choose a path, adjust controls, understand the first objective, and begin safely.', ['What the demo does', 'Where settings live', 'How to reset a preview']) + card('sliders', 'Controls and access', 'Use motion, sound, text, spacing, focus, literal-instruction, and input options.', ['Keyboard help', 'Pause and resume', 'Accessible recovery']) + card('shield', 'Privacy and escalation', 'Know when to involve a parent, school, or accountable support route without oversharing.', ['Privacy request boundary', 'Accessibility barrier route', 'School support ownership']) + '</div><div class="status-banner support-status">' + icon('message') + '<div><strong>Monitored support channel pending configuration</strong><p>This preview intentionally has no contact form. A live support route requires accountable ownership, response targets, privacy review, accessibility checks, and escalation handling.</p></div></div></div></section>');

  const trust = () => shell(pageHero('Trust', 'One clear place for access, privacy, security, and terms.', 'Trust information should be easy to find and consistent with the service that actually exists. This consolidated page separates current preview behaviour from requirements that still need implementation or legal review.', 'Publication status', 'Product requirements are shown transparently. Final legal notices and monitored reporting routes remain pending review.') + '<section class="page-section trust-overview"><div class="content-wrap"><h2>Four commitments. One accountable standard.</h2><p>Use this page to understand how Type2Learn approaches access, data, protection, and service boundaries without searching across several thin policy pages.</p><nav class="trust-index" aria-label="Trust page sections"><a href="#accessibility"><span>01</span>Accessibility</a><a href="/privacy/"><span>02</span>Privacy Policy</a><a href="#security"><span>03</span>Security</a><a href="/terms/"><span>04</span>Terms of Service</a></nav></div></section><section class="page-section is-pale trust-section" id="accessibility"><div class="content-wrap"><p class="section-kicker">01 · Accessibility</p><h2>Access is a requirement, not an add-on.</h2><p>Type2Learn targets WCAG 2.2 AA and task-level testing with people who use assistive technology. Keyboard operation, useful zoom and reflow, understandable status, and reduced-motion alternatives are product requirements.</p><div class="page-grid">' + card('keyboard', 'Operate', 'Primary tasks work by keyboard with clear focus, logical order, and touch-safe targets.', ['No mouse-only action', 'No precision drag requirement', 'Named controls and status']) + card('eye', 'Perceive', 'Content remains understandable with text controls, contrast, captions, and no color-only state.', ['Readable at zoom', 'No essential motion', 'Sound independent']) + card('message', 'Understand', 'Instructions, errors, completion, and recovery remain clear and programmatically exposed.', ['Literal wording option', 'Visible completion condition', 'Useful recovery messages']) + '</div></div></section><section class="page-section trust-section" id="privacy"><div class="content-wrap"><p class="section-kicker">02 · Privacy</p><h2>Collect less. Explain it clearly.</h2><p>The intended product posture is data minimization, private learner work, purpose-limited progress records, no targeted advertising, and no sale of learner data. This public site loads Cloudflare Web Analytics and Google Analytics (measurement ID G-9ER1QJLGCW) for site-use measurement; the local learning-demo response is not sent to either analytics tag. Read the <a href="/privacy/">complete Privacy Policy</a> for the supplied publication draft and implementation requirements.</p><div class="page-grid">' + card('shield', 'Data boundaries', 'Collect only what is needed to run learning, save progress, secure accounts, and provide chosen controls.', ['Private by default', 'No diagnosis inference', 'Documented retention']) + card('lock', 'Young learner safeguards', 'Consent, school authority, role access, export, and deletion must match launch geography and service behaviour.', ['Age-appropriate defaults', 'Permission-aware sharing', 'No marketing profile']) + card('school', 'School controls', 'School deployment requires a defined educational purpose, access boundaries, and an appropriate data agreement.', ['School-controlled records', 'Export and deletion paths', 'Clear incident process']) + '</div></div></section><section class="page-section is-pale trust-section" id="security"><div class="content-wrap"><p class="section-kicker">03 · Security</p><h2>Protect learning with reviewable controls.</h2><p>The intended posture is least privilege, secure engineering, safe logging, dependency review, recovery planning, and transparent incident handling. These are requirements—not certification claims.</p><div class="page-grid">' + card('lock', 'Access control', 'Role boundaries, unique accounts, privileged access protection, audit history, and prompt offboarding.', ['Teacher and school separation', 'Least privilege', 'Human review']) + card('shield', 'Secure delivery', 'Encrypted transport and storage, protected secrets, dependency monitoring, backups, and recovery.', ['Vulnerability handling', 'Safe operational logging', 'Incident exercises']) + card('file', 'Transparent response', 'Contain, investigate, preserve evidence, assess risk, and communicate appropriately.', ['Documented ownership', 'Clear escalation', 'No silent data practice']) + '</div><div class="status-banner support-status">' + icon('lock') + '<div><strong>Security disclosure route pending governance</strong><p>A monitored security contact should be published only after response ownership and handling safeguards are ready.</p></div></div></div></section><section class="page-section trust-section" id="terms"><div class="content-wrap"><p class="section-kicker">04 · Terms</p><h2>Terms must match the service that launches.</h2><p>The supplied publication draft addresses accounts, learners, schools, AI, integrity, public sharing, intellectual property and service boundaries. Read the <a href="/terms/">complete Terms of Service</a>, including every implementation and counsel-review requirement.</p><div class="page-grid">' + card('file', 'Honest service description', 'Describe released, beta, experimental, and planned features accurately.', ['No guarantee of future features', 'No false accreditation', 'No clinical positioning']) + card('users', 'Young learner boundaries', 'Eligibility, consent, public sharing, accounts, and school authority must remain age-appropriate.', ['Private defaults for minors', 'Accessible appeal path', 'No required social profile']) + card('shield', 'Counsel-required review', 'Payments, refunds, liability, governing law, and school terms need market-specific approval.', ['Entity and notice details', 'Update and acceptance process', 'Separate school agreements']) + '</div><div class="callout evidence-callout"><h3>Publication boundary</h3><p>The full Terms page preserves the unresolved entity, market, payment, and governing-law requirements from the supplied document so they can be completed before the terms become operative.</p></div></div></section>');

  const urduHowProcessMap = () => {
    const acts = [
      ['01', 'وضاحت کے ساتھ داخل ہوں', 'منتخب کریں · سمجھیں', 'سیکھنے والا مقصد، کامیابی کی صورت اور خیال تک رسائی کا قابلِ استعمال راستہ دیکھتا ہے۔'],
      ['02', 'یادداشت پر کام کریں', 'یاد کریں · بنائیں · درست کریں', 'سیکھنے والا یاد کرتا، اپنی سوچ واضح کرتا، مخصوص رائے لیتا اور مدد کے بعد خیال دوبارہ بناتا ہے۔'],
      ['03', 'استعمال کریں اور محفوظ رکھیں', 'لاگو کریں · واپس آئیں', 'خیال بامعنی کام میں جاتا ہے، پھر بعد میں واپس آتا ہے تاکہ پیش رفت پائیدار بنے۔']
    ];
    return '<section class="page-section how-process-section" aria-labelledby="how-process-title"><div class="content-wrap"><p class="section-kicker">Type2Learn کا طریقہ</p><h2 id="how-process-title">سات تعلیمی عمل، تین بامقصد مرحلوں میں۔</h2><p>راستہ قابلِ پیش گوئی رہتا ہے، مگر ہر سبق ایک جیسا محسوس نہیں ہوتا۔ مقصد پہلی ہدایت سے بعد کی واپسی تک واضح رہتا ہے۔</p><div class="how-process-map">' + acts.map((act, index) => '<article class="how-act reveal" data-delay="' + index + '"><span class="how-act-number">' + act[0] + '</span><p class="how-act-steps">' + act[2] + '</p><h3>' + act[1] + '</h3><p>' + act[3] + '</p><i aria-hidden="true"></i></article>').join('') + '</div></div></section>';
  };

  const urduHowItWorks = () => {
    const loopItems = [
      ['01', 'منتخب کریں', 'مقصد، ضروری تیاری، وقت کی حد اور اختیارات دیکھیں۔'],
      ['02', 'سمجھیں', 'پڑھیں، سنیں، دیکھیں یا لفظی وضاحت مانگیں۔'],
      ['03', 'یاد کریں', 'مکمل نمونہ سامنے آنے سے پہلے اشارے سے خیال واپس لائیں۔'],
      ['04', 'بنائیں', 'قابلِ رسائی راستے سے ٹائپ کریں، بنائیں، نام دیں، حل کریں یا جواب دیں۔'],
      ['05', 'درست کریں', 'مخصوص رائے لیں اور مدد کے بعد خیال دوبارہ بنائیں۔'],
      ['06', 'استعمال کریں', 'خیال کو نئے مسئلے، جملے، منصوبے یا وضاحت میں استعمال کریں۔'],
      ['07', 'واپس آئیں', 'بعد میں جائزہ لیں اور وقفے کے بعد پرسکون انداز میں وہیں سے شروع کریں۔']
    ];
    return shell(pageHero('طریقۂ کار', 'ایک واضح تعلیمی عمل، پھر ایک مفید اگلا قدم۔', 'Type2Learn شرکت کو مختصر، بامعنی مقاصد کے گرد منظم کرتا ہے۔ طریقہ سیکھنے کو نمایاں کرتا ہے، سیکھنے والے کو ٹائمر، اسکور یا ڈیٹا پوائنٹ نہیں بناتا۔', 'موجودہ حیثیت', 'مرکزی صفحے کی فعال سیکھنے والی سرگرمی ابتدائی نمونہ ہے۔ وسیع تعلیمی راستے منصوبہ بندی میں ہیں۔') + urduHowProcessMap() + '<section class="page-section"><div class="content-wrap"><h2>پہلی ہدایت سے پائیدار واپسی تک ایک چکر۔</h2><p>مصنوعات کام کو واضح بناتی ہے، سیکھنے والے کی محنت محفوظ رکھتی ہے، اور تکمیل تب مانتی ہے جب تعلیمی مقصد کا بامعنی ثبوت موجود ہو۔</p><div class="learning-loop">' + loopItems.map((item) => '<article class="loop-step reveal"><span class="loop-index">' + item[0] + '</span><h3>' + item[1] + '</h3><p>' + item[2] + '</p></article>').join('') + '</div></div></section><section class="page-section is-pale"><div class="content-wrap"><h2>مدد جو کام کے تناسب میں رہے۔</h2><p>بند یا منظم جوابات کو فوری رائے مل سکتی ہے۔ کھلے جوابات کو قطعی درست یا غلط کہنے کے بجائے انسانی جائزے کے لیے رکھا جا سکتا ہے۔</p><div class="page-grid">' + card('file', 'محفوظ پیش رفت', 'خودکار محفوظ کاری اور درست واپسی بامعنی کام کو سنبھالتی ہے۔', ['ٹائپنگ کی حالت اور جواب', 'اشارے، ثبوت اور ابتدائی کام', 'توقف اور واپسی کا راستہ']) + card('sliders', 'سیکھنے والے کے کنٹرولز', 'ترتیبات پیشکش بدلتی ہیں، سیکھنے والے کی علمی قدر نہیں۔', ['حرکت، آواز، متن اور وقفہ', 'ٹائمر اور توجہ کا اختیار', 'لفظی ہدایات اور متبادل']) + card('shield', 'بامعنی دیانت', 'سیکھنے کا ثبوت پوشیدہ نگرانی نہیں بنتا۔', ['ویب کیم یا نظر کی نگرانی نہیں', 'رفتار کی عوامی درجہ بندی نہیں', 'اہم فیصلوں کے لیے انسانی جائزہ']) + '</div></div></section><section class="page-section" id="evidence"><div class="content-wrap"><div class="callout"><h3>“مکمل” کا مطلب</h3><p>سبق تب مکمل ہوتا ہے جب طے شدہ تعلیمی ثبوت دیا جائے، جیسے درست کیا گیا جواب، وضاحت، منتقلی کا کام یا منصوبے کا مرحلہ۔ صرف ٹائمر پورا کرنا، بے ترتیب کلک کرنا یا جواب کھول لینا مقصد نہیں۔</p></div></div></section>');
  };

  const urduPathways = () => shell(pageHero('سیکھنے کے راستے', 'ایک مشترک انجن۔ بامقصد راستے۔', 'پہلی سمت خواندگی پر مبنی، آواز کے ساتھ ایک مکمل کورس ہے۔ لفظ سازی، توجہ کا مرحلہ اور واضح راستہ ایک ہی مواد اور مدد کی بنیاد بانٹتے ہیں مگر مختلف تعلیمی کاموں کے لیے ہیں۔', 'ابتدائی سمت', 'منظم مواد، محفوظ مقامی پیش رفت اور دوبارہ استعمال ہونے والے تعلیمی چکر کے ساتھ خواندگی پہلے۔') + '<section class="page-section"><div class="content-wrap"><h2>تین تجربات، وقار کو مقدم رکھنے والی ایک بنیاد۔</h2><p>تعلیمی سطح، پیشکش کی عمر اور مدد کی ضرورت الگ چیزیں ہیں۔ زیادہ ساخت کی ضرورت کسی سیکھنے والے کو بچگانہ تجربہ قبول کرنے پر مجبور نہیں کرتی۔</p><div class="module-grid">' + moduleCard('book', 'لفظ سازی', 'ڈھالا گیا', 'منظم خواندگی اور تعلیمی الفاظ کی تربیت۔', ['آواز، ساخت اور معنی', 'مدد کم ہونے کے بعد ٹائپنگ', 'درستگی، استعمال اور واپسی'], 'blue') + moduleCard('path', 'توجہ کا مرحلہ', 'ڈھالا گیا', 'واضح منصوبے کے ساتھ محدود جماعتی درجے کا کام۔', ['ایک مقصد', 'اب ← اگلا ← مکمل', 'توقف، وقفہ اور واپسی'], 'teal') + moduleCard('layers', 'واضح راستہ', 'ڈھالا گیا', 'کم پوشیدہ توقعات کے ساتھ مستحکم سبق۔', ['آغاز سے پہلے پیش منظر', 'واضح راستہ اور تبدیلی کی اطلاع', 'حسی اور مدد کے کنٹرولز'], 'green') + '</div></div></section><section class="page-section is-pale"><div class="content-wrap"><h2>پہلا راستہ جان بوجھ کر مختصر ہے۔</h2><p>قابلِ اعتماد پہلی ریلیز ایک بڑے مگر سطحی ذخیرے کے بجائے مکمل تعلیمی چکر ثابت کرتی ہے۔</p><div class="path-grid"><article class="path-card reveal">' + status('پہلا', 'green') + '<div class="path-icon">' + icon('headphones') + '</div><h3>آواز سے رہنمائی والی خواندگی</h3><p>عمر کے احترام کے ساتھ ایک مکمل کورس، جہاں سیکھنے والا سنتا، یاد کرتا، ٹائپ کرتا، درست کرتا، استعمال کرتا اور واپس آتا ہے۔</p></article><article class="path-card reveal" data-delay="1">' + status('بنیاد', 'blue') + '<div class="path-icon">' + icon('keyboard') + '</div><h3>دوبارہ استعمال ہونے والا جوابی انجن</h3><p>منظم مواد، درست جوابی راستے، واضح رائے اور محفوظ پیش رفت۔</p></article><article class="path-card reveal" data-delay="2">' + status('منصوبہ شدہ توسیع', 'amber') + '<div class="path-icon">' + icon('layers') + '</div><h3>مضمون اور مدد کے راستے</h3><p>لوگوں کے ساتھ آزمائش اور مواد کے جائزے کے بعد نیا مواد اور مخصوص طریقے شامل کیے جائیں گے۔</p></article></div></div></section>');

  const urduLearners = () => shell(pageHero('سیکھنے والوں کے لیے', 'آپ کی سیکھائی۔ آپ کے کنٹرولز۔ آپ کا اگلا قدم۔', 'Type2Learn کام کو واضح بنانے کے لیے ہے، آپ کے بارے میں اندازے لگانے کے لیے نہیں۔ جو مدد کرے اسے منتخب کریں، پیش رفت محفوظ رکھیں، اور وقفے کے بعد بغیر شرمندگی واپس آئیں۔', 'بطورِ ڈیفالٹ نجی', 'ترتیبات سیکھنے والے کے کنٹرولز ہیں، تشخیص یا عوامی اسکور نہیں۔') + '<section class="page-section"><div class="content-wrap"><h2>ہر بنیادی اسکرین کو کن سوالوں کا جواب دینا چاہیے؟</h2><p>میں ابھی کیا کر رہا ہوں، اس کے بعد کیا ہے، کیا مکمل ہو چکا ہے، اور اگر یہ پیشکش کام نہیں کر رہی تو میں کیا بدل سکتا ہوں؟</p><div class="page-grid">' + card('path', 'راستہ جانیں', 'ایک موجودہ عمل نمایاں رہتا ہے؛ اگلا اور مکمل دکھائی دیتے مگر پرسکون رہتے ہیں۔', ['واضح مقصد', 'تکمیل کی نظر آنے والی شرط', 'کوئی اچانک مرحلہ نہیں']) + card('sliders', 'مدد منتخب کریں', 'کریڈٹ یا تعلیمی رسائی کھوئے بغیر پیشکش بدلیں۔', ['متن، وقفہ اور تضاد', 'آواز، حرکت اور حسی اختیارات', 'لفظی ہدایات اور مثالیں']) + card('pause', 'رکیں اور واپس آئیں', 'توقف، اخراج یا بعد کی واپسی پر کام محفوظ رہتا ہے۔', ['بالکل وہی واپسی کی حالت', 'سزا دینے والا سلسلہ نہیں', 'پرسکون واپسی']) + '</div></div></section><section class="page-section is-pale"><div class="content-wrap"><div class="support-panel"><p class="section-kicker">سیکھنے والوں سے وعدہ</p><h2>واضح سیکھنے کے تجربے کے لیے ہم آپ سے کسی لیبل کا ثبوت نہیں مانگیں گے۔</h2><p>وہ ترتیبات استعمال کریں جو شرکت میں مدد دیں۔ آپ کے مدد کے اختیارات بطورِ ڈیفالٹ نجی رہیں اور آپ کے علم کی قدر کبھی کم نہ کریں۔</p><div class="inline-actions">' + button('اب آزمائیں', '/login/', 'primary') + button('طریقہ دیکھیں', '/ur/how-it-works/', 'secondary') + '</div></div></div></section>');

  const urduFamilies = () => shell(pageHero('خاندانوں کے لیے', 'ایسی پیش رفت جو سمجھ آئے — مستقل نگرانی کے بغیر۔', 'Type2Learn آغاز، بامعنی کام جاری رکھنے اور وقفے کے بعد واپسی کی رکاوٹ کم کرتا ہے۔ یہ انسانی تعلقات، پیشہ ورانہ مدد یا خاندانی فیصلے کی جگہ نہیں لیتا۔', 'اکاؤنٹ کے مناظر', 'خاندانی رپورٹس اور اکاؤنٹ کنٹرولز منصوبہ بندی میں ہیں اور واضح اجازتوں کے ساتھ نافذ ہوں گے۔') + '<section class="page-section"><div class="content-wrap"><h2>گھر میں مددگار روٹین، دباؤ نہیں۔</h2><p>خاندان کے لیے معلومات مقررہ سیکھائی، بامعنی تکمیل، آئندہ جائزے اور ایک مفید روٹین پر مرکوز ہوں — نجی ابتدائی جوابات یا رویے کی تشریح کی مسلسل نگرانی پر نہیں۔</p><div class="page-grid">' + card('home', 'محفوظ کام کھولیں', 'مددگار اشارہ یہ ہے کہ نظر آنے والا “اب” پڑھیں اور محفوظ مرحلے پر واپس جائیں۔', ['زبردستی طویل نشست نہیں', 'پرسکون دوبارہ آغاز', 'سیکھنے والے کا واضح اختیار']) + card('shield', 'بطورِ ڈیفالٹ نجی', 'ذاتی ترتیبات، تاثرات اور نامکمل کوششیں خاندانی نگرانی کا ذریعہ نہیں بنتیں۔', ['اجازت کے مطابق اشتراک', 'اشتہاری پروفائل نہیں', 'عمر کے مطابق بنیادی ترتیب']) + card('message', 'سیکھائی کے بارے میں پوچھیں', 'مفید سوال یہ ہے کہ کیا سیکھا، درست کیا یا استعمال کیا گیا — نہ کہ توجہ ہر لمحہ کامل تھی یا نہیں۔', ['احترام والی زبان', 'کمی پر مبنی انداز نہیں', 'واضح مدد کا راستہ']) + '</div></div></section><section class="page-section is-pale"><div class="content-wrap"><div class="callout"><h3>اہم حد</h3><p>Type2Learn ایک تعلیمی مصنوعات ہے۔ یہ تشخیص یا علاج نہیں کرتا اور پیشہ ورانہ جانچ، سہولت، ادویات، نگہداشت، نیند یا انسانی مدد کی جگہ نہیں لیتا۔</p></div></div></section>');

  const urduSchools = () => shell(pageHero('اسکولوں کے لیے', 'بامعنی ثبوت۔ واضح حفاظت۔ نگرانی کا اسکور نہیں۔', 'استاد کا منظر تعلیمی کام، استعمال شدہ مدد، درستگی، تکمیل اور جائزے کی ضرورت الگ دکھانے کے لیے ہے۔ یہ سیکھنے والے کو توجہ کے فیصد یا رویے کی درجہ بندی میں تبدیل نہیں کرتا۔', 'اسکولی تیاری', 'اسکول میں نفاذ منصوبہ بندی میں ہے اور الگ معاہدے، کردار کے کنٹرولز، رازداری کے جائزے اور رسائی کی تیاری کا تقاضا کرتا ہے۔') + '<section class="page-section"><div class="content-wrap"><h2>مجاز اساتذہ کو کیا دیکھنا چاہیے؟</h2><p>رپورٹنگ تب مفید ہے جب وہ پڑھانے، کام بدلنے یا انسانی جائزے کی درست وجہ پہچاننے میں مدد دے۔</p><div class="page-grid">' + card('file', 'تعلیمی ثبوت', 'حتمی کام، منتخب ثبوت، حکمت عملی اور منتقلی قابلِ جائزہ ہوں۔', ['مقصد کی سطح پر پیش رفت', 'اجازت کے مطابق حتمی کام', 'استاد کے جائزے والی حالت']) + card('sliders', 'مدد کا تناظر', 'رپورٹ دکھا سکتی ہے کہ کس مدد نے فائدہ دیا، اسے منفی رویے کے اسکور میں بدلے بغیر۔', ['اشارے اور درستگی کی سطح', 'قابلِ رسائی جوابی راستہ', 'توقف یا واپسی کی حالت']) + card('shield', 'واضح حدود', 'براہِ راست کی اسٹروک فیڈ، ویب کیم، نظر کی نگرانی یا کلاس روم فرمانبرداری کا اسکور نہیں۔', ['کردار پر مبنی رسائی', 'قابلِ جانچ ریکارڈ', 'انسانی اختیار']) + '</div></div></section><section class="page-section is-pale"><div class="content-wrap"><h2>اسکولی ڈیٹا سے پہلے نفاذ کی شرائط۔</h2><table class="plain-table"><thead><tr><th>حلقہ</th><th>ضروری سمت</th></tr></thead><tbody><tr><td>ڈیٹا</td><td>اسکول کا طے شدہ مقصد، کردار کی حدود، برآمد و حذف کے راستے، اور مناسب ڈیٹا معاہدہ۔</td></tr><tr><td>رسائی</td><td>WCAG 2.2 AA کا ہدف اور معاون ٹیکنالوجی استعمال کرنے والوں کے ساتھ عملی جانچ۔</td></tr><tr><td>حفاظت</td><td>وسیع طلبہ استعمال سے پہلے واضح شکایت، واقعہ اور رازداری کا عمل۔</td></tr><tr><td>دعوے</td><td>صرف جاری شدہ نصاب اور ماپے گئے نتائج؛ بغیر ثبوت اثر پذیری کا دعویٰ نہیں۔</td></tr></tbody></table></div></section>');

  const urduTeamDeck = () => {
    const members = [
      ['Muhammad Taha Bin Zaeem', 'بانی · مصنوعات کی سمت', '/assets/team/founder-muhammad-taha.webp', 'Type2Learn کے بانی Muhammad Taha Bin Zaeem', 'supplied', 'وہ Type2Learn کے وژن، مصنوعات کی سمت، شراکت داریوں اور ذمہ دار ترقی کی رہنمائی کرتے ہیں، اور سیکھنے کے تجربے کو ثبوت، رازداری، رسائی اور سیکھنے والے کے وقار کے واضح معیار سے جوڑتے ہیں۔', 'تعلیمی ٹیکنالوجی اگلا بامعنی قدم واضح کرے، سیکھنے والے کو چھوٹا محسوس نہ کرائے۔', ['وژن اور حکمتِ عملی', 'سیکھنے کا تجربہ', 'ذمہ دار ترقی']],
      ['Muhammad Hamiz Bin Kashif', 'شریک بانی · انجینئرنگ', '/assets/team/muhammad-hamiz-bin-kashif-studio.webp', 'سرمئی اسٹوڈیو پس منظر میں Type2Learn کے انجینئرنگ سربراہ Muhammad Hamiz Bin Kashif', 'edited', 'ان کا کردار قابلِ اعتماد انجینئرنگ، محفوظ پیش رفت، رسائی، محفوظ ترسیل اور تعلیمی رکاوٹ کے بعد پرسکون بحالی پر مرکوز ہے۔', 'مضبوط نظام وہ ہے جو ہر سیکھنے والے کو اپنی حاصل شدہ پیش رفت محفوظ رکھنے دے۔', ['انجینئرنگ نظام', 'محفوظ پیش رفت', 'قابلِ اعتماد ترسیل']],
      ['Idrees Babar', 'شریک بانی · تحقیق', '/assets/team/idrees-babar-studio.webp', 'سرمئی اسٹوڈیو پس منظر میں Type2Learn کے تحقیقی سربراہ Idrees Babar', 'edited', 'ان کا کردار ثبوت کے جائزے، تحقیق کے ڈیزائن، پیمائش کے معیار اور دیانت دار عوامی دعووں کو مصنوعات کے فیصلوں سے جوڑتا ہے۔', 'ثبوت تب سب سے زیادہ اہم ہوتا ہے جب وہ ہمارے بنائے ہوئے کام اور دعووں کو بدلتا ہے۔', ['ثبوت کا جائزہ', 'آزمائش کا ڈیزائن', 'پیمائش کا معیار']],
      ['Muhammad Fahad Younus', 'شریک بانی · AI', '/assets/team/muhammad-fahad-younus-studio.webp', 'سرمئی اسٹوڈیو پس منظر میں Type2Learn کے AI سربراہ Muhammad Fahad Younus', 'edited', 'ان کا کردار ذمہ دار AI سمت، ماڈل کی جانچ، مؤثر انسانی نگرانی اور خودکار مدد کو تعلیمی مقصد کے مطابق رکھنے پر مرکوز ہے۔', 'ذہین مدد انسانی فیصلے کو مضبوط کرے، خاموشی سے اس کی جگہ نہ لے۔', ['ذمہ دار AI', 'ماڈل کی جانچ', 'انسانی نگرانی']],
      ['Alizay Hassan', 'شریک بانی · مصنوعات', '/assets/team/alizay-hassan-figure.webp', 'Alizay Hassan کے پروفائل کی نمائندگی کرنے والی واضح طور پر غیر انسانی سرمئی 3D شکل', 'placeholder', 'ان کا کردار مصنوعات کی حکمتِ عملی، مشترکہ ڈیزائن، پروگرام کی وضاحت اور عمر کے احترام والی تجرباتی ترتیب کو ایک مربوط سفر میں لاتا ہے۔', 'واضح مصنوعات ہر سیکھنے والے کو آغاز، جاری رکھنے اور واپسی کا باوقار راستہ دیتی ہے۔', ['مصنوعات کی حکمتِ عملی', 'مشترکہ ڈیزائن', 'پروگرام کی وضاحت']]
    ];
    const statusLabel = { supplied: 'فراہم کردہ تصویر', edited: 'فراہم کردہ تصویر سے تیار کردہ پورٹریٹ', placeholder: 'غیر انسانی متبادل تصویر' };
    const cards = members.map((member, index) => '<article class="team-profile-card' + (index === 0 ? ' is-active' : '') + ' has-' + member[4] + '" data-team-card="' + index + '" aria-hidden="' + (index === 0 ? 'false' : 'true') + '"><figure class="team-profile-portrait"><img src="' + member[2] + '" alt="' + member[3] + '" width="960" height="1200" loading="lazy" decoding="async"><figcaption class="portrait-status is-' + member[4] + '">' + statusLabel[member[4]] + '</figcaption></figure><div class="team-profile-copy"><p class="section-kicker">' + member[1] + '</p><h2 lang="en">' + member[0] + '</h2><p class="team-profile-statement">“' + member[6] + '”</p><p>' + member[5] + '</p><div class="team-profile-responsibilities">' + member[7].map((item) => '<span>' + item + '</span>').join('') + '</div></div></article>').join('');
    return '<section class="page-section team-deck-section" aria-labelledby="team-deck-title"><div class="content-wrap"><div class="team-deck-intro"><p class="section-kicker">Type2Learn بنانے والے لوگ</p><h2 id="team-deck-title">مختلف شعبے۔ ایک جواب دہ مقصد۔</h2><p>بانی پہلے ہیں، پھر انجینئرنگ، تحقیق، AI اور مصنوعات کو تشکیل دینے والے شریک بانی۔ تیار کردہ تصاویر واضح نشان زد ہیں اور غیر انسانی پروفائل شکل صاف طور پر بیان کی گئی ہے۔</p></div><div class="team-deck" data-team-deck data-scroll-stops="' + members.length + '"><div class="team-deck-position" aria-live="polite"><span id="team-card-current">01</span><i></i><span>' + String(members.length).padStart(2, '0') + '</span></div><div class="team-card-stack">' + cards + '</div><p class="team-deck-instruction"><span>اسکرول یا ڈریگ کریں</span> تاکہ ٹیم کے کارڈ بدلیں</p></div></div></section>';
  };

  const urduTeam = () => shell(pageHero('ٹیم', 'سیکھنے والوں کے ساتھ تعمیر۔ جواب دہ قیادت۔', 'Type2Learn مصنوعات، تحقیق، رسائی اور انجینئرنگ کو فعال سیکھنے کے گرد جوڑتا ہے جو مختلف ذہنوں اور اعتماد تک مختلف راستوں کا احترام کرے۔', 'پروفائل کا معیار', 'بانی کی تصویر فراہم کردہ ہے۔ شریک بانیوں کی تیار کردہ تصاویر اور غیر انسانی متبادل واضح طور پر نشان زد ہیں۔') + urduTeamDeck() + '<section class="page-section is-pale"><div class="content-wrap"><div class="support-panel"><p class="section-kicker">لوگوں کے ساتھ، ان کے لیے نہیں</p><h2>شرکت کو مصنوعات بدلنی چاہیے۔</h2><p>سیکھنے والے، اساتذہ، خاندان، رسائی کے ماہرین اور پیشہ ور افراد رکاوٹیں پہچاننے، راستے آزمانے، زبان کا جائزہ لینے اور تبدیلی طے کرنے میں شامل ہوں۔ شرکت رضاکارانہ، محفوظ، قابلِ رسائی اور مناسب طور پر تسلیم شدہ ہو۔</p><div class="support-items"><div class="support-item"><strong>سنیں</strong><span>حقیقی رکاوٹوں، روٹین اور مقاصد سے آغاز کریں۔</span></div><div class="support-item"><strong>نمونہ بنائیں</strong><span>زبان، راستہ، حسی بوجھ اور افادیت آزمائیں۔</span></div><div class="support-item"><strong>پیمائش کریں</strong><span>رفتار سے آگے سمجھ اور خودمختاری دیکھیں۔</span></div><div class="support-item"><strong>حدود شائع کریں</strong><span>ثبوت، اندازہ، نمونہ اور منصوبہ الگ رکھیں۔</span></div></div></div></div></section>');

  const urduCommunity = () => shell(pageHero('کمیونٹی', 'ایسا سوال، خیال یا چیلنج لائیں جو سیکھنے کو بہتر کرے۔', 'Type2Learn سیکھنے والوں، خاندانوں، اساتذہ، ماہرین، محققین اور شراکت داروں کے ساتھ احترام والی شراکت سے بڑھنا چاہتا ہے۔ عام تعلیمی خصوصیات کے لیے کسی عوامی سوشل پروفائل کی ضرورت نہیں۔', 'سرکاری چینلز', 'Type2Learn کو LinkedIn پر فالو کریں اور GitHub پر ادارے کے عوامی کام کو دیکھیں۔') + '<section class="page-section"><div class="content-wrap"><h2>مختلف مہارت، ایک معیار: سیکھنے والے کا احترام۔</h2><p>شراکت کو مصنوعات کے فیصلے بہتر کرنے چاہئیں، نہ کہ کسی کی ذاتی معلومات کو تشہیری بیان میں بدلنا چاہیے۔</p><div class="page-grid">' + card('users', 'زندہ تجربہ', 'رائے رکاوٹیں پہچان سکتی، کنٹرولز آزما سکتی اور مفروضوں کو چیلنج کر سکتی ہے۔', ['رضاکارانہ شرکت', 'عوامی نام ضروری نہیں', 'تشخیص بتانے کا دباؤ نہیں']) + card('school', 'تعلیمی عمل', 'اساتذہ اور اسکول رہنما نصابی مناسبت، وضاحت اور روزمرہ عمل آزما سکتے ہیں۔', ['واضح نفاذی سوالات', 'عمر کے احترام والا مواد', 'اجازت کے بغیر دعوے نہیں']) + card('flask', 'تحقیق اور رسائی', 'ماہرین ثبوت، زبان، پیمائش، رسائی اور حفاظت کا جائزہ لے سکتے ہیں۔', ['مناسب دائرہ', 'جہاں ممکن ہو معاوضہ', 'قابلِ سراغ فیصلے']) + '</div></div></section><section class="page-section is-pale"><div class="content-wrap"><div class="status-banner community-social-banner">' + icon('message') + '<div><strong>Type2Learn کے سرکاری چینلز سے جڑیں</strong><p>ادارے کی تازہ معلومات کے لیے <a href="https://www.linkedin.com/company/type2learn/" target="_blank" rel="noopener noreferrer">LinkedIn<span class="sr-only"> (نئے ٹیب میں کھلتا ہے)</span></a> فالو کریں یا <a href="https://github.com/Type2Learn" target="_blank" rel="noopener noreferrer">GitHub<span class="sr-only"> (نئے ٹیب میں کھلتا ہے)</span></a> پر عوامی ذخیرے دیکھیں۔ سیکھنے والوں کے لیے زیرِ نگرانی مدد کا چینل ابھی تیاری میں ہے۔</p></div></div></div></section><section class="page-section" id="support"><div class="content-wrap"><h2>مدد کا اختتام ایک پرسکون اگلے قدم پر ہونا چاہیے۔</h2><p>مدد سادہ، قابلِ رسائی اور اصل مصنوعات کی حالت سے جڑی رہے۔ رکاوٹ سے نکلنے کے لیے صرف ضروری معلومات مانگی جائیں۔</p><div class="page-grid">' + card('home', 'آغاز', 'راستہ منتخب کریں، کنٹرولز بدلیں، پہلا مقصد سمجھیں اور محفوظ انداز میں شروع کریں۔', ['نمونہ کیا کرتا ہے', 'ترتیبات کہاں ہیں', 'پیش منظر دوبارہ کیسے شروع ہو']) + card('sliders', 'کنٹرولز اور رسائی', 'حرکت، آواز، متن، وقفہ، توجہ، لفظی ہدایات اور جوابی اختیارات استعمال کریں۔', ['کی بورڈ مدد', 'توقف اور واپسی', 'قابلِ رسائی بحالی']) + card('shield', 'رازداری اور رہنمائی', 'بغیر ضرورت سے زیادہ ذاتی معلومات دیے جانیں کہ خاندان، اسکول یا ذمہ دار مدد کب شامل ہو۔', ['رازداری کی درخواست', 'رسائی کی رکاوٹ', 'اسکولی مدد کی ذمہ داری']) + '</div></div></section>');

  const urduTrust = () => shell(pageHero('اعتماد', 'رسائی، رازداری، سکیورٹی اور شرائط کے لیے ایک واضح جگہ۔', 'اعتماد کی معلومات آسانی سے ملنی چاہئیں اور موجودہ خدمت کے مطابق ہوں۔ یہ مرکز موجودہ پیش منظر اور ان تقاضوں کو الگ رکھتا ہے جن پر ابھی نفاذ یا قانونی جائزہ باقی ہے۔', 'اشاعت کی حیثیت', 'مصنوعات کے تقاضے واضح دکھائے گئے ہیں۔ حتمی قانونی نوٹس اور زیرِ نگرانی رپورٹنگ کے راستے جائزے کے منتظر ہیں۔') + '<section class="page-section trust-overview"><div class="content-wrap"><h2>چار وعدے۔ ایک جواب دہ معیار۔</h2><p>یہاں دیکھیں کہ Type2Learn رسائی، ڈیٹا، حفاظت اور خدمت کی حدود کو کیسے دیکھتا ہے۔</p><nav class="trust-index" aria-label="اعتماد کے حصے"><a href="#accessibility"><span>01</span>رسائی</a><a href="/privacy/"><span>02</span>رازداری پالیسی <small lang="en">English</small></a><a href="#security"><span>03</span>سکیورٹی</a><a href="/terms/"><span>04</span>سروس کی شرائط <small lang="en">English</small></a></nav></div></section><section class="page-section is-pale trust-section" id="accessibility"><div class="content-wrap"><p class="section-kicker">01 · رسائی</p><h2>رسائی بنیادی شرط ہے، اضافی خصوصیت نہیں۔</h2><p>Type2Learn کا ہدف WCAG 2.2 AA اور معاون ٹیکنالوجی استعمال کرنے والوں کے ساتھ عملی جانچ ہے۔ کی بورڈ، مفید زوم اور ری فلو، قابلِ فہم حالت اور کم حرکت کے متبادل مصنوعات کی شرط ہیں۔</p><div class="page-grid">' + card('keyboard', 'استعمال کریں', 'بنیادی کام واضح فوکس، منطقی ترتیب اور لمس کے لیے محفوظ اہداف کے ساتھ کی بورڈ سے چلیں۔', ['صرف ماؤس والا کام نہیں', 'باریک ڈریگ ضروری نہیں', 'نام والے کنٹرولز اور حالت']) + card('eye', 'دیکھیں اور سمجھیں', 'متن کے کنٹرولز، تضاد، کیپشن اور رنگ سے آزاد معنی کے ساتھ مواد واضح رہے۔', ['زوم پر قابلِ مطالعہ', 'ضروری معلومات حرکت پر منحصر نہیں', 'آواز سے آزاد']) + card('message', 'ہدایات سمجھیں', 'ہدایات، غلطیاں، تکمیل اور واپسی واضح اور معاون ٹیکنالوجی کے لیے قابلِ فہم رہیں۔', ['لفظی انداز', 'واضح تکمیل کی شرط', 'مفید بحالی کے پیغامات']) + '</div></div></section><section class="page-section trust-section" id="privacy"><div class="content-wrap"><p class="section-kicker">02 · رازداری</p><h2>کم جمع کریں۔ صاف بتائیں۔</h2><p>مقصد کم سے کم ڈیٹا، نجی تعلیمی کام، محدود مقصد والے پیش رفت ریکارڈ، ہدفی اشتہارات سے اجتناب اور سیکھنے والے کے ڈیٹا کی فروخت نہ کرنا ہے۔ موجودہ عوامی سائٹ استعمال کی پیمائش کے لیے Cloudflare Web Analytics اور Google Analytics استعمال کرتی ہے؛ مقامی سرگرمی کا جواب ان ٹیگز کو نہیں بھیجا جاتا۔ مکمل اشاعتی مسودے اور نفاذی تقاضوں کے لیے <a href="/privacy/">Privacy Policy <span lang="en">(English)</span></a> پڑھیں۔</p><div class="page-grid">' + card('shield', 'ڈیٹا کی حد', 'صرف وہ معلومات جمع کریں جو سیکھنے، پیش رفت محفوظ کرنے، اکاؤنٹ محفوظ رکھنے اور منتخب کنٹرولز کے لیے ضروری ہوں۔', ['بطورِ ڈیفالٹ نجی', 'تشخیص کا اندازہ نہیں', 'واضح مدتِ تحفظ']) + card('lock', 'کم عمر سیکھنے والے', 'رضامندی، اسکولی اختیار، کردار کی رسائی، برآمد اور حذف اصل جغرافیہ اور خدمت کے مطابق ہوں۔', ['عمر کے مطابق ترتیب', 'اجازت کے مطابق اشتراک', 'اشتہاری پروفائل نہیں']) + card('school', 'اسکولی کنٹرولز', 'اسکولی نفاذ کے لیے واضح تعلیمی مقصد، رسائی کی حد اور مناسب ڈیٹا معاہدہ ضروری ہے۔', ['اسکول کے اختیار والے ریکارڈ', 'برآمد اور حذف', 'واضح واقعہ عمل']) + '</div></div></section><section class="page-section is-pale trust-section" id="security"><div class="content-wrap"><p class="section-kicker">03 · سکیورٹی</p><h2>سیکھنے کی حفاظت قابلِ جائزہ کنٹرولز سے کریں۔</h2><p>مطلوبہ سمت کم ترین اختیار، محفوظ انجینئرنگ، محفوظ لاگنگ، انحصارات کا جائزہ، بحالی کی منصوبہ بندی اور واضح واقعہ سنبھالنا ہے۔ یہ تقاضے ہیں، سرٹیفیکیشن کے دعوے نہیں۔</p><div class="page-grid">' + card('lock', 'رسائی کا اختیار', 'کردار کی حدود، منفرد اکاؤنٹس، بااختیار رسائی کی حفاظت، جائزہ ریکارڈ اور فوری اخراج۔', ['استاد اور اسکول کی علیحدگی', 'کم ترین اختیار', 'انسانی جائزہ']) + card('shield', 'محفوظ ترسیل', 'محفوظ نقل و ذخیرہ، رازوں کی حفاظت، انحصارات کی نگرانی، بیک اپ اور بحالی۔', ['کمزوری کا عمل', 'محفوظ عملی لاگنگ', 'واقعہ مشق']) + card('file', 'واضح ردعمل', 'واقعہ محدود کریں، تحقیق کریں، ثبوت محفوظ کریں، خطرہ جانچیں اور مناسب رابطہ کریں۔', ['واضح ذمہ داری', 'درست رہنمائی', 'پوشیدہ ڈیٹا عمل نہیں']) + '</div></div></section><section class="page-section trust-section" id="terms"><div class="content-wrap"><p class="section-kicker">04 · شرائط</p><h2>شرائط جاری ہونے والی اصل خدمت کے مطابق ہوں۔</h2><p>فراہم کردہ اشاعتی مسودہ اکاؤنٹس، سیکھنے والوں، اسکولوں، AI، دیانت، عوامی اشتراک، فکری ملکیت اور خدمت کی حدود بیان کرتا ہے۔ تمام نفاذی اور قانونی جائزے کے تقاضوں سمیت مکمل <a href="/terms/">Terms of Service <span lang="en">(English)</span></a> پڑھیں۔</p><div class="callout evidence-callout"><h3>اشاعت کی حد</h3><p>قانونی ادارہ، منڈیاں، ادائیگی اور قانون کے انتخاب جیسے حل طلب امور مکمل ہونے تک یہ مسودات حتمی یا نافذ العمل شرائط نہیں ہیں۔</p></div></div></section>');

  const coDesign = () => shell(
    pageHero(
      'Co-design',
      'Neurodivergent voices should change the product—not decorate it.',
      'Type2Learn is being designed to involve neurodivergent learners, educators, families, accessibility specialists, learning professionals, and researchers through structured, safeguarded participation.',
      'Current status',
      'The participation model is being prepared. Type2Learn does not yet claim completed external co-design findings or clinical validation.'
    ) +
    '<section class="page-section codesign-overview"><div class="content-wrap"><p class="section-kicker">Who the process is intended to involve</p><h2>Different experience. Shared authority over the decisions that matter.</h2><p>Participation should include people affected by the learning experience and people responsible for safe, accessible educational practice. A contributor is not described as a team member, advisor, or validator unless that relationship has been explicitly agreed.</p><div class="codesign-roster"><article><span>01</span><h3>Neurodivergent learners</h3><p>People with dyslexia, ADHD, autism, and other learning or access experiences, without requiring a diagnosis or public disclosure.</p></article><article><span>02</span><h3>Families and educators</h3><p>People who understand everyday learning routines, classroom constraints, transitions, support, and re-entry after interruption.</p></article><article><span>03</span><h3>Relevant professionals</h3><p>Accessibility specialists, special-education professionals, learning professionals, and learning-science researchers whose actual contribution is clearly described.</p></article></div></div></section>' +
    '<section class="page-section is-pale"><div class="content-wrap"><p class="section-kicker">What contributors are intended to influence</p><h2>Feedback belongs next to the product decision.</h2><div class="codesign-influence"><article><span>01</span><div><h3>Learning structure</h3><p>Objectives, step order, retrieval cues, correction, application, review, and what counts as meaningful completion.</p></div></article><article><span>02</span><div><h3>Access and sensory control</h3><p>Text, spacing, read-aloud, motion, sound, timing, literal instructions, alternative input, pause, and return.</p></div></article><article><span>03</span><div><h3>Language and feedback</h3><p>Whether instructions are understandable, feedback is respectful, and recovery offers a useful next action without shame.</p></div></article><article><span>04</span><div><h3>Navigation and pacing</h3><p>What stays predictable, what changes visibly, how progress is protected, and how a learner resumes after interruption.</p></div></article></div></div></section>' +
    '<section class="page-section"><div class="content-wrap"><p class="section-kicker">Participation standard</p><h2>Consent, privacy, safeguarding, access, and recognition come first.</h2><div class="codesign-standard"><div><strong>Before a session</strong><p>Define the purpose, participant role, age-appropriate consent or assent, safeguarding owner, accessibility needs, information collected, retention, withdrawal, and whether compensation is offered.</p></div><div><strong>During a session</strong><p>Use accessible tasks, allow breaks and alternative response routes, collect only necessary information, avoid diagnosis pressure, and never turn feedback into a hidden learner score.</p></div><div><strong>After a session</strong><p>Record the decision, publish an appropriately de-identified change note, explain what did not change and why, and keep contributors distinct from formal staff or clinical validators.</p></div></div></div></section>' +
    '<section class="page-section is-pale"><div class="content-wrap"><p class="section-kicker">Public decision ledger</p><h2>Completed, underway, and planned must remain visibly different.</h2><dl class="codesign-ledger"><div><dt>Published findings</dt><dd><strong>None yet.</strong> No completed external neurodivergent co-design findings are currently claimed on this site.</dd></div><div><dt>In preparation</dt><dd>Participation criteria, consent and safeguarding routes, accessible feedback formats, decision records, and contributor recognition.</dd></div><div><dt>Planned</dt><dd>Structured review and task testing with neurodivergent learners and relevant education and accessibility professionals before outcome claims are made.</dd></div></dl><div class="callout evidence-callout"><h3>Truthful boundary</h3><p>General feedback does not create clinical validation, research evidence, endorsement, or a formal advisory role. Those claims require their own explicit process and documentation.</p></div><p class="codesign-contact">Neurodivergent people and relevant professionals interested in future participation can contact <a href="mailto:contact@type2learn.tech">contact@type2learn.tech</a>. Contact does not create an enrolment, advisory, or employment relationship.</p></div></section>'
  );

  const urduCoDesign = () => shell(
    pageHero(
      'مشترکہ ڈیزائن',
      'نیوروڈائیورجینٹ آوازیں مصنوعات کا فیصلہ بدلیں—صرف سجاوٹ نہ بنیں۔',
      'Type2Learn کو اس طرح ڈیزائن کیا جا رہا ہے کہ نیوروڈائیورجینٹ سیکھنے والے، اساتذہ، خاندان، رسائی کے ماہرین، تعلیمی پیشہ ور افراد اور محققین منظم اور محفوظ شرکت کے ذریعے اس کی تشکیل میں حصہ لے سکیں۔',
      'موجودہ حیثیت',
      'شرکت کا طریقہ تیار کیا جا رہا ہے۔ Type2Learn ابھی مکمل بیرونی مشترکہ ڈیزائن کے نتائج یا طبی توثیق کا دعویٰ نہیں کرتا۔'
    ) +
    '<section class="page-section codesign-overview"><div class="content-wrap"><p class="section-kicker">کن لوگوں کو شامل کرنے کا ارادہ ہے</p><h2>مختلف تجربہ۔ اہم فیصلوں پر مشترکہ اختیار۔</h2><p>شرکت میں وہ لوگ شامل ہونے چاہئیں جو سیکھنے کے تجربے سے براہِ راست متاثر ہوتے ہیں اور وہ لوگ جو محفوظ، قابلِ رسائی تعلیمی عمل کے ذمہ دار ہیں۔ کسی شریک کو ٹیم ممبر، مشیر یا توثیق کنندہ نہیں کہا جائے گا جب تک یہ تعلق واضح طور پر طے نہ ہو۔</p><div class="codesign-roster"><article><span>01</span><h3>نیوروڈائیورجینٹ سیکھنے والے</h3><p>ڈسلیکسیا، ADHD، آٹزم اور دیگر تعلیمی یا رسائی کے تجربات رکھنے والے افراد—تشخیص یا عوامی انکشاف ضروری نہیں۔</p></article><article><span>02</span><h3>خاندان اور اساتذہ</h3><p>وہ لوگ جو روزمرہ تعلیمی معمول، جماعتی حدود، تبدیلیوں، مدد اور وقفے کے بعد واپسی کو سمجھتے ہیں۔</p></article><article><span>03</span><h3>متعلقہ پیشہ ور افراد</h3><p>رسائی کے ماہرین، خصوصی تعلیم کے پیشہ ور افراد، تعلیمی ماہرین اور سیکھنے کی سائنس کے محققین—جن کی اصل شراکت واضح طور پر بیان کی جائے۔</p></article></div></div></section>' +
    '<section class="page-section is-pale"><div class="content-wrap"><p class="section-kicker">شراکت دار کن فیصلوں پر اثر ڈال سکیں گے</p><h2>رائے کو مصنوعات کے فیصلے کے ساتھ جوڑا جائے۔</h2><div class="codesign-influence"><article><span>01</span><div><h3>سیکھنے کی ساخت</h3><p>مقاصد، مراحل کی ترتیب، یادداشت کے اشارے، درستگی، استعمال، دہرائی اور بامعنی تکمیل کی شرط۔</p></div></article><article><span>02</span><div><h3>رسائی اور حسی کنٹرول</h3><p>متن، وقفہ، بلند آواز سے پڑھنا، حرکت، آواز، وقت، لفظی ہدایات، متبادل جواب، توقف اور واپسی۔</p></div></article><article><span>03</span><div><h3>زبان اور رائے</h3><p>کیا ہدایات قابلِ فہم، رائے باعزت، اور بحالی شرمندگی کے بغیر ایک مفید اگلا قدم دیتی ہے۔</p></div></article><article><span>04</span><div><h3>نیویگیشن اور رفتار</h3><p>کیا مستقل رہتا ہے، تبدیلی کیسے واضح ہوتی ہے، پیش رفت کیسے محفوظ ہوتی ہے، اور وقفے کے بعد واپسی کیسے ہوتی ہے۔</p></div></article></div></div></section>' +
    '<section class="page-section"><div class="content-wrap"><p class="section-kicker">شرکت کا معیار</p><h2>رضامندی، رازداری، حفاظت، رسائی اور مناسب شناخت پہلے آتے ہیں۔</h2><div class="codesign-standard"><div><strong>سیشن سے پہلے</strong><p>مقصد، شریک کا کردار، عمر کے مطابق رضامندی، حفاظتی ذمہ دار، رسائی کی ضروریات، جمع ہونے والی معلومات، مدتِ تحفظ، واپسی اور معاوضے کی حیثیت واضح کریں۔</p></div><div><strong>سیشن کے دوران</strong><p>قابلِ رسائی کام دیں، وقفہ اور متبادل جواب کی اجازت دیں، صرف ضروری معلومات جمع کریں، تشخیص کا دباؤ نہ ڈالیں، اور رائے کو پوشیدہ اسکور نہ بنائیں۔</p></div><div><strong>سیشن کے بعد</strong><p>فیصلہ درج کریں، مناسب طور پر غیر شناخت شدہ تبدیلی کا نوٹ شائع کریں، جو نہ بدلا اس کی وجہ بتائیں، اور شراکت داروں کو رسمی عملے یا طبی توثیق کنندگان سے الگ رکھیں۔</p></div></div></div></section>' +
    '<section class="page-section is-pale"><div class="content-wrap"><p class="section-kicker">عوامی فیصلہ رجسٹر</p><h2>مکمل، زیرِ تیاری اور منصوبہ شدہ کام واضح طور پر الگ رہیں۔</h2><dl class="codesign-ledger"><div><dt>شائع شدہ نتائج</dt><dd><strong>ابھی کوئی نہیں۔</strong> اس سائٹ پر مکمل بیرونی نیوروڈائیورجینٹ مشترکہ ڈیزائن کے نتائج کا دعویٰ نہیں کیا جا رہا۔</dd></div><div><dt>زیرِ تیاری</dt><dd>شرکت کے معیار، رضامندی اور حفاظت کے راستے، قابلِ رسائی رائے کے طریقے، فیصلہ ریکارڈ اور شراکت داروں کی شناخت۔</dd></div><div><dt>منصوبہ شدہ</dt><dd>نتائج کے دعووں سے پہلے نیوروڈائیورجینٹ سیکھنے والوں اور متعلقہ تعلیمی و رسائی کے پیشہ ور افراد کے ساتھ منظم جائزہ اور عملی جانچ۔</dd></div></dl><div class="callout evidence-callout"><h3>سچائی کی حد</h3><p>عمومی رائے طبی توثیق، تحقیقی ثبوت، حمایت یا رسمی مشاورتی کردار نہیں بناتی۔ ان دعووں کے لیے الگ واضح عمل اور دستاویز درکار ہیں۔</p></div><p class="codesign-contact">مستقبل میں شرکت میں دلچسپی رکھنے والے نیوروڈائیورجینٹ افراد اور متعلقہ پیشہ ور افراد <a href="mailto:contact@type2learn.tech">contact@type2learn.tech</a> پر رابطہ کر سکتے ہیں۔ رابطہ کسی داخلے، مشاورتی یا ملازمت کے تعلق کی ضمانت نہیں۔</p></div></section>'
  );

  const legalPage = (kind) => {
    const isPrivacy = kind === 'privacy';
    const title = isPrivacy ? 'Privacy should be clear, minimal, and child-aware.' : 'Terms should match the service that actually exists.';
    const copy = isPrivacy ? 'This page summarizes the product’s intended privacy posture. The supplied Privacy Policy is a detailed draft and cannot become an operative policy until legal, technical, and operational details are confirmed.' : 'This page identifies the intended terms posture. The supplied Terms of Service are a detailed draft and cannot become operative terms until the launch service, legal entity, markets, payment model, and school agreements are confirmed.';
    const cards = isPrivacy ? card('shield', 'Data minimization', 'Collect the information needed to run learning, save progress, secure accounts, and support chosen controls.', ['No sale or data brokerage', 'No targeted advertising', 'Private learner work by default']) + card('lock', 'Learner data boundaries', 'Student content and telemetry must not become a public-model training product without separate age-appropriate permission.', ['No diagnostic inference', 'Purpose-limited analytics', 'Role-based access']) + card('school', 'School controls', 'School deployment requires an agreement, defined purpose, access boundaries, export, retention, and deletion controls.', ['School-controlled records', 'DPA or equivalent', 'Clear incident process']) : card('file', 'Honest service description', 'Describe only released, beta, experimental, or planned features accurately.', ['No guarantee of future features', 'No false accreditation', 'No clinical positioning']) + card('users', 'Young learner safeguards', 'Eligibility, consent, public sharing, accounts, and school authority must match launch geography and service behaviour.', ['Parent/guardian or school path', 'Private defaults for minors', 'Accessible appeal and support']) + card('shield', 'Counsel-required terms', 'Payments, refunds, disputes, governing law, liability, and school terms need market-specific legal approval.', ['Entity and notice details', 'School agreement controls', 'Update and acceptance process']);
    const details = isPrivacy ? '<section class="page-section is-pale"><div class="content-wrap"><h2>Intended data boundaries.</h2><p>These are implementation commitments to verify before launch, not a substitute for the final privacy notice.</p><div class="page-grid">' + card('users', 'Account and role data', 'Use only the identity and role information needed to provide an authorized account.', ['Age and consent where required', 'School and class boundaries', 'Private account defaults']) + card('file', 'Learning and progress', 'Keep lesson attempts, corrections, review, and progress in the educational context that needs them.', ['Purpose-limited records', 'Versioned learning content', 'Export and deletion paths']) + card('keyboard', 'Typed work and telemetry', 'Treat raw input, timing, correction, and pause information as potentially sensitive.', ['No marketing profiling', 'Documented retention', 'No diagnosis inference']) + '</div></div></section>' : '<section class="page-section is-pale"><div class="content-wrap"><h2>Terms direction for the real service.</h2><p>These points guide product implementation; the final terms must match actual account, billing, school, and legal operations.</p><div class="page-grid">' + card('check', 'Learning integrity', 'Learners can use valid assistive technology, but should not automate or impersonate academic participation.', ['Accommodation-aware', 'No hidden high-stakes flag', 'Human review path']) + card('spark', 'AI and support', 'AI can assist practice but can be wrong; it does not replace learner, teacher, or professional judgment.', ['No diagnosis', 'Constrained outputs', 'Visible uncertainty']) + card('users', 'Public sharing', 'Profiles, certificates, and social sharing remain optional, private/limited by default for minors, and age-appropriate.', ['No required social account', 'Consent-aware visibility', 'Accurate certificate language']) + '</div></div></section>';
    return shell(pageHero(isPrivacy ? 'Privacy' : 'Terms', title, copy, 'Publication status', (isPrivacy ? 'Privacy Policy draft' : 'Terms of Service draft') + ' — pending legal review.') + '<section class="page-section"><div class="content-wrap"><div class="status-banner">' + icon('file') + '<div><strong>Draft, not final legal advice</strong><p>Before publication, confirm the registered entity, address, launch markets, vendors, hosting regions, consent, retention, billing, dispute process, and school terms with qualified counsel.</p></div></div><div class="page-grid" style="margin-top:32px">' + cards + '</div></div></section>' + details + '<section class="page-section"><div class="content-wrap"><h2>What this product preview does not do.</h2><p>It does not collect a learning response, create a child account, run advertising campaigns, record replay sessions, or offer a live school deployment. Public policy pages must remain accurate as the product changes.</p></div></section>');
  };

  const accessibility = () => shell(pageHero('Accessibility', 'Access is a requirement, not an add-on.', 'Type2Learn aims for WCAG 2.2 AA and task-level testing with people who use assistive technology. The learning experience must remain useful across different input, reading, sensory, and communication needs.', 'Accessibility route', 'A monitored accessibility feedback path is planned; this preview does not collect reports.') + '<section class="page-section"><div class="content-wrap"><h2>Core accessibility commitments.</h2><p>Each experience should work as a whole, not just pass a visual review.</p><div class="page-grid">' + card('keyboard', 'Operate', 'All primary tasks work by keyboard with clear focus and logical order.', ['No mouse-only action', 'No precision drag requirement', 'Touch-safe targets']) + card('eye', 'Perceive', 'Content remains understandable with text controls, contrast, captions, transcripts, and no color-only state.', ['Readable at zoom', 'No essential motion', 'Sound independent']) + card('message', 'Understand', 'Instructions, errors, completion, and recovery are clear and programmatically exposed.', ['Literal wording option', 'Visible completion condition', 'Useful status messages']) + '</div></div></section><section class="page-section is-pale"><div class="content-wrap"><h2>How we plan to test.</h2><table class="plain-table"><thead><tr><th>Context</th><th>Required check</th></tr></thead><tbody><tr><td>Keyboard and screen reader</td><td>Interactive content, forms, menus, status, and error recovery are operable and named.</td></tr><tr><td>Zoom and mobile</td><td>320 px layout, 200% text zoom, 400% reflow, touch targets, and reading order remain useful.</td></tr><tr><td>Motion and sensory settings</td><td>Reduced motion removes decorative movement; no essential information relies on animation or autoplay audio.</td></tr><tr><td>Learner testing</td><td>Feedback identifies barriers and informs changes before making conformance or outcome claims.</td></tr></tbody></table></div></section>');

  const security = () => shell(pageHero('Security', 'Protect learning with clear, reviewable controls.', 'Type2Learn’s intended security posture is built on least privilege, secure engineering, privacy-aware design, and clear recovery. It does not claim a certification or security outcome that has not been independently verified.', 'Security reporting', 'A dedicated, monitored security disclosure route is planned before public production use.') + '<section class="page-section"><div class="content-wrap"><h2>Security principles for a learning platform.</h2><p>The details must match the actual architecture and vendors before launch. These are product requirements, not a certification claim.</p><div class="page-grid">' + card('lock', 'Access control', 'Role boundaries, least privilege, unique accounts, and MFA for privileged access.', ['Teacher and school separation', 'Audit history', 'Prompt offboarding']) + card('shield', 'Secure delivery', 'Encrypted transport and storage, dependency monitoring, safe logging, backups, and recovery.', ['Secure secrets', 'Vulnerability handling', 'Incident exercises']) + card('file', 'Transparent response', 'Contain, investigate, preserve evidence, assess risk, and communicate appropriately when an incident occurs.', ['Documented ownership', 'Clear escalation', 'No silent data practice']) + '</div></div></section><section class="page-section is-pale"><div class="content-wrap"><div class="status-banner">' + icon('lock') + '<div><strong>Security disclosure route pending governance</strong><p>Do not send sensitive reports through an unmonitored public form. A security contact and disclosure policy should be published only once ownership, response process, and handling safeguards are ready.</p></div></div></div></section>');

  const support = () => shell(pageHero('Support', 'Clear help, clear boundaries, calm next steps.', 'The support experience should help a learner or adult recover from a barrier without exposing private work unnecessarily or turning routine support into surveillance.', 'Support route', 'support@type21earn.tech is proposed, but must be configured and monitored before it is treated as a live support channel.') + '<section class="page-section"><div class="content-wrap"><h2>Help topics for the first release.</h2><p>Support should be plain-language, accessible, and connected to actual product states.</p><div class="page-grid">' + card('home', 'Getting started', 'Choose a path, adjust controls, understand the first objective, and begin safely.', ['What the demo does', 'Where settings live', 'How to reset a preview']) + card('sliders', 'Controls and access', 'Use motion, sound, text, spacing, timer, focus, literal-instruction, and input options.', ['Keyboard help', 'Pause and resume', 'Accessible recovery']) + card('shield', 'Privacy and escalation', 'Know when to ask a parent, school, or support route without sharing unnecessary personal information.', ['Privacy request boundary', 'Accessibility barrier route', 'School support ownership']) + '</div></div></section><section class="page-section is-pale"><div class="content-wrap"><div class="status-banner">' + icon('message') + '<div><strong>Monitored support channel pending configuration</strong><p>This preview intentionally has no contact form. A real support route needs accountable ownership, response targets, privacy review, accessibility checks, and escalation handling.</p></div></div></div></section>');

  const productViews = [
    ['guided-lesson-preview.png', 'An editorial graphic of a seven-step route made from colorful key forms and connecting arrows.', 'One bounded route', 'The learning target, the current task, and the next move are designed to stay visible together.'],
    ['active-recall-demo.png', 'An editorial graphic of a response card, cue tile, and confirmation token.', 'Retrieve, then improve', 'A learner brings an idea back in their own words before feedback appears.'],
    ['learner-controls-preview.png', 'An editorial graphic of a dial, slider, pause token, and adaptable settings panel.', 'Controls without labels', 'Presentation can change without lowering the academic objective or exposing a learner.']
  ];

  const productViewGallery = () => '<div class="product-view-gallery" aria-label="Type2Learn product views">' + productViews.map((view, index) => '<figure class="product-view reveal" data-delay="' + (index % 3) + '"><div class="product-view-frame"><img src="/assets/product-views/' + view[0] + '" alt="' + view[1] + '" width="1600" height="1000" loading="lazy"></div><figcaption><span>0' + (index + 1) + '</span><div><h3>' + view[2] + '</h3><p>' + view[3] + '</p></div></figcaption></figure>').join('') + '</div>';

  const consolidatedHowItWorks = () => shell(
    pageHero('How it works', 'One active-learning engine. Purposeful routes.', 'Type2Learn turns a learning objective into a sequence of visible actions: encounter an idea, retrieve it, make it, check it, improve it, use it, and return to it.', 'Method status', 'The public demonstration is a local prototype. The course routes and their evaluation are being developed in deliberate stages.') +
    '<section class="page-section method-overview" id="pathways"><div class="content-wrap"><div class="method-overview-grid"><div><p class="section-kicker">The reusable method</p><h2>Every pathway starts with the same learning work.</h2><p>Pathways are no longer a separate branch of the site. They live here, beside the method they use, so it is clear what stays constant and what may change as content grows.</p><div class="method-link-list"><a href="#product-views">See the product views</a><a href="#learning-actions">Read the seven actions</a><a href="#evidence">Read the evidence boundary</a></div></div><figure class="method-graphic"><img src="/assets/pages/active-learning-path-graphic.png" alt="An abstract seven-step learning path built from colorful key forms and connecting arrows." width="1536" height="1024" loading="eager"><figcaption>Generated editorial graphic · Type2Learn active-learning route</figcaption></figure></div><div class="module-grid method-pathways">' +
      moduleCard('book', 'Word Builder', 'Adapted', 'Structured literacy and academic word learning through sound, spelling, meaning, correction, and return.', ['Sound, pattern, and meaning', 'Type after support fades', 'Correction, transfer, and return'], 'blue') +
      moduleCard('path', 'Focus Sprint', 'Adapted', 'Bounded grade-level work with one visible objective and a calm re-entry point.', ['One objective', 'Now → Next → Done', 'Pause, break, and return'], 'teal') +
      moduleCard('layers', 'Predictable Path', 'Adapted', 'Stable lesson delivery with fewer hidden expectations and learner-controlled supports.', ['Preview before start', 'Visible path and change notices', 'Sensory and help controls'], 'green') +
    '</div></div></section>' +
    '<section class="page-section is-pale product-views-section" id="product-views"><div class="content-wrap"><div class="section-heading"><div class="section-heading-copy"><p class="section-kicker">The experience in view</p><h2>Visual moments that make the method practical.</h2><p>These editorial visuals make the proposed interaction legible without claiming that a prototype is a completed programme.</p></div>' + status('Method visual', 'amber') + '</div>' + productViewGallery() + '</div></section>' +
    '<section class="page-section" id="learning-actions"><div class="content-wrap"><p class="section-kicker">Seven connected actions</p><h2>Learning becomes durable when the learner does the work.</h2><p>Each action protects the academic objective while making the next move clear. The actions can be used across subjects and support needs without turning the learner into a speed score.</p><div class="learning-actions-grid">' + [['01', 'Encounter', 'Meet one clear, bounded idea.'], ['02', 'Recall', 'Bring it back before the reveal.'], ['03', 'Produce', 'Make understanding visible in a usable response.'], ['04', 'Check', 'Receive specific feedback.'], ['05', 'Correct', 'Rebuild after support.'], ['06', 'Apply', 'Use the idea in a meaningful task.'], ['07', 'Return', 'Revisit later and keep what was earned.']].map((item, index) => '<article class="learning-action reveal" data-delay="' + (index % 4) + '"><span>' + item[0] + '</span><h3>' + item[1] + '</h3><p>' + item[2] + '</p></article>').join('') + '</div></div></section>' +
    '<section class="page-section is-pale" id="evidence"><div class="content-wrap"><div class="evidence-bridge"><div><p class="section-kicker">Evidence, without overclaiming</p><h2>Research informs a decision. Participation tests whether it serves people.</h2><p>Type2Learn labels the difference between an established principle, a product translation, a measured hypothesis, and a change made through participant input. The public participation record lives in one place.</p></div><a class="button button-secondary" href="/participation-trust/#participation-record">See participation &amp; trust' + icon('arrow', true) + '</a></div><div class="evidence-grid"><article class="evidence-card reveal">' + status('Supported', 'green') + '<h3>General principle</h3><p>Direct research can inform a learning or accessibility principle.</p></article><article class="evidence-card reveal" data-delay="1">' + status('Adapted', 'blue') + '<h3>Product translation</h3><p>A design choice applies that principle and still needs testing.</p></article><article class="evidence-card reveal" data-delay="2">' + status('Experimental', 'violet') + '<h3>Measured hypothesis</h3><p>An uncertain interaction is evaluated, not presented as fact.</p></article><article class="evidence-card reveal" data-delay="3">' + status('Participation-led', 'teal') + '<h3>Decision record</h3><p>Public evidence shows what was heard, what changed, and what still needs review.</p></article></div></div></section>'
  );

  const learningTogether = () => shell(
    pageHero('Learning together', 'One learning experience. Clear responsibilities around it.', 'Type2Learn is being designed around one rule: the learner remains the person doing the learning. Families, educators, and schools receive a clear support role without turning ordinary learning into surveillance.', 'Shared standard', 'Support should improve access to meaningful work—not expose private drafts, infer a diagnosis, or reward compliance.') +
    '<section class="page-section learning-together-intro"><div class="content-wrap"><p class="section-kicker">Three perspectives, one respect standard</p><h2>Everyone should know what they can do—and what they should not be asked to do.</h2><p>These audiences were previously separate pages. Bringing them together makes the hand-offs explicit and removes repeated promises.</p><div class="audience-roles">' +
      '<article class="audience-role reveal"><figure class="role-mark"><img src="/assets/role-marks/learner-agency-mark.png" alt="An abstract learning tile, response token, and clear next-step path." loading="lazy"></figure><span>01 · Learner</span><h3>Choose a clearer way in.</h3><p>See the objective, select the supports that help, and return to saved work calmly.</p><ul><li>Control presentation</li><li>Keep progress private by default</li><li>Build proof of learning</li></ul></article>' +
      '<article class="audience-role reveal" data-delay="1"><figure class="role-mark"><img src="/assets/role-marks/family-support-mark.png" alt="Abstract interlocking forms supporting an open learning tile." loading="lazy"></figure><span>02 · Family</span><h3>Support the routine, not constant monitoring.</h3><p>Use respectful questions and simple routines without being given a stream of private drafts.</p><ul><li>Understand the next review</li><li>Respect learner choices</li><li>Know when human help is needed</li></ul></article>' +
      '<article class="audience-role reveal" data-delay="2"><figure class="role-mark"><img src="/assets/role-marks/educator-insight-mark.png" alt="An abstract evidence panel and review lens connected by a progress path." loading="lazy"></figure><span>03 · Educator or school</span><h3>Use evidence to teach.</h3><p>See the work and context required for a useful human decision—not behavioural or attention scores.</p><ul><li>Review academic evidence</li><li>Understand authorised supports</li><li>Keep a human override</li></ul></article>' +
    '</div></div></section>' +
    '<section class="page-section is-pale responsibility-section"><div class="content-wrap"><p class="section-kicker">A practical agreement</p><h2>What information belongs with whom?</h2><div class="responsibility-table" role="region" aria-label="Learning responsibility guide"><table><thead><tr><th>Need</th><th>Learner</th><th>Family</th><th>Educator / school</th></tr></thead><tbody><tr><th>Next learning action</th><td>Always visible</td><td>Discuss only when invited</td><td>Can plan assigned work</td></tr><tr><th>Private drafts and settings</th><td>Controls access</td><td>Not a monitoring feed</td><td>Only when authorised and necessary</td></tr><tr><th>Meaningful learning evidence</th><td>Can see and improve it</td><td>Can discuss progress respectfully</td><td>Can review for teaching decisions</td></tr><tr><th>Escalation or support</th><td>Clear, accessible route</td><td>Clear role and boundary</td><td>Accountable process and human review</td></tr></tbody></table></div></div></section>' +
    '<section class="page-section"><div class="content-wrap"><div class="support-panel"><p class="section-kicker">Before school deployment</p><h2>Access, privacy, safeguarding, and a real educational purpose come first.</h2><p>School use is planned, not assumed. It requires documented roles, permissions, accessible task testing, retention and deletion paths, an incident process, and claims that match the evidence.</p><div class="support-items"><div class="support-item"><strong>Access</strong><span>Keyboard-first tasks, reflow, understandable status, and reduced-motion alternatives.</span></div><div class="support-item"><strong>Privacy</strong><span>Defined purpose, role limits, permission-aware sharing, and no marketing profile.</span></div><div class="support-item"><strong>Safeguarding</strong><span>Named ownership, a clear escalation route, and no invisible behavioural surveillance.</span></div><div class="support-item"><strong>Evidence</strong><span>Human review of meaningful work—not clicks, speed, gaze, or compliance.</span></div></div></div></div></section>'
  );

  // Add a new permission-reviewed record here when evidence is ready to publish.
  // Keep names, portraits, and direct media URLs out of this public summary unless
  // the relevant participant permission explicitly allows them.
  const participationRecord = [
    ['01', 'professional-evidence-mark.png', 'Professional practice review', '1 professional contributor', 'Consent-restricted notes · optional approved video', 'A contributor can interrogate the learning question, the safeguards, and the language before anything is published.', ['Question reviewed', 'Permission level recorded', 'Decision and follow-up logged']],
    ['02', 'teacher-workflow-mark.png', 'Teaching practice review', '3 teacher contributors', 'Text notes · classroom-practice prompts · optional approved video', 'Teachers can identify where a lesson, workflow, or reporting view creates friction—and what needs to change in response.', ['Workflow signal captured', 'Revision proposed', 'Change linked to the record']],
    ['03', 'student-voice-mark.png', 'Learner voice record', '5 student contributors', 'A mix of permissioned text and audio', 'Student insight is treated as expertise. Their identities, images, and private learning material remain protected.', ['No participant photos', 'No public diagnosis labels', 'Insight connected to a product decision']]
  ];

  const participationCards = () => participationRecord.map((entry, index) => '<article class="participation-card participation-card-rich reveal" data-delay="' + index + '"><figure class="participation-mark"><img src="/assets/participation-marks/' + entry[1] + '" alt="" loading="lazy"></figure><div class="participation-card-copy"><div class="participation-card-top"><span class="participation-index">' + entry[0] + '</span><span class="participation-scope">' + entry[3] + '</span></div><p class="section-kicker">Contribution strand</p><h3>' + entry[2] + '</h3><p class="participation-format">' + entry[4] + '</p><p>' + entry[5] + '</p><ul class="participation-outcomes">' + entry[6].map((item) => '<li>' + item + '</li>').join('') + '</ul><a href="#video-conversations">See the evidence placement <span aria-hidden="true">↓</span></a></div></article>').join('');

  const participationTrust = () => shell(
    pageHero('Participation & trust', 'Participation should change the work. Trust should be visible.', 'This is the one public record for co-design, professional input, community participation, accessibility, privacy, security, and support boundaries. It replaces three overlapping sections with one accountable route.', 'Current status', 'The initial evidence ledger is being prepared for one professional, three teachers, and five students. It does not claim completed external co-design, clinical validation, or endorsement.') +
    '<section class="page-section participation-record-section" id="participation-record"><div class="content-wrap"><div class="section-heading"><div class="section-heading-copy"><p class="section-kicker">Participation record</p><h2>Who is represented—and how their contribution is protected.</h2><p>Every public entry needs a clear permission level, source format, learning, and product decision. Counts are visible; personal identities and images are not.</p></div>' + status('Permission-aware', 'teal') + '</div><div class="participation-summary" aria-label="Participant count"><span><b>01</b>Professional</span><span><b>03</b>Teachers</span><span><b>05</b>Students</span></div><div class="participation-grid">' + participationCards() + '</div></div></section>' +
    '<section class="page-section is-pale evidence-placement-section" id="video-conversations"><div class="content-wrap"><div class="evidence-placement-grid"><div><p class="section-kicker">Evidence and video conversations</p><h2>Designed for permissioned proof, not decorative testimonials.</h2><p>When an approved YouTube video is ready, add its URL and a short transcript summary to the evidence entry. Text and audio-only entries remain equal contributors; no participant image is required.</p><ol class="evidence-steps"><li><span>01</span>State the question and format.</li><li><span>02</span>Record the permission level and date.</li><li><span>03</span>Link the video, audio, or text record.</li><li><span>04</span>Publish what changed and what remains open.</li></ol></div><aside class="evidence-media-slot" data-evidence-media aria-label="Reserved location for a consented YouTube video"><span>' + icon('message') + '</span><p>Video evidence slot</p><strong>Add a consented YouTube link</strong><small>Use this area only after permission, a content check, and accessible captions or a transcript are ready.</small></aside></div></div></section>' +
    '<section class="page-section trust-commitments" id="accessibility"><div class="content-wrap"><p class="section-kicker">Product commitments</p><h2>Four requirements that stay connected to participation.</h2><div class="trust-commitment-grid"><article class="trust-commitment reveal"><span>01</span><h3>Accessibility</h3><p>Keyboard operation, usable zoom and reflow, clear status, captions where needed, and a reduced-motion path are product requirements.</p></article><article class="trust-commitment reveal" data-delay="1"><span>02</span><h3>Privacy</h3><p>Minimise data, keep learner work private by default, use a defined purpose, and never sell learner data.</p></article><article class="trust-commitment reveal" data-delay="2" id="security"><span>03</span><h3>Security</h3><p>Least privilege, secure delivery, safe logging, reviewable operations, and transparent incident handling are requirements—not certification claims.</p></article><article class="trust-commitment reveal" data-delay="3" id="support"><span>04</span><h3>Support</h3><p>A support route needs accountable ownership, accessibility checks, privacy boundaries, response targets, and escalation handling before it is treated as live.</p></article></div><div class="trust-legal-links"><a href="/privacy/">Read the Privacy Policy</a><a href="/terms/">Read the Terms of Service</a><a href="https://github.com/Type2Learn" target="_blank" rel="noopener noreferrer">View Type2Learn on GitHub <span aria-hidden="true">↗</span></a><a href="https://www.linkedin.com/company/type2learn/" target="_blank" rel="noopener noreferrer">Follow Type2Learn on LinkedIn <span aria-hidden="true">↗</span></a></div></div></section>'
  );

  const urduLearningTogether = () => shell(
    pageHero('مل کر سیکھنا', 'ایک تعلیمی تجربہ۔ اس کے گرد واضح ذمہ داریاں۔', 'Type2Learn ایک اصول پر تیار کیا جا رہا ہے: سیکھنے والا خود سیکھنے والا شخص رہے۔ خاندان، اساتذہ اور اسکول معاونت کا واضح کردار ادا کریں، مگر عام سیکھنے کو نگرانی میں نہ بدلیں۔', 'مشترکہ معیار', 'مدد کو بامعنی کام تک رسائی بہتر بنانی چاہیے—نجی مسودے ظاہر نہیں کرنے، تشخیص کا اندازہ نہیں لگانا، یا فرمانبرداری کو انعام نہیں بنانا چاہیے۔') +
    '<section class="page-section learning-together-intro"><div class="content-wrap"><p class="section-kicker">تین زاویے، احترام کا ایک معیار</p><h2>ہر شخص کو معلوم ہونا چاہیے کہ وہ کیا کر سکتا ہے—اور اس سے کیا نہیں مانگا جانا چاہیے۔</h2><p>یہ معلومات پہلے الگ صفحات پر تھیں۔ ایک جگہ لانے سے ذمہ داریوں کا باہمی تعلق اور مشترکہ حدود واضح ہوتی ہیں۔</p><div class="audience-roles"><article class="audience-role reveal"><figure class="role-mark"><img src="/assets/role-marks/learner-agency-mark.png" alt="سیکھنے کے اگلے قدم کا تجریدی نشان" loading="lazy"></figure><span>01 · سیکھنے والا</span><h3>اپنے لیے واضح راستہ منتخب کریں۔</h3><p>مقصد دیکھیں، مددگار کنٹرول منتخب کریں، اور پرسکون انداز میں محفوظ کام کی طرف واپس آئیں۔</p></article><article class="audience-role reveal" data-delay="1"><figure class="role-mark"><img src="/assets/role-marks/family-support-mark.png" alt="خاندانی معاونت کا تجریدی نشان" loading="lazy"></figure><span>02 · خاندان</span><h3>روٹین میں مدد کریں، مسلسل نگرانی نہیں۔</h3><p>نجی مسودوں کی فہرست کے بغیر احترام والی گفتگو اور مفید روٹین اپنائیں۔</p></article><article class="audience-role reveal" data-delay="2"><figure class="role-mark"><img src="/assets/role-marks/educator-insight-mark.png" alt="تعلیمی ثبوت اور انسانی جائزے کا تجریدی نشان" loading="lazy"></figure><span>03 · استاد یا اسکول</span><h3>تعلیم کے لیے ثبوت استعمال کریں۔</h3><p>انسانی فیصلے کے لیے ضروری کام اور تناظر دیکھیں، رویے یا توجہ کے اسکور نہیں۔</p></article></div></div></section>' +
    '<section class="page-section is-pale responsibility-section"><div class="content-wrap"><p class="section-kicker">عملی معاہدہ</p><h2>کون سی معلومات کس کے پاس ہونی چاہیے؟</h2><div class="responsibility-table" role="region" aria-label="سیکھنے کی ذمہ داریوں کی رہنمائی"><table><thead><tr><th>ضرورت</th><th>سیکھنے والا</th><th>خاندان</th><th>استاد / اسکول</th></tr></thead><tbody><tr><th>اگلا تعلیمی عمل</th><td>ہمیشہ واضح</td><td>صرف دعوت پر گفتگو</td><td>مقررہ کام کی منصوبہ بندی</td></tr><tr><th>نجی مسودے اور ترتیبات</th><td>رسائی کا اختیار</td><td>نگرانی کی فیڈ نہیں</td><td>صرف اجازت اور ضرورت پر</td></tr><tr><th>بامعنی سیکھنے کا ثبوت</th><td>دیکھ اور بہتر کر سکتا ہے</td><td>احترام سے پیش رفت پر گفتگو</td><td>تعلیمی فیصلے کے لیے جائزہ</td></tr><tr><th>مدد یا اگلا قدم</th><td>واضح، قابلِ رسائی راستہ</td><td>واضح کردار اور حد</td><td>جوابدہ عمل اور انسانی جائزہ</td></tr></tbody></table></div></div></section>'
  );

  const urduParticipationTrust = () => shell(
    pageHero('شرکت اور اعتماد', 'شرکت سے کام بدلنا چاہیے۔ اعتماد صاف نظر آنا چاہیے۔', 'یہ مشترکہ ڈیزائن، پیشہ ورانہ رائے، کمیونٹی کی شرکت، رسائی، رازداری، سکیورٹی اور مدد کی حدود کا واحد عوامی ریکارڈ ہے۔', 'موجودہ حیثیت', 'ابتدائی شواہد کا ریکارڈ ایک پیشہ ور، تین اساتذہ اور پانچ سیکھنے والوں کے لیے تیار کیا جا رہا ہے۔ مکمل بیرونی مشترکہ ڈیزائن، طبی توثیق یا حمایت کا دعویٰ نہیں کیا جاتا۔') +
    '<section class="page-section participation-record-section" id="participation-record"><div class="content-wrap"><div class="section-heading"><div class="section-heading-copy"><p class="section-kicker">شرکت کا ریکارڈ</p><h2>کون شامل ہے—اور ان کی شراکت کیسے محفوظ ہے۔</h2><p>ہر عوامی اندراج میں اجازت کی سطح، مواد کی شکل، حاصل شدہ بات اور مصنوعات کا فیصلہ واضح ہو گا۔ تعداد نظر آتی ہے؛ ذاتی شناخت اور تصاویر نہیں۔</p></div>' + status('اجازت کے مطابق', 'teal') + '</div><div class="participation-summary" aria-label="شرکاء کی تعداد"><span><b>01</b>پیشہ ور</span><span><b>03</b>اساتذہ</span><span><b>05</b>سیکھنے والے</span></div><div class="participation-grid"><article class="participation-card reveal"><span class="participation-index">01</span><p class="section-kicker">پیشہ ورانہ زاویہ</p><h3>1 پیشہ ور</h3><p class="participation-format">' + icon('flask', true) + 'نجی نوٹس اور اجازت کے جائزے کے بعد ویڈیو ریکارڈ</p><p>عوامی صفحہ موضوع، اجازت کی سطح، مصنوعات کا فیصلہ اور اگلا قدم دکھائے گا—پورٹریٹ یا ذاتی پروفائل نہیں۔</p></article><article class="participation-card reveal" data-delay="1"><span class="participation-index">02</span><p class="section-kicker">اساتذہ کے زاویے</p><h3>3 اساتذہ</h3><p class="participation-format">' + icon('school', true) + 'متنی نوٹس، تدریسی سوالات اور اختیاری ویڈیو لنکس</p><p>اندراج یہ دکھا سکتے ہیں کہ سبق کی وضاحت یا طریقۂ کار کہاں بدلنا چاہیے، بغیر کسی استاد کی شناخت ظاہر کیے۔</p></article><article class="participation-card reveal" data-delay="2"><span class="participation-index">03</span><p class="section-kicker">سیکھنے والوں کے زاویے</p><h3>5 سیکھنے والے</h3><p class="participation-format">' + icon('headphones', true) + 'متن اور صرف آڈیو ریکارڈ کا امتزاج</p><p>شرکاء کی تصاویر نہیں۔ عوامی مواد صرف اجازت کے مطابق، شناخت سے پاک تعلیمی بصیرت اور اس کے نتیجے میں ہونے والے فیصلے تک محدود رہے گا۔</p></article></div></div></section>' +
    '<section class="page-section is-pale evidence-placement-section" id="video-conversations"><div class="content-wrap"><div class="evidence-placement-grid"><div><p class="section-kicker">شواہد اور ویڈیو گفتگو</p><h2>سجاوٹی تعریفوں کے لیے نہیں، اجازت کے ساتھ ثبوت کے لیے تیار۔</h2><p>جب منظور شدہ YouTube ویڈیو تیار ہو، تو اس کا لنک اور مختصر نقل اس شواہد کے اندراج میں شامل کریں۔ متن اور صرف آڈیو والے اندراج برابر اہم رہیں گے؛ کسی شریک کی تصویر ضروری نہیں۔</p><ol class="evidence-steps"><li><span>01</span>سوال اور مواد کی شکل بتائیں۔</li><li><span>02</span>اجازت کی سطح اور تاریخ درج کریں۔</li><li><span>03</span>ویڈیو، آڈیو یا متن کا ریکارڈ جوڑیں۔</li><li><span>04</span>جو بدلا اور جو کھلا ہے، شائع کریں۔</li></ol></div><aside class="evidence-media-slot" data-evidence-media aria-label="رضامندی والی YouTube ویڈیو کے لیے جگہ"><span>' + icon('message') + '</span><p>ویڈیو شواہد کی جگہ</p><strong>رضامندی والے YouTube لنک کا اضافہ کریں</strong><small>یہ جگہ صرف اجازت، مواد کے جائزے اور قابلِ رسائی کیپشن یا نقل تیار ہونے کے بعد استعمال کریں۔</small></aside></div></div></section>' +
    '<section class="page-section trust-commitments" id="accessibility"><div class="content-wrap"><p class="section-kicker">مصنوعات کے عہد</p><h2>چار تقاضے جو شرکت کے ساتھ جڑے رہتے ہیں۔</h2><div class="trust-commitment-grid"><article class="trust-commitment reveal"><span>01</span><h3>رسائی پذیری</h3><p>کی بورڈ سے عمل، قابلِ استعمال زوم اور ری فلو، واضح کیفیت، اور حرکت کم کرنے کا راستہ مصنوعات کے تقاضے ہیں۔</p></article><article class="trust-commitment reveal" data-delay="1"><span>02</span><h3>رازداری</h3><p>ڈیٹا کم رکھیں، سیکھنے والے کا کام بطورِ ڈیفالٹ نجی رکھیں، مقصد واضح رکھیں، اور ڈیٹا کبھی فروخت نہ کریں۔</p></article><article class="trust-commitment reveal" data-delay="2" id="security"><span>03</span><h3>سکیورٹی</h3><p>کم سے کم رسائی، محفوظ ترسیل، محفوظ لاگز، قابلِ جائزہ عمل اور واضح واقعہ انتظام لازمی تقاضے ہیں۔</p></article><article class="trust-commitment reveal" data-delay="3" id="support"><span>04</span><h3>مدد</h3><p>مدد کا راستہ تب ہی فعال سمجھا جائے گا جب ذمہ دار مالک، رسائی جانچ، رازداری کی حدود اور اگلا عمل واضح ہو۔</p></article></div><div class="trust-legal-links"><a href="/privacy/">رازداری پالیسی پڑھیں</a><a href="/terms/">سروس کی شرائط پڑھیں</a><a href="https://github.com/Type2Learn" target="_blank" rel="noopener noreferrer">GitHub پر Type2Learn دیکھیں <span aria-hidden="true">↗</span></a><a href="https://www.linkedin.com/company/type2learn/" target="_blank" rel="noopener noreferrer">LinkedIn پر Type2Learn فالو کریں <span aria-hidden="true">↗</span></a></div></div></section>'
  );

  const urduConsolidatedHowItWorks = () => shell(
    pageHero('طریقۂ کار', 'ایک فعال تعلیمی انجن۔ بامقصد راستے۔', 'Type2Learn تعلیمی مقصد کو واضح اعمال کی ترتیب میں بدلتا ہے: خیال سے ملیں، اسے یاد کریں، بنائیں، جانچیں، بہتر کریں، استعمال کریں اور اس کی طرف واپس آئیں۔', 'طریقے کی حیثیت', 'عوامی نمونہ مقامی پروٹوٹائپ ہے۔ کورس کے راستے اور ان کی جانچ مرحلہ وار تیار ہو رہی ہے۔') +
    '<section class="page-section method-overview" id="pathways"><div class="content-wrap"><div class="method-overview-grid"><div><p class="section-kicker">دوبارہ استعمال ہونے والا طریقہ</p><h2>ہر راستہ سیکھنے کے ایک ہی بنیادی کام سے شروع ہوتا ہے۔</h2><p>راستے اب الگ صفحہ نہیں ہیں۔ وہ اسی جگہ موجود ہیں جہاں ان کا طریقہ واضح ہوتا ہے، تاکہ مستقل عناصر اور مستقبل میں بدلنے والی چیزیں ایک ساتھ دیکھی جا سکیں۔</p><div class="method-link-list"><a href="#learning-actions">سات اعمال پڑھیں</a><a href="#evidence">شواہد کی حد دیکھیں</a></div></div><figure class="method-graphic"><img src="/assets/pages/active-learning-path-graphic.png" alt="رنگین کلیدی شکلوں اور جڑتے تیروں سے بنا سات مرحلوں کا ایک تجریدی تعلیمی راستہ۔" width="1536" height="1024" loading="eager"><figcaption>تیار شدہ ادارتی گرافک · Type2Learn کا فعال تعلیمی راستہ</figcaption></figure></div><div class="module-grid method-pathways">' + moduleCard('book', 'لفظ سازی', 'ڈھالا گیا', 'آواز، ہجے، معنی، درستگی اور واپسی کے ذریعے منظم خواندگی اور تعلیمی الفاظ کی مشق۔', ['آواز، ساخت اور معنی', 'مدد کم ہونے کے بعد ٹائپنگ', 'درستگی، استعمال اور واپسی'], 'blue') + moduleCard('path', 'توجہ کا مرحلہ', 'ڈھالا گیا', 'ایک واضح مقصد اور پرسکون واپسی کے مقام کے ساتھ محدود جماعتی درجے کا کام۔', ['ایک مقصد', 'اب ← اگلا ← مکمل', 'توقف، وقفہ اور واپسی'], 'teal') + moduleCard('layers', 'واضح راستہ', 'ڈھالا گیا', 'کم پوشیدہ توقعات اور سیکھنے والے کے اختیار والی مدد کے ساتھ مستحکم سبق۔', ['آغاز سے پہلے پیش منظر', 'واضح راستہ اور تبدیلی کی اطلاع', 'حسی اور مدد کے کنٹرولز'], 'green') + '</div></div></section>' +
    '<section class="page-section" id="learning-actions"><div class="content-wrap"><p class="section-kicker">سات مربوط اعمال</p><h2>علم اس وقت پائیدار بنتا ہے جب سیکھنے والا خود کام کرتا ہے۔</h2><p>ہر عمل تعلیمی مقصد کو محفوظ رکھتا اور اگلی حرکت واضح کرتا ہے۔ یہ رفتار کے اسکور میں بدلے بغیر مختلف مضامین اور مدد کی ضرورتوں میں استعمال ہو سکتا ہے۔</p><div class="learning-actions-grid">' + [['01', 'آغاز', 'ایک واضح اور محدود خیال سے ملیں۔'], ['02', 'یاد', 'جواب سامنے آنے سے پہلے اسے یاد کریں۔'], ['03', 'اظہار', 'سمجھ کو قابلِ استعمال جواب میں واضح کریں۔'], ['04', 'جانچ', 'مخصوص رائے حاصل کریں۔'], ['05', 'درستگی', 'مدد کے بعد خیال دوبارہ بنائیں۔'], ['06', 'استعمال', 'خیال کو بامعنی کام میں استعمال کریں۔'], ['07', 'واپسی', 'بعد میں لوٹیں اور حاصل شدہ علم برقرار رکھیں۔']].map((item, index) => '<article class="learning-action reveal" data-delay="' + (index % 4) + '"><span>' + item[0] + '</span><h3>' + item[1] + '</h3><p>' + item[2] + '</p></article>').join('') + '</div></div></section>' +
    '<section class="page-section is-pale" id="evidence"><div class="content-wrap"><div class="evidence-bridge"><div><p class="section-kicker">بغیر مبالغے کے شواہد</p><h2>تحقیق فیصلے کو سمت دیتی ہے۔ شرکت آزماتی ہے کہ آیا یہ لوگوں کے لیے مفید ہے۔</h2><p>Type2Learn قائم شدہ اصول، مصنوعات کے ترجمے، ناپے جانے والے مفروضے اور شرکاء کی رائے سے بدلے گئے فیصلوں کے درمیان فرق واضح رکھتا ہے۔</p></div><a class="button button-secondary" href="/ur/participation-trust/#participation-record">شرکت اور اعتماد دیکھیں' + icon('arrow', true) + '</a></div><div class="evidence-grid"><article class="evidence-card reveal">' + status('تحقیق سے معاونت', 'green') + '<h3>عمومی اصول</h3><p>براہِ راست تحقیق کسی تعلیمی یا رسائی کے اصول کی سمت دے سکتی ہے۔</p></article><article class="evidence-card reveal" data-delay="1">' + status('ڈھالا گیا', 'blue') + '<h3>مصنوعاتی ترجمہ</h3><p>ڈیزائن کا انتخاب اصول کو استعمال کرتا ہے اور پھر بھی جانچ کا محتاج ہے۔</p></article><article class="evidence-card reveal" data-delay="2">' + status('آزمائشی', 'violet') + '<h3>ناپا جانے والا مفروضہ</h3><p>غیر یقینی تعامل کو حقیقت کہنے کے بجائے جانچا جاتا ہے۔</p></article><article class="evidence-card reveal" data-delay="3">' + status('شرکت سے رہنمائی', 'teal') + '<h3>فیصلے کا ریکارڈ</h3><p>عوامی شواہد بتاتے ہیں کہ کیا سنا گیا، کیا بدلا اور کس چیز کا جائزہ باقی ہے۔</p></article></div></div></section>'
  );

  const pageMap = {
    home: landing,
    "home-ur": landing,
    "how-it-works": consolidatedHowItWorks,
    "how-it-works-ur": urduConsolidatedHowItWorks,
    "learning-together": learningTogether,
    "learning-together-ur": urduLearningTogether,
    "participation-trust": participationTrust,
    "participation-trust-ur": urduParticipationTrust,
    pathways,
    "pathways-ur": urduPathways,
    learners,
    "learners-ur": urduLearners,
    families,
    "families-ur": urduFamilies,
    schools,
    "schools-ur": urduSchools,
    team,
    "team-ur": urduTeam,
    "co-design": coDesign,
    "co-design-ur": urduCoDesign,
    community,
    "community-ur": urduCommunity,
    trust,
    "trust-ur": urduTrust,
    login: authPage,
    research: howItWorks,
    privacy: trust,
    terms: trust,
    accessibility: trust,
    security: trust,
    support: community
  };

  const root = document.getElementById('app');
  const staticDocument = root.querySelector('[data-static-document]');
  if (staticDocument) {
    root.innerHTML = '<div class="site-shell">' + nav() + staticDocument.outerHTML + nativeBuilderCredit + footer() + '</div>';
  } else {
    root.innerHTML = (pageMap[route] || landing)();
  }
  root.querySelectorAll('img[src="/assets/type2learn-logo.png"]').forEach((image) => {
    image.src = '/assets/type2learn-logo-nav.webp';
    image.width = 160;
    image.height = 141;
  });

  const pageTitles = {
    home: 'Type2Learn — Learn by typing',
    "home-ur": 'Type2Learn | ٹائپ کر کے سیکھیں',
    "how-it-works": 'How Type2Learn works',
    "how-it-works-ur": 'Type2Learn کا طریقۂ کار',
    "learning-together": 'Learning Together | Type2Learn',
    "learning-together-ur": 'مل کر سیکھنا | Type2Learn',
    "participation-trust": 'Participation & Trust | Type2Learn',
    "participation-trust-ur": 'شرکت اور اعتماد | Type2Learn',
    pathways: 'Type2Learn pathways',
    "pathways-ur": 'Type2Learn کے سیکھنے کے راستے',
    learners: 'For learners — Type2Learn',
    "learners-ur": 'سیکھنے والوں کے لیے — Type2Learn',
    families: 'For families — Type2Learn',
    "families-ur": 'خاندانوں کے لیے — Type2Learn',
    schools: 'For schools — Type2Learn',
    "schools-ur": 'اسکولوں کے لیے — Type2Learn',
    team: 'Meet the Type2Learn Founding Team',
    "team-ur": 'Type2Learn کی بانی ٹیم سے ملیں',
    "co-design": 'Neurodivergent co-design and professional input | Type2Learn',
    "co-design-ur": 'نیوروڈائیورجینٹ مشترکہ ڈیزائن | Type2Learn',
    community: 'Community and help — Type2Learn',
    "community-ur": 'کمیونٹی اور مدد — Type2Learn',
    trust: 'Trust — Type2Learn',
    "trust-ur": 'اعتماد — Type2Learn',
    login: 'Sign in or create an account | Type2Learn',
    research: 'How Type2Learn works',
    privacy: 'Privacy Policy | Type2Learn',
    terms: 'Terms of Service | Type2Learn',
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

    return '<section class="scroll-story" id="learning-story" data-scroll-stops="' + scenes.length + '" aria-labelledby="story-title"><div class="story-stage"><canvas class="story-canvas" id="story-canvas" aria-hidden="true"></canvas><div class="story-scenes">' + scenes.map((scene, index) => '<figure class="story-scene' + (index === 0 ? ' is-active' : '') + '" data-story-scene="' + index + '"><img src="' + scene[4] + '" alt="' + scene[5] + '"></figure>').join('') + '</div><div class="story-shade" aria-hidden="true"></div><div class="story-ui content-wrap"><div class="story-topline"><p><span>Type2Learn</span> · Learning route</p><div class="story-counter" aria-live="polite"><span id="story-current">01</span><i></i><span>' + String(scenes.length).padStart(2, '0') + '</span></div></div><div class="story-copy"><p class="story-kicker">Scroll, swipe, or drag through the learning story</p><h2 id="story-title">Learning is something you do.</h2><div class="story-steps">' + scenes.map((scene, index) => '<article class="story-step' + (index === 0 ? ' is-active' : '') + '" data-story-step="' + index + '"><span>' + scene[0] + ' · ' + scene[1] + '</span><h3>' + scene[2] + '</h3><p>' + scene[3] + '</p></article>').join('') + '</div><a class="button button-primary story-action" href="/login/">Try the learning demo' + icon('arrow', true) + '</a></div><div class="story-route" aria-hidden="true">' + scenes.map((scene) => '<span>' + scene[1] + '</span>').join('') + '<i id="story-route-progress"></i></div></div></div></section>';
  };

  const learningStages = [
    ['01', 'Encounter', 'Read / Hear', 'Meet one clear idea.', 'A short, bounded explanation makes the objective and the next action visible.'],
    ['02', 'Retrieve', 'Recall', 'Bring it back before the reveal.', 'A cue supports memory without replacing the work of remembering.'],
    ['03', 'Express', 'Type / Produce', 'Make thinking visible.', 'The learner writes, builds, labels, solves, or explains in a usable form.'],
    ['04', 'Compare', 'Check', 'See exactly what changed.', 'Specific feedback identifies what is strong and what needs another pass.'],
    ['05', 'Rebuild', 'Correct', 'Improve without shame.', 'After support, the learner reconstructs the idea instead of merely seeing an answer.'],
    ['06', 'Transfer', 'Apply', 'Use the idea somewhere meaningful.', 'A new task turns recognition into evidence that the idea can travel.'],
    ['07', 'Strengthen', 'Return', 'Come back and keep it.', 'Later retrieval strengthens durable learning and protects earned progress.']
  ];

  const homeLearningShuffle = () => {
    const rail = learningStages.map((stage, index) => '<li class="' + (index === 0 ? 'is-active' : '') + '" data-chit-rail="' + index + '"><span>' + stage[0] + '</span></li>').join('');
    const chits = learningStages.map((stage, index) => {
      const title = index === 5 ? '<span>Use the idea</span> <span>somewhere meaningful.</span>' : stage[3];
      return '<article class="loop-chit' + (index === 0 ? ' is-active' : '') + (index === 5 ? ' is-long' : '') + '" data-chit-card="' + index + '" aria-hidden="' + (index === 0 ? 'false' : 'true') + '"><span class="chit-number">' + stage[0] + '</span><div class="chit-copy"><p class="chit-phase">' + stage[1] + ' · ' + stage[2] + '</p><h3>' + title + '</h3><p>' + stage[4] + '</p></div><span class="chit-edge" aria-hidden="true">' + stage[2] + '</span></article>';
    }).join('');
    return '<section class="section learning-shuffle-section" id="learning-loop" aria-labelledby="learning-shuffle-title"><div class="content-wrap"><div class="section-heading learning-shuffle-heading"><div class="section-heading-copy"><p class="section-kicker">The learning loop</p><h2 id="learning-shuffle-title">Learning becomes durable when the learner does the work.</h2><p>Scroll, swipe, or drag through the seven actions. Each step protects the academic objective while making the next move clear.</p></div><div class="shuffle-position" aria-live="polite"><span id="chit-current">01</span><i></i><span>07</span></div></div><div class="learning-shuffle" data-learning-shuffle data-scroll-stops="' + learningStages.length + '"><div class="chit-rail" aria-hidden="true"><div class="chit-rail-line"><i id="chit-rail-progress"></i></div><ol>' + rail + '</ol></div><div class="chit-viewport"><div class="chit-stack">' + chits + '</div><p class="chit-instruction"><span>Scroll or drag</span> to shuffle the learning action</p></div></div></div></section>';
  };

  const urduScrollStory = () => {
    const scenes = [
      ['01', 'آغاز', 'ایک واضح خیال سے شروع کریں۔', 'ایک محدود خیال پڑھیں یا سنیں، جہاں مقصد اور اگلا قدم صاف دکھائی دے۔', '/assets/story/learner-encounter.webp', 'گھر میں مطالعہ کی میز پر ٹائپ کرتا ہوا ایک پاکستانی ثانوی درجے کا سیکھنے والا۔'],
      ['02', 'یاد کریں', 'جواب سامنے آنے سے پہلے یاد کریں۔', 'اشارہ استعمال کریں، رکیں، اور مکمل نمونہ دیکھنے سے پہلے خیال کو یادداشت سے واپس لائیں۔', '/assets/story/learner-recall.webp', 'لیپ ٹاپ اور نوٹ بک کے پاس خیال کو یاد کرنے کے لیے رکتا ہوا سیکھنے والا۔'],
      ['03', 'بنائیں', 'اپنی سوچ کو واضح کریں۔', 'اپنے الفاظ میں مفید جواب ٹائپ کریں تاکہ سمجھ ایسی چیز بنے جس پر کام کیا جا سکے۔', '/assets/story/learner-produce.webp', 'سبق کے دوران فعال طور پر جواب ٹائپ کرتا ہوا سیکھنے والا۔'],
      ['04', 'درست کریں اور استعمال کریں', 'اسے بہتر بنائیں، پھر استعمال کریں۔', 'بغیر شرمندگی کے موازنہ کریں، درست کریں، اور بہتر خیال کو کسی بامعنی کام میں استعمال کریں۔', '/assets/story/learner-apply.webp', 'پرسکون اعتماد کے ساتھ خیال کو استعمال کرتا اور ٹائپ کرتا ہوا سیکھنے والا۔'],
      ['05', 'واپس آئیں', 'واپس آئیں۔ جو حاصل کیا ہے وہ ساتھ رکھیں۔', 'بعد میں خیال کی طرف واپس آئیں۔ پائیدار پیش رفت رفتار سے نہیں، سیکھنے کے ثبوت اور واپسی سے بنتی ہے۔', '/assets/story/learner-return.webp', 'پرسکون بعد کی مطالعہ نشست میں ایک مانوس خیال کی طرف لوٹتا ہوا سیکھنے والا۔']
    ];
    return '<section class="scroll-story" id="learning-story" data-scroll-stops="' + scenes.length + '" aria-labelledby="story-title"><div class="story-stage"><canvas class="story-canvas" id="story-canvas" aria-hidden="true"></canvas><div class="story-scenes">' + scenes.map((scene, index) => '<figure class="story-scene' + (index === 0 ? ' is-active' : '') + '" data-story-scene="' + index + '"><img src="' + scene[4] + '" alt="' + scene[5] + '"></figure>').join('') + '</div><div class="story-shade" aria-hidden="true"></div><div class="story-ui content-wrap"><div class="story-topline"><p><span>Type2Learn</span> · سیکھنے کا راستہ</p><div class="story-counter" aria-live="polite"><span id="story-current">01</span><i></i><span>' + String(scenes.length).padStart(2, '0') + '</span></div></div><div class="story-copy"><p class="story-kicker">سیکھنے کی کہانی میں اسکرول، سوائپ یا ڈریگ کریں</p><h2 id="story-title">سیکھنا وہ ہے جو آپ خود کرتے ہیں۔</h2><div class="story-steps">' + scenes.map((scene, index) => '<article class="story-step' + (index === 0 ? ' is-active' : '') + '" data-story-step="' + index + '"><span>' + scene[0] + ' · ' + scene[1] + '</span><h3>' + scene[2] + '</h3><p>' + scene[3] + '</p></article>').join('') + '</div><a class="button button-primary story-action" href="/login/">سیکھنے کا نمونہ آزمائیں' + icon('arrow', true) + '</a></div><div class="story-route" aria-hidden="true">' + scenes.map((scene) => '<span>' + scene[1] + '</span>').join('') + '<i id="story-route-progress"></i></div></div></div></section>';
  };

  const urduLearningStages = [
    ['01', 'آغاز', 'پڑھیں / سنیں', 'ایک واضح خیال سے آغاز کریں۔', 'مختصر اور محدود وضاحت مقصد اور اگلے قدم کو صاف دکھاتی ہے۔'],
    ['02', 'یاد', 'یاد کریں', 'جواب سامنے آنے سے پہلے اسے یاد کریں۔', 'ایک اشارہ یاد کرنے کے اصل کام کی جگہ لیے بغیر یادداشت میں مدد دیتا ہے۔'],
    ['03', 'اظہار', 'ٹائپ کریں / بنائیں', 'اپنی سمجھ کو واضح کریں۔', 'سیکھنے والا لکھتا، بناتا، نام دیتا، حل کرتا یا قابلِ استعمال صورت میں وضاحت کرتا ہے۔'],
    ['04', 'موازنہ', 'جانچیں', 'سمجھیں کہ کیا بدلا ہے۔', 'مخصوص رائے بتاتی ہے کہ کیا مضبوط ہے اور کس چیز پر ایک اور کوشش درکار ہے۔'],
    ['05', 'تعمیرِ نو', 'درست کریں', 'بغیر شرمندگی کے بہتر بنائیں۔', 'مدد کے بعد سیکھنے والا صرف جواب دیکھنے کے بجائے خیال کو دوبارہ بناتا ہے۔'],
    ['06', 'استعمال', 'لاگو کریں', 'خیال کو کسی بامعنی جگہ استعمال کریں۔', 'نیا کام شناخت کو اس ثبوت میں بدلتا ہے کہ خیال کسی اور جگہ بھی کام آ سکتا ہے۔'],
    ['07', 'مضبوطی', 'واپس آئیں', 'بعد میں واپس آ کر اسے مضبوط کریں۔', 'بعد کی بازیافت علم کو پائیدار بناتی اور حاصل شدہ پیش رفت کی حفاظت کرتی ہے۔']
  ];

  const urduHomeLearningShuffle = () => {
    const rail = urduLearningStages.map((stage, index) => '<li class="' + (index === 0 ? 'is-active' : '') + '" data-chit-rail="' + index + '"><span>' + stage[0] + '</span></li>').join('');
    const chits = urduLearningStages.map((stage, index) => '<article class="loop-chit' + (index === 0 ? ' is-active' : '') + (index === 5 ? ' is-long' : '') + '" data-chit-card="' + index + '" aria-hidden="' + (index === 0 ? 'false' : 'true') + '"><span class="chit-number">' + stage[0] + '</span><div class="chit-copy"><p class="chit-phase">' + stage[1] + ' · ' + stage[2] + '</p><h3>' + stage[3] + '</h3><p>' + stage[4] + '</p></div><span class="chit-edge" aria-hidden="true">' + stage[2] + '</span></article>').join('');
    return '<section class="section learning-shuffle-section" id="learning-loop" aria-labelledby="learning-shuffle-title"><div class="content-wrap"><div class="section-heading learning-shuffle-heading"><div class="section-heading-copy"><p class="section-kicker">سیکھنے کا چکر</p><h2 id="learning-shuffle-title">علم اس وقت پائیدار بنتا ہے جب سیکھنے والا خود کام کرتا ہے۔</h2><p>سات عملی مراحل میں اسکرول، سوائپ یا ڈریگ کریں۔ ہر مرحلہ تعلیمی مقصد کو محفوظ رکھتا اور اگلی حرکت واضح کرتا ہے۔</p></div><div class="shuffle-position" aria-live="polite"><span id="chit-current">01</span><i></i><span>07</span></div></div><div class="learning-shuffle" data-learning-shuffle data-scroll-stops="' + urduLearningStages.length + '"><div class="chit-rail" aria-hidden="true"><div class="chit-rail-line"><i id="chit-rail-progress"></i></div><ol>' + rail + '</ol></div><div class="chit-viewport"><div class="chit-stack">' + chits + '</div><p class="chit-instruction"><span>اسکرول یا ڈریگ کریں</span> تاکہ اگلا عملی مرحلہ دیکھ سکیں</p></div></div></div></section>';
  };

  const howProcessMap = () => {
    const acts = [
      ['01', 'Enter with clarity', 'Choose · Understand', 'The learner sees the objective, what success looks like, and an accessible way into the idea.'],
      ['02', 'Work the memory', 'Recall · Produce · Correct', 'The learner retrieves, makes thinking visible, receives specific feedback, and rebuilds after support.'],
      ['03', 'Use it and keep it', 'Apply · Return', 'The idea moves into a meaningful task, then returns later so progress becomes durable.']
    ];
    return '<section class="page-section how-process-section" aria-labelledby="how-process-title"><div class="content-wrap"><p class="section-kicker">The Type2Learn method</p><h2 id="how-process-title">Seven learning actions, organized into three purposeful acts.</h2><p>The route stays predictable without making every lesson feel identical. The objective remains visible from first instruction to later return.</p><div class="how-process-map">' + acts.map((act, index) => '<article class="how-act reveal" data-delay="' + index + '"><span class="how-act-number">' + act[0] + '</span><p class="how-act-steps">' + act[2] + '</p><h3>' + act[1] + '</h3><p>' + act[3] + '</p><i aria-hidden="true"></i></article>').join('') + '</div></div></section>';
  };

  const teamDeck = () => {
    const members = [
      ['Muhammad Taha Bin Zaeem', 'Founder · Product direction', '/assets/team/founder-muhammad-taha.webp', 'Muhammad Taha Bin Zaeem, founder of Type2Learn', 'supplied', 'He leads Type2Learn’s vision, product direction, partnerships, and responsible growth—connecting the learning experience to clear standards for evidence, privacy, accessibility, and learner dignity.', 'Learning technology should make the next meaningful action clearer without making a learner smaller.', ['Vision & strategy', 'Learning experience', 'Responsible growth']],
      ['Muhammad Hamiz Bin Kashif', 'Co-founder · Engineering lead', '/assets/team/muhammad-hamiz-bin-kashif-studio.webp', 'Muhammad Hamiz Bin Kashif, engineering lead at Type2Learn, against a grey studio background', 'edited', 'His role focuses on dependable engineering systems, protected progress, accessibility, secure delivery, and calm recovery when learning is interrupted.', 'The strongest system is the one that lets every learner keep what they have earned.', ['Engineering systems', 'Protected progress', 'Reliable delivery']],
      ['Idrees Babar', 'Co-founder · Research lead', '/assets/team/idrees-babar-studio.webp', 'Idrees Babar, research lead at Type2Learn, against a grey studio background', 'edited', 'His role connects evidence review, research design, measurement quality, and honest public claims to the decisions made in the learning experience.', 'Evidence matters most when it changes what we build and what we are willing to claim.', ['Evidence review', 'Pilot design', 'Measurement quality']],
      ['Muhammad Fahad Younus', 'Co-founder · AI lead', '/assets/team/muhammad-fahad-younus-studio.webp', 'Muhammad Fahad Younus, AI lead at Type2Learn, against a grey studio background', 'edited', 'His role focuses on responsible AI direction, model evaluation, useful human oversight, and keeping automated support aligned with the learning objective.', 'Intelligent support should strengthen human judgment, not quietly replace it.', ['Responsible AI', 'Model evaluation', 'Human oversight']],
      ['Alizay Hassan', 'Co-founder · Product lead', '/assets/team/alizay-hassan-figure.webp', 'Clearly non-human grey 3D editorial figure representing the Alizay Hassan profile', 'placeholder', 'Her role brings product strategy, co-design, programme clarity, and age-respectful experience design into one coherent learner journey.', 'A clear product gives every learner a dignified way to begin, continue, and return.', ['Product strategy', 'Co-design', 'Programme clarity']]
    ];
    const statusLabel = { supplied: 'Supplied portrait', edited: 'Portrait from supplied image', placeholder: 'Non-human placeholder' };
    const cards = members.map((member, index) => '<article class="team-profile-card' + (index === 0 ? ' is-active' : '') + ' has-' + member[4] + '" data-team-card="' + index + '" aria-hidden="' + (index === 0 ? 'false' : 'true') + '"><figure class="team-profile-portrait"><img src="' + member[2] + '" alt="' + member[3] + '" width="960" height="1200" loading="lazy" decoding="async"><figcaption class="portrait-status is-' + member[4] + '">' + statusLabel[member[4]] + '</figcaption></figure><div class="team-profile-copy"><p class="section-kicker">' + member[1] + '</p><h2>' + member[0] + '</h2><p class="team-profile-statement">“' + member[6] + '”</p><p>' + member[5] + '</p><div class="team-profile-responsibilities">' + member[7].map((item) => '<span>' + item + '</span>').join('') + '</div></div></article>').join('');
    return '<section class="page-section team-deck-section" aria-labelledby="team-deck-title"><div class="content-wrap"><div class="team-deck-intro"><p class="section-kicker">The people building Type2Learn</p><h2 id="team-deck-title">Different disciplines. One accountable mission.</h2><p>The founder appears first, followed by the co-founders shaping engineering, research, AI, and product. Edited portraits are identified, and the non-human profile figure is clearly labelled.</p></div><div class="team-deck" data-team-deck data-scroll-stops="' + members.length + '"><div class="team-deck-position" aria-live="polite"><span id="team-card-current">01</span><i></i><span>' + String(members.length).padStart(2, '0') + '</span></div><div class="team-card-stack">' + cards + '</div><p class="team-deck-instruction"><span>Scroll or drag</span> to shuffle the team deck</p></div></div></section>';
  };

  const identitySection = () => {
    if (isUrdu) {
      return '<section class="section identity-section" aria-labelledby="type2learn-identity"><div class="content-wrap identity-layout"><div class="identity-copy"><p class="section-kicker"><span lang="en">Type2Learn Active Learning</span></p><h2 id="type2learn-identity">ٹائپنگ سیکھنے کا عمل ہے — آخری مقصد نہیں۔</h2><p class="identity-lead">Type2Learn ایک تعلیمی اقدام ہے جو غیر منافع بخش مقصد کے ساتھ تیار کیا جا رہا ہے۔ یہ ٹائپنگ کو محض رفتار کی مشق کے بجائے فعال سیکھنے کے طریقے کے طور پر استعمال کرتا ہے۔ سیکھنے والے تعلیمی خیالات کو یاد کرتے، اپنے الفاظ میں واضح کرتے، درست کرتے، استعمال کرتے اور بعد میں دوبارہ دہراتے ہیں۔</p></div><div class="identity-facts"><article><span>01</span><div><h3>بانی ٹیم</h3><p>بانی محمد طٰہٰ بن زعیم ہیں۔ بانی ٹیم میں <span lang="en">Muhammad Hamiz Bin Kashif</span>، <span lang="en">Idrees Babar</span>، <span lang="en">Muhammad Fahad Younus</span> اور <span lang="en">Alizay Hassan</span> شامل ہیں۔</p><a href="/ur/team/">بانی ٹیم کے پروفائلز دیکھیں</a></div></article><article><span>02</span><div><h3>مشترکہ ڈیزائن کی موجودہ حیثیت</h3><p>نیوروڈائیورجینٹ سیکھنے والوں—بشمول ڈسلیکسیا، ADHD اور آٹزم کے حامل افراد—اور متعلقہ پیشہ ور افراد کے ساتھ منظم مشترکہ ڈیزائن اور جانچ کی تیاری کی جا رہی ہے۔ مکمل بیرونی مشترکہ ڈیزائن کے نتائج کا ابھی دعویٰ نہیں کیا جا رہا۔</p><a href="/ur/co-design/">شرکت کی حیثیت اور حفاظتی اصول پڑھیں</a></div></article><article><span>03</span><div><h3>تعلیمی، طبی نہیں</h3><p>Type2Learn کسی حالت کی تشخیص، علاج یا طبی جانچ نہیں کرتا۔ کچھ عوامی تجربات ابتدائی نمونے یا منصوبہ شدہ تصورات ہیں اور انہیں اسی طرح واضح کیا گیا ہے۔</p></div></article><article><span>04</span><div><h3>واضح شناخت</h3><p><span lang="en">Type2Learn Active Learning</span>، <span lang="en">Type to Learn</span> اور اسی نام والی براؤزر ایکسٹینشن سے آزاد اور غیر وابستہ ہے۔</p></div></article></div></div></section>';
    }
    return '<section class="section identity-section" aria-labelledby="type2learn-identity"><div class="content-wrap identity-layout"><div class="identity-copy"><p class="section-kicker">Type2Learn Active Learning</p><h2 id="type2learn-identity">Typing is the learning action—not the finish line.</h2><p class="identity-lead">Type2Learn is an education initiative being developed with a nonprofit mission. It uses typing as an active-learning method—not merely as typing practice. Learners recall, explain, correct, apply, and revisit academic ideas to build durable understanding.</p></div><div class="identity-facts"><article><span>01</span><div><h3>Founding team</h3><p>Type2Learn was founded by Muhammad Taha Bin Zaeem. The founding team also includes Muhammad Hamiz Bin Kashif, Idrees Babar, Muhammad Fahad Younus, and Alizay Hassan.</p><a href="/team/">Meet the Type2Learn founding team</a></div></article><article><span>02</span><div><h3>Current co-design status</h3><p>Structured co-design and testing with neurodivergent learners—including people with dyslexia, ADHD, and autism—and relevant professionals are being prepared. Type2Learn does not yet claim completed external co-design findings.</p><a href="/co-design/">Read the participation status and safeguards</a></div></article><article><span>03</span><div><h3>Educational, not clinical</h3><p>Type2Learn does not diagnose, treat, or clinically assess any condition. Some public experiences are prototypes or planned concepts and are labelled accordingly.</p></div></article><article><span>04</span><div><h3>Independent identity</h3><p>Type2Learn Active Learning is independent and is not affiliated with Type to Learn or similarly named browser extensions.</p></div></article></div></div></section>';
  };

  const applyUrduLandingCopy = () => {
    if (!isHomeRoute) return;
    const write = (node, value) => { if (node) node.textContent = value; };
    const replaceButton = (node, label) => { if (node) node.innerHTML = label + icon('arrow', true); };

    const homeHero = document.querySelector('#main-content > .hero');
    if (homeHero) {
      const eyebrow = homeHero.querySelector('.eyebrow');
      const heading = homeHero.querySelector('h1');
      const copy = homeHero.querySelector('.hero-copy');
      if (eyebrow) eyebrow.innerHTML = '<span class="eyebrow-dot"></span>تعلیمی اقدام · غیر منافع بخش مقصد';
      if (heading) {
        heading.removeAttribute('data-animate-words');
        heading.classList.add('hero-stacked-title');
        heading.setAttribute('aria-label', 'ٹائپ کر کے سیکھیں۔ ایسا علم بنائیں جو ساتھ رہے۔');
        heading.innerHTML = '<span class="hero-line" aria-hidden="true" style="--line-index:0">ٹائپ کر کے سیکھیں۔</span><span class="hero-line" aria-hidden="true" style="--line-index:1">ایسا علم بنائیں</span><span class="hero-line" aria-hidden="true" style="--line-index:2">جو ساتھ رہے۔</span>';
      }
      write(copy, 'Type2Learn ایک تعلیمی اقدام ہے جو غیر منافع بخش مقصد کے ساتھ تیار کیا جا رہا ہے۔ یہ ٹائپنگ کے ذریعے فعال سیکھنے کو یادداشت، درستگی، استعمال اور پائیدار پیش رفت سے جوڑتا ہے۔');
      const actions = homeHero.querySelectorAll('.hero-actions .button');
      replaceButton(actions[0], 'اب آزمائیں');
      replaceButton(actions[1], 'راستے دریافت کریں');
      const trustItems = homeHero.querySelectorAll('.trust-inline > span');
      if (trustItems[0]) trustItems[0].innerHTML = icon('check', true) + 'رفتار کی بنیاد پر درجہ بندی نہیں';
      if (trustItems[1]) trustItems[1].innerHTML = icon('shield', true) + 'کم عمر سیکھنے والوں کے لیے رازداری بطورِ ڈیفالٹ';
      if (trustItems[2]) trustItems[2].innerHTML = icon('sliders', true) + 'اندازوں سے پہلے اپنے کنٹرولز';
      const scrollLabel = homeHero.querySelector('.scroll-cue > span:last-child');
      write(scrollLabel, 'سیکھنے کا طریقہ دیکھیں');
      const workspace = homeHero.querySelector('.hero-workspace');
      if (workspace) {
        write(workspace.querySelector('.workspace-brand > span'), 'رہنمائی والے سبق کا پیش منظر');
        write(workspace.querySelector('.workspace-controls .status-chip'), 'ابتدائی نمونہ');
        write(workspace.querySelector('.workspace-heading h2'), 'بتائیں کہ ویری ایبل کیا محفوظ کرتا ہے');
        write(workspace.querySelector('.workspace-heading p'), 'ایک واضح خیال۔ اگلا ایک واضح قدم۔');
        const tasks = workspace.querySelectorAll('.task-state');
        const taskCopy = [
          ['اب', 'خیال مکمل کریں', 'ویری ایبل ایک ایسی قدر محفوظ کرتا ہے جو…'],
          ['اگلا', 'اپنے الفاظ جانچیں', 'دیکھیں کہ تعریف کا مطلب کیا ہے۔'],
          ['مکمل', 'اسے کوڈ میں استعمال کریں', 'اسکور کی ایک قدر بنائیں۔']
        ];
        tasks.forEach((task, index) => {
          const item = taskCopy[index];
          if (!item) return;
          write(task.querySelector('.state-name'), item[0]);
          write(task.querySelector('strong'), item[1]);
          write(task.querySelector('span:last-child'), item[2]);
        });
        const progress = workspace.querySelectorAll('.workspace-progress > span');
        write(progress[0], 'سیکھنے کا راستہ');
        write(progress[1], '3 میں سے 1');
      }
    }

    const demo = document.getElementById('demo');
    if (demo) {
      const headingCopy = demo.querySelector('.section-heading-copy');
      const badge = demo.querySelector('.section-heading > .status-chip');
      if (headingCopy) {
        write(headingCopy.querySelector('.section-kicker'), 'فعال یادداشت آزمائیں');
        write(headingCopy.querySelector('h2'), 'ایک مختصر عمل۔ سیکھنے کا حقیقی لمحہ۔');
        write(headingCopy.querySelector('p:last-child'), 'یہ مختصر نمونہ آپ کے براؤزر میں ہی چلتا ہے؛ یہ اکاؤنٹ نہیں بناتا اور آپ کا جواب محفوظ نہیں کرتا۔ اس سے Type2Learn کے چکر کا پہلا حصہ سمجھیں۔');
      }
      write(badge, 'اسی صفحے پر');
      write(demo.querySelector('.card-label'), '7 میں سے مرحلہ 3 · ٹائپ کریں / بنائیں');
      write(demo.querySelector('.demo-top h2'), 'دیکھے بغیر خیال مکمل کریں۔');
      write(demo.querySelector('.demo-prompt strong'), 'یادداشت کا اشارہ');
      write(demo.querySelector('.demo-prompt p'), 'ویری ایبل ایک ایسی قدر محفوظ کرتا ہے جو…');
      write(demo.querySelector('.demo-top .status-chip'), 'ٹائمر نہیں');
      const input = demo.querySelector('#demo-answer');
      if (input) {
        input.placeholder = 'اپنا جواب یہاں لکھیں';
        input.setAttribute('dir', 'rtl');
        input.setAttribute('lang', 'ur');
      }
      replaceButton(demo.querySelector('.demo-form .button'), 'جواب جانچیں');
      write(demo.querySelector('#demo-feedback'), 'آپ یہ نمونہ کسی بھی وقت چھوڑ سکتے ہیں۔');
      write(demo.querySelector('.demo-footer > span'), 'جہاں مقصد اجازت دے، مختلف مگر درست جوابات قبول کیے جاتے ہیں۔');
      write(demo.querySelector('#skip-demo'), 'یہ سرگرمی دوبارہ شروع کریں');
      const controls = demo.querySelectorAll('.control-preview');
      const controlCopy = ['کم حرکت کے لیے تیار', 'آواز بند ہے', 'لفظی ہدایات دستیاب ہیں', 'کی بورڈ پہلے'];
      controls.forEach((control, index) => {
        if (controlCopy[index]) control.innerHTML = icon(['pause', 'headphones', 'message', 'keyboard'][index], true) + controlCopy[index];
      });
    }

    const moduleData = [
      ['لفظ سازی', 'ڈھالا گیا', 'آواز، املا، معنی، درستگی اور واپسی کے ذریعے منظم خواندگی اور تعلیمی الفاظ سیکھنے کا راستہ۔', ['جائزہ شدہ لفظی اجزاء', 'بامعنی تعمیرِ نو', 'دیر سے بازیافت']],
      ['توجہ کا مرحلہ', 'ڈھالا گیا', 'واضح منصوبے، ایک موجودہ کام اور پرسکون واپسی کے ساتھ جماعتی درجے کے کام کے لیے محدود مرحلہ۔', ['اب → اگلا → مکمل', 'خودکار محفوظ کاری اور واپسی', 'فوکس اسکور کے بغیر مدد']],
      ['واضح راستہ', 'ڈھالا گیا', 'مستحکم سبق کی ساخت، تبدیلی کی واضح معلومات اور سیکھنے والے کے اختیار میں حسی کنٹرولز۔', ['پیش منظر کارڈ', 'لفظی ہدایات کے اختیارات', 'حسی واقعات کی وضاحت']]
    ];
    const moduleSection = document.querySelector('.module-grid')?.closest('section');
    if (moduleSection) moduleSection.id = 'pathways';
    if (moduleSection) {
      write(moduleSection.querySelector('.section-kicker'), 'تین مربوط تجربات');
      write(moduleSection.querySelector('.section-heading h2'), 'کام کو سہارا دیں — کسی لیبل کو نہیں۔');
      write(moduleSection.querySelector('.section-heading p:not(.section-kicker)'), 'ہر تجربہ تعلیمی مقصد کو سامنے رکھتا ہے اور بامعنی سیکھنے میں داخل ہونے، اسے جاری رکھنے اور مکمل کرنے کے لیے نجی، قابلِ ترتیب راستے دیتا ہے۔');
    }
    document.querySelectorAll('.module-grid .module-card').forEach((card, index) => {
      const item = moduleData[index];
      if (!item) return;
      write(card.querySelector('.status-chip'), item[1]);
      write(card.querySelector('h3'), item[0]);
      write(card.querySelector('p'), item[2]);
      card.querySelectorAll('li').forEach((node, listIndex) => write(node, item[3][listIndex]));
    });

    const supportPanel = document.querySelector('.support-panel');
    const supportSection = supportPanel?.closest('section');
    if (supportSection) supportSection.id = 'controls';
    if (supportPanel) {
      write(supportPanel.querySelector('.section-kicker'), 'نجی تعلیمی کنٹرولز');
      write(supportPanel.querySelector('h2'), 'ہر ذہن کو مناسب کنٹرولز درکار ہیں — کم تر توقعات نہیں۔');
      write(supportPanel.querySelector(':scope > p:not(.section-kicker)'), 'ہر سیکھنے والا منتخب کر سکتا ہے کہ شرکت میں کیا مدد دیتا ہے۔ ترتیبات بطورِ ڈیفالٹ نجی ہیں اور کسی تشخیص کا نام نہیں۔');
      const supportItems = [
        ['حرکت اور آواز', 'کم حرکت، غیر متوقع اینیمیشن نہیں، اور خودکار آواز نہیں۔'],
        ['پڑھنا اور جواب دینا', 'متن کا حجم، وقفہ، بلند آواز سے پڑھنا، کیپشن، ٹائپنگ، آواز اور مزید۔'],
        ['منصوبہ اور رفتار', 'واضح مراحل، ٹائمر کا اختیار، توقف، واپسی، اور ایک اگلا قدم۔'],
        ['مدد اور وضاحت', 'لفظی ہدایات، مثالیں، ماخذ کی جھلکیاں اور متبادل راستے۔']
      ];
      supportPanel.querySelectorAll('.support-item').forEach((item, index) => {
        if (!supportItems[index]) return;
        write(item.querySelector('strong'), supportItems[index][0]);
        write(item.querySelector('span'), supportItems[index][1]);
      });
    }

    const audienceSection = document.querySelector('.audience-grid')?.closest('section');
    if (audienceSection) {
      audienceSection.id = 'audiences';
      write(audienceSection.querySelector('.section-kicker'), 'سیکھنے سے وابستہ حقیقی لوگوں کے لیے');
      write(audienceSection.querySelector('.section-heading h2'), 'ایک سیکھنے کا آلہ۔ ہر مخاطب کے لیے واضح راستے۔');
    }
    const audienceData = [
      ['سیکھنے والے', 'اب کیا کرنا ہے دیکھیں، اپنا کام محفوظ رکھیں، اپنے کنٹرولز منتخب کریں، اور جو کر سکتے ہیں اس کا ثبوت بنائیں۔', 'سیکھنے والے کے کنٹرولز دیکھیں'],
      ['خاندان', 'ہر لمحہ نگرانی کے بغیر سیکھنے کی روٹین اور رازداری کی بنیادی ترتیب سمجھیں۔', 'خاندانی استعمال دیکھیں'],
      ['اسکول اور ماہرین', 'بامعنی سیکھنے کا ثبوت، مدد کا تناظر اور واضح حدود دیکھیں — نگرانی کا اسکور کبھی نہیں۔', 'اسکول کا طریقہ دیکھیں']
    ];
    document.querySelectorAll('.audience-grid .audience-card').forEach((card, index) => {
      const item = audienceData[index];
      if (!item) return;
      write(card.querySelector('h3'), item[0]);
      write(card.querySelector('p'), item[1]);
      replaceButton(card.querySelector('.card-footer'), item[2]);
    });

    const evidenceGrid = document.querySelector('.evidence-grid');
    const evidenceSection = evidenceGrid?.closest('section');
    if (evidenceSection) evidenceSection.id = 'evidence';
    const evidenceData = [
      ['تحقیق سے معاونت', 'فعال مشق', 'یاد کرنا، رائے اور واپسی تعامل کے طریقے کو تشکیل دیتے ہیں۔'],
      ['ڈھالا گیا', 'مصنوعاتی ترجمہ', 'انٹرفیس کے طریقے آزمائے جانے والے مفروضے ہیں، خودبخود ثبوت نہیں۔'],
      ['زیرِ تیاری', 'مشترکہ ڈیزائن کا عمل', 'شرکت کے معیار اور حفاظتی اصول تیار کیے جا رہے ہیں؛ مکمل بیرونی نتائج کا دعویٰ نہیں۔'],
      ['منصوبہ شدہ', 'آزمائش اور پیمائش', 'تعلیمی دعوے واضح مطالعے، رضامندی اور نتائج کے ثبوت کے بعد آئیں گے۔']
    ];
    document.querySelectorAll('.evidence-grid .evidence-card').forEach((card, index) => {
      const item = evidenceData[index];
      if (!item) return;
      write(card.querySelector('.status-chip'), item[0]);
      write(card.querySelector('h3'), item[1]);
      write(card.querySelector('p'), item[2]);
    });

    const faqSection = document.querySelector('.faq-list')?.closest('section');
    if (faqSection) {
      faqSection.id = 'questions';
      write(faqSection.querySelector('.section-kicker'), 'عام سوالات');
      write(faqSection.querySelector('.section-heading h2'), 'Type2Learn کیا ہے — اور کیا نہیں — اس کے بارے میں واضح رہیں۔');
      replaceButton(faqSection.querySelector('.section-heading .button'), 'سپورٹ حاصل کریں');
    }
    const faqs = [
      ['کیا Type2Learn ٹائپنگ ٹیوٹر ہے؟', 'ٹائپنگ فعال تعامل کی سطح ہے۔ مقصد صرف رفتار نہیں بلکہ یادداشت، رائے، درستگی، منتقلی اور جائزے کے ذریعے مضمون اور مہارت سیکھنا ہے۔'],
      ['کیا یہ ڈسلیکسیا، ADHD یا آٹزم کی تشخیص یا علاج کرتا ہے؟', 'نہیں۔ Type2Learn سیکھنے والے کے اختیار میں مدد اور شواہد سے آگاہ مصنوعات کے خیالات پیش کرتا ہے۔ یہ تعلیمی پلیٹ فارم ہے، طبی، تشخیصی یا علاجی خدمت نہیں۔'],
      ['پلیٹ فارم کیا جمع کرتا ہے؟', 'مصنوعات کی سمت کم سے کم معلومات کی ہے: نجی سیکھنے کا کام اور ترتیبات، ہدفی اشتہارات نہیں، سیکھنے والے کے ڈیٹا کی فروخت نہیں، اور واضح عمر کے مطابق اجازت کے بغیر عوامی ماڈل کی تربیت نہیں۔'],
      ['کیا یہ تمام تجربات جاری ہو چکے ہیں؟', 'نہیں۔ یہ عوامی پیش منظر تصورات کی حیثیت دیانت داری سے دکھاتا ہے۔ پہلی تعمیر ایک مکمل خواندگی پر مبنی سیکھنے کے راستے اور دوبارہ استعمال ہونے والے فعال سیکھنے کے انجن پر مرکوز ہے۔']
    ];
    document.querySelectorAll('.faq-list details').forEach((faq, index) => {
      const item = faqs[index];
      if (!item) return;
      write(faq.querySelector('summary'), item[0]);
      write(faq.querySelector('p'), item[1]);
    });

    const quote = document.querySelector('.quote-block');
    if (quote) {
      write(quote.querySelector('p'), 'شرکت کے لیے ڈیزائن کیا گیا۔ جواب دہی کے ساتھ رہنمائی۔');
      write(quote.querySelector(':scope > span'), 'ٹیم سے ملیں، ثبوت کے طریقے کو دیکھیں، یا سیکھنے کے راستے دریافت کریں۔');
      const actions = quote.querySelectorAll('.inline-actions .button');
      replaceButton(actions[0], 'ٹیم سے ملیں');
      replaceButton(actions[1], 'راستے دریافت کریں');
    }
  };

  const applyOfficialCopy = () => {
    if (isUrdu) {
      applyUrduLandingCopy();
      return;
    }
    const homeHero = document.querySelector('#main-content > .hero');
    if (homeHero) {
      const eyebrow = homeHero.querySelector('.eyebrow');
      const heading = homeHero.querySelector('h1');
      const copy = homeHero.querySelector('.hero-copy');
      if (eyebrow) eyebrow.innerHTML = '<span class="eyebrow-dot"></span>Education initiative · nonprofit mission';
      if (heading) {
        heading.removeAttribute('data-animate-words');
        heading.classList.add('hero-stacked-title');
        heading.setAttribute('aria-label', 'Learn by typing. Build knowledge that stays.');
        heading.innerHTML = '<span class="hero-line" aria-hidden="true" style="--line-index:0">Learn by typing.</span><span class="hero-line" aria-hidden="true" style="--line-index:1">Build knowledge</span><span class="hero-line" aria-hidden="true" style="--line-index:2">that stays.</span>';
      }
      if (copy) copy.textContent = 'Type2Learn is an education initiative being developed with a nonprofit mission, using typing as an active-learning method through recall, correction, application, and return.';
      const actions = homeHero.querySelectorAll('.hero-actions .button');
      if (actions[0]) actions[0].innerHTML = 'Try it now' + icon('arrow', true);
    }

    const demo = document.getElementById('demo');
    if (demo) {
      const headingCopy = demo.querySelector('.section-heading-copy');
      const badge = demo.querySelector('.section-heading > .status-chip');
      if (headingCopy) {
        const kicker = headingCopy.querySelector('.section-kicker');
        const title = headingCopy.querySelector('h2');
        const copy = headingCopy.querySelector('p:last-child');
        if (kicker) kicker.textContent = 'Try active recall';
        if (title) title.textContent = 'Turn an idea into your own words.';
        if (copy) copy.textContent = 'Read the cue, retrieve the meaning, and type a response. Specific feedback helps you improve the idea and prepare to apply it.';
      }
      if (badge) badge.textContent = 'Interactive practice';
      const feedback = demo.querySelector('#demo-feedback');
      const footerCopy = demo.querySelector('.demo-footer > span');
      const reset = demo.querySelector('#skip-demo');
      if (feedback) feedback.textContent = 'Start when you are ready. A short, meaningful answer is enough.';
      if (footerCopy) footerCopy.textContent = 'Strong learning comes from retrieving, checking, and improving an idea.';
      if (reset) reset.textContent = 'Reset this activity';
    }

    if (route === 'home') {
      const ctaCopy = document.querySelector('.site-cta-copy > p:not(.section-kicker)');
      const ctaAction = document.querySelector('.site-cta-actions .button');
      if (ctaCopy) ctaCopy.textContent = 'Explore the learning pathways or begin a guided recall activity designed around one clear next step.';
      if (ctaAction) ctaAction.innerHTML = 'Try it now' + icon('arrow', true);
      const quote = document.querySelector('.quote-block');
      if (quote) {
        const quoteHeading = quote.querySelector('p');
        if (quoteHeading) quoteHeading.textContent = 'Designed for participation. Led with accountability.';
      }
    }

    const footerLabel = document.querySelector('.footer-preview-label');
    const footerBottom = document.querySelectorAll('.footer-bottom > span');
    if (footerLabel) footerLabel.textContent = 'Official Type2Learn website';
    if (footerBottom[0]) footerBottom[0].textContent = '© 2026 Type2Learn. An education initiative being developed with a nonprofit mission.';
    if (footerBottom[1]) footerBottom[1].innerHTML = '<i></i>Learning made active, accessible, and accountable.';

    document.querySelectorAll('a[href="/#demo"]').forEach((link) => {
      if (link.textContent.toLowerCase().includes('local demo')) link.innerHTML = 'Try it now' + icon('arrow', true);
    });

    if (route === 'how-it-works') {
      const aside = document.querySelector('.page-hero-aside');
      if (aside) aside.innerHTML = '<span class="aside-label">Our method</span><strong>Seven connected learning actions</strong><span>Instruction, recall, production, correction, transfer, and return work as one coherent route.</span><i class="aside-path" aria-hidden="true"></i>';
    }
    if (route === 'team') {
      const aside = document.querySelector('.page-hero-aside');
      if (aside) aside.innerHTML = '<span class="aside-label">Leadership</span><strong>Five connected profiles</strong><span>Scroll through the people shaping vision, engineering, research, responsible AI, and product.</span><i class="aside-path" aria-hidden="true"></i>';
    }
  };

  const compactFooter = () => {
    const grid = document.querySelector('.footer-grid');
    if (!grid) return;
    grid.innerHTML = isUrdu
      ? '<div><h2>دریافت کریں</h2><a href="/ur/how-it-works/">طریقۂ کار</a><a href="/ur/learning-together/">مل کر سیکھنا</a><a href="/ur/participation-trust/">شرکت اور اعتماد</a><a href="/ur/team/">بانی ٹیم</a></div><div><h2>قابلِ اعتماد معلومات</h2><a href="/ur/participation-trust/#accessibility">رسائی پذیری</a><a href="/privacy/">رازداری پالیسی <span lang="en">(English)</span></a><a href="/ur/participation-trust/#security">سکیورٹی</a><a href="/terms/">سروس کی شرائط <span lang="en">(English)</span></a></div><div><h2>رابطہ</h2><a href="https://github.com/Type2Learn" target="_blank" rel="noopener noreferrer">GitHub <span aria-hidden="true">↗</span></a><a href="https://www.linkedin.com/company/type2learn/" target="_blank" rel="noopener noreferrer">LinkedIn <span aria-hidden="true">↗</span></a></div>'
      : '<div><h2>Explore</h2><a href="/how-it-works/">How it works</a><a href="/learning-together/">Learning together</a><a href="/participation-trust/">Participation &amp; trust</a><a href="/team/">Founding team</a></div><div><h2>Trust information</h2><a href="/participation-trust/#accessibility">Accessibility</a><a href="/privacy/">Privacy Policy</a><a href="/participation-trust/#security">Security</a><a href="/terms/">Terms of Service</a></div><div><h2>Connect</h2><a href="https://github.com/Type2Learn" target="_blank" rel="noopener noreferrer">GitHub <span aria-hidden="true">↗</span></a><a href="https://www.linkedin.com/company/type2learn/" target="_blank" rel="noopener noreferrer">LinkedIn <span aria-hidden="true">↗</span></a></div>';
  };

  const enhancePage = () => {
    document.body.classList.add('route-' + route);
    document.body.classList.add('route-' + routeKey);
    if (isHomeRoute) document.body.classList.add('route-home');
    if (isUrdu) document.body.classList.add('is-urdu');
    applyOfficialCopy();
    compactFooter();

    if (routeKey === 'learning-together') {
      ['learner', 'family', 'educators'].forEach((id, index) => {
        const card = document.querySelectorAll('.audience-role')[index];
        if (card) card.id = id;
      });
    }

    if (['learning-together', 'participation-trust'].includes(routeKey)) {
      document.querySelector('.page-hero h1')?.classList.add('is-inview');
      document.querySelector('.page-hero-aside')?.classList.add('is-visible');
    }

    if (routeKey === 'team') {
      const teamHero = document.querySelector('#main-content > .page-hero');
      const teamIntro = document.querySelector('.team-deck-intro');
      if (teamHero) {
        const eyebrow = teamHero.querySelector('.eyebrow');
        const heading = teamHero.querySelector('h1');
        const copy = teamHero.querySelector('.page-hero-copy > p:not(.eyebrow)');
        if (isUrdu) {
          if (eyebrow) eyebrow.innerHTML = '<span class="eyebrow-dot"></span>بانی ٹیم';
          if (heading) heading.textContent = 'Type2Learn کی بانی ٹیم سے ملیں';
          if (copy) copy.textContent = 'Type2Learn کے بانی محمد طٰہٰ بن زعیم ہیں۔ ایک کثیر شعبہ جاتی بانی ٹیم سیکھنے کے ڈیزائن، انجینئرنگ، مصنوعی ذہانت، تحقیق، مصنوعات، رسائی اور ذمہ دار تعلیمی ٹیکنالوجی پر کام کر رہی ہے۔';
          if (teamIntro) {
            const introHeading = teamIntro.querySelector('h2');
            const introCopy = teamIntro.querySelector('p:last-child');
            if (introHeading) introHeading.textContent = 'پانچ افراد پر مشتمل بانی ٹیم سے ملیں۔';
            if (introCopy) introCopy.textContent = 'بانی پہلے ہیں، پھر انجینئرنگ، تحقیق، AI اور مصنوعات کی رہنمائی کرنے والے شریک بانی۔ ہر پروفائل اپنی موجودہ ذمہ داری واضح کرتا ہے۔';
          }
        } else {
          if (eyebrow) eyebrow.innerHTML = '<span class="eyebrow-dot"></span>Founding team';
          if (heading) heading.textContent = 'Meet the Type2Learn Founding Team';
          if (copy) copy.textContent = 'Type2Learn was founded by Muhammad Taha Bin Zaeem and is being developed by a multidisciplinary founding team working across learning design, engineering, artificial intelligence, research, product development, accessibility, and responsible educational technology.';
          if (teamIntro) {
            const introHeading = teamIntro.querySelector('h2');
            const introCopy = teamIntro.querySelector('p:last-child');
            if (introHeading) introHeading.textContent = 'Meet the five-person founding team.';
            if (introCopy) introCopy.textContent = 'The founder appears first, followed by the co-founders leading engineering, research, AI, and product. Each profile states its current responsibility clearly.';
          }
        }
      }
    }

    if (document.querySelector('.legal-document, .auth-page')) return;

    if (isHomeRoute) {
      const hero = document.querySelector('#main-content > .hero');
      if (hero) {
        hero.insertAdjacentHTML('afterend', identitySection());
        const identity = document.querySelector('.identity-section');
        if (identity) identity.insertAdjacentHTML('afterend', isUrdu ? urduScrollStory() : scrollStory());
      }

      const legacyLoop = document.querySelector('.learning-loop');
      const legacyLoopSection = legacyLoop && legacyLoop.closest('section');
      if (legacyLoopSection) legacyLoopSection.outerHTML = isUrdu ? urduHomeLearningShuffle() : homeLearningShuffle();

      const supportPanel = document.querySelector('.support-panel');
      const supportHeading = supportPanel && supportPanel.querySelector('h2');
      if (supportPanel && supportHeading && !isUrdu) {
        supportPanel.classList.add('anaphora-panel');
        const anaphoraSection = supportPanel.closest('section');
        anaphoraSection.classList.add('anaphora-section');
        anaphoraSection.dataset.scrollStops = '4';
        supportHeading.className = 'anaphora-heading';
        supportHeading.setAttribute('aria-label', 'Different minds need different controls — not different expectations of dignity.');
        supportHeading.innerHTML = '<span class="anaphora-drop" aria-hidden="true">D</span><span class="anaphora-lines" aria-hidden="true"><span>ifferent minds need</span><span>ifferent controls — not</span><span>ifferent expectations of dignity.</span></span>';
      } else if (supportPanel && isUrdu) {
        const controlsSection = supportPanel.closest('section');
        controlsSection?.classList.add('urdu-controls-section');
        if (controlsSection) controlsSection.dataset.scrollStops = '4';
      }

      const evidenceGrid = document.querySelector('.evidence-grid');
      const evidenceSection = evidenceGrid && evidenceGrid.closest('section');
      const evidenceWrap = evidenceSection && evidenceSection.querySelector(':scope > .content-wrap');
      if (evidenceSection && evidenceWrap) {
        evidenceSection.classList.add('evidence-scene');
        evidenceWrap.insertAdjacentHTML('afterbegin', isUrdu ? '<div class="evidence-scene-heading"><div><p class="section-kicker">واضح حیثیت کے ساتھ بنیاد</p><h2>چار زاویے۔ ایک دیانت دار معیار۔</h2></div><p>تحقیق، مصنوعات کا ترجمہ، زندہ تجربہ اور منصوبہ شدہ پیمائش — ہر ایک کا الگ کردار ہے۔ کسی چیز کو اس سے زیادہ ثبوت نہیں کہا جاتا جو اس نے ابھی تک کمایا نہیں۔</p></div><div class="evidence-signal" aria-hidden="true"><i></i><i></i><i></i><i></i></div>' : '<div class="evidence-scene-heading"><div><p class="section-kicker">Evidence with its status visible</p><h2>Four inputs. One honest standard.</h2></div><p>Research, product translation, lived experience, and planned measurement each have a distinct role. None is presented as proof it has not yet earned.</p></div><div class="evidence-signal" aria-hidden="true"><i></i><i></i><i></i><i></i></div>');
      }
    }

    if (route === 'how-it-works') {
      const legacyLoop = document.querySelector('.learning-loop');
      const legacyLoopSection = legacyLoop && legacyLoop.closest('section');
      if (legacyLoopSection) legacyLoopSection.outerHTML = howProcessMap();
    }

    if (route === 'team') {
      const founderSection = document.querySelector('.founder-section');
      const collaboratorsSection = document.querySelector('.collaborators-section');
      if (founderSection) founderSection.outerHTML = teamDeck();
      if (collaboratorsSection) collaboratorsSection.remove();
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
      const state = off ? (isUrdu ? 'بند' : 'Off') : (isUrdu ? 'آن' : 'On');
      const label = isUrdu ? 'حرکت' : 'Motion';
      toggle.setAttribute('aria-label', isUrdu ? ('حرکت ' + state) : (off ? 'Motion Off — turn on decorative motion' : 'Motion On — turn off decorative motion'));
      toggle.innerHTML = icon(off ? 'spark' : 'pause', true) + '<span class="motion-switch-label">' + label + '</span><span class="motion-switch-state">' + state + '</span>';
    }
    if (off) {
      document.querySelectorAll('.reveal').forEach((node) => node.classList.add('is-visible'));
      document.querySelectorAll('[data-animate-words]').forEach((node) => node.classList.add('is-inview'));
      document.querySelectorAll('[data-team-card], [data-learning-chit]').forEach((node) => node.setAttribute('aria-hidden', 'false'));
    }
    if (persist) {
      try { window.localStorage.setItem('type2learn-motion', off ? 'off' : 'on'); } catch (error) { /* Settings remain available for this page. */ }
    }
    const notifyExperience = () => window.dispatchEvent(new CustomEvent('type2learn:motion', { detail: { off } }));
    if (persist) window.requestAnimationFrame(() => window.setTimeout(notifyExperience, 0));
    else notifyExperience();
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

  const setupSectionNavigation = () => {
    const desktop = window.matchMedia('(min-width: 721px)');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const header = document.querySelector('.site-header');
    const main = document.getElementById('main-content');
    if (!main) return;

    const announcer = document.createElement('p');
    announcer.className = 'sr-only';
    announcer.setAttribute('aria-live', 'polite');
    announcer.setAttribute('aria-atomic', 'true');
    document.body.append(announcer);

    let lockedUntil = 0;
    let lastDirection = 0;
    let wheelAmount = 0;
    let lastWheelAt = 0;
    let horizontalAmount = 0;
    let lastHorizontalDirection = 0;
    let lastHorizontalAt = 0;
    let trackpadSettleTimer = 0;
    let drag = null;

    const enabled = () => desktop.matches && !reducedMotion.matches && !main.matches('.legal-document, .auth-page') && !document.body.classList.contains('motion-off') && document.body.classList.contains('experience-ready');
    const headerOffset = () => Math.max(0, Math.round((header?.getBoundingClientRect().height || 80) + 4));
    const scrollLimit = () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const documentTop = (element) => Math.max(0, Math.min(scrollLimit(), Math.round(element.getBoundingClientRect().top + window.scrollY - headerOffset())));

    const uniqueStops = (stops) => stops
      .filter((stop) => Number.isFinite(stop))
      .sort((first, second) => first - second)
      .filter((stop, index, ordered) => index === 0 || Math.abs(stop - ordered[index - 1]) > 96);

    const getStops = () => {
      const stops = Array.from(main.querySelectorAll(':scope > section:not(.builder-credit)')).map(documentTop);
      const triggers = window.ScrollTrigger?.getAll?.() || [];

      triggers.forEach((trigger) => {
        const element = trigger.trigger;
        const count = Number(element?.dataset?.scrollStops || 0);
        if (!count || !trigger.pin || !Number.isFinite(trigger.start) || !Number.isFinite(trigger.end)) return;
        const distance = trigger.end - trigger.start;
        if (distance < 120) return;
        for (let index = 0; index < count; index += 1) {
          stops.push(Math.max(0, Math.min(scrollLimit(), Math.round(trigger.start + (distance * index) / Math.max(count - 1, 1)))));
        }
      });

      return uniqueStops(stops);
    };

    const nextStop = (direction) => {
      const current = window.scrollY;
      const tolerance = 30;
      const stops = getStops();
      if (direction > 0) return stops.find((stop) => stop > current + tolerance);
      for (let index = stops.length - 1; index >= 0; index -= 1) {
        if (stops[index] < current - tolerance) return stops[index];
      }
      return null;
    };

    const scrollToStop = (direction) => {
      if (!enabled() || Date.now() < lockedUntil) return false;
      const target = nextStop(direction);
      if (target === null || target === undefined) return false;

      const travel = Math.abs(target - window.scrollY);
      const duration = Math.min(1150, Math.max(460, 260 + travel * .32));
      lockedUntil = Date.now() + duration;
      window.scrollTo({ top: target, behavior: 'smooth' });
      announcer.textContent = direction > 0 ? 'Moved to the next section.' : 'Moved to the previous section.';
      window.setTimeout(() => { lockedUntil = 0; }, duration + 80);
      return true;
    };

    const handleHorizontalStep = (delta) => {
      if (!enabled() || !delta) return false;
      const direction = Math.sign(delta) * (isUrdu ? -1 : 1);
      if (Date.now() < lockedUntil) return true;
      if (nextStop(direction) === null) return true;

      const now = Date.now();
      const amount = Math.min(Math.abs(delta), 180);
      if (direction !== lastHorizontalDirection || now - lastHorizontalAt > 260) horizontalAmount = 0;
      lastHorizontalDirection = direction;
      lastHorizontalAt = now;
      horizontalAmount += amount;

      if (horizontalAmount >= 28) {
        horizontalAmount = 0;
        scrollToStop(direction);
      }
      return true;
    };

    const settlePinnedChapter = () => {
      if (!enabled() || Date.now() < lockedUntil) return;
      const current = window.scrollY;
      const trigger = (window.ScrollTrigger?.getAll?.() || []).find((item) => {
        const count = Number(item.trigger?.dataset?.scrollStops || 0);
        return count > 1 && item.pin && current >= item.start - 36 && current <= item.end + 36;
      });
      const count = Number(trigger?.trigger?.dataset?.scrollStops || 0);
      if (!trigger || count < 2) return;
      const distance = trigger.end - trigger.start;
      const step = distance / (count - 1);
      const index = Math.min(count - 1, Math.max(0, Math.round((current - trigger.start) / step)));
      const target = Math.round(trigger.start + step * index);
      if (Math.abs(target - current) < 22) return;
      lockedUntil = Date.now() + 420;
      window.scrollTo({ top: target, behavior: 'smooth' });
      window.setTimeout(() => { lockedUntil = 0; }, 500);
    };

    const canHandleKey = (event) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return false;
      const element = event.target instanceof Element ? event.target : null;
      return !element?.closest('input, textarea, select, [contenteditable="true"], [role="textbox"], [role="listbox"], [role="menu"], dialog');
    };

    window.addEventListener('wheel', (event) => {
      if (!enabled() || event.ctrlKey) return;
      const horizontalGesture = event.shiftKey || (Math.abs(event.deltaX) >= 1 && Math.abs(event.deltaX) > Math.abs(event.deltaY));
      if (horizontalGesture) {
        const horizontalDelta = event.deltaX || event.deltaY;
        if (!horizontalDelta) return;
        const multiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
        event.preventDefault();
        handleHorizontalStep(horizontalDelta * multiplier);
        return;
      }

      if (!event.deltaY) return;
      const direction = Math.sign(event.deltaY);
      const rawAmount = Math.abs(event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1));
      const discreteWheel = event.deltaMode !== 0 || (rawAmount >= 80 && Math.abs(rawAmount % 10) < .01);
      if (!discreteWheel) {
        window.clearTimeout(trackpadSettleTimer);
        trackpadSettleTimer = window.setTimeout(settlePinnedChapter, 170);
        return;
      }
      if (Date.now() < lockedUntil) {
        event.preventDefault();
        return;
      }
      if (nextStop(direction) === null) return;

      const now = Date.now();
      const amount = Math.min(rawAmount, 160);
      if (direction !== lastDirection || now - lastWheelAt > 180) wheelAmount = 0;
      lastDirection = direction;
      lastWheelAt = now;
      wheelAmount += amount;
      event.preventDefault();

      if (wheelAmount >= 40) {
        wheelAmount = 0;
        scrollToStop(direction);
      }
    }, { passive: false });

    const isDragSafeTarget = (target) => {
      const element = target instanceof Element ? target : null;
      return !element?.closest('a, button, input, textarea, select, label, summary, [contenteditable="true"], [role="button"], [role="textbox"], [data-no-drag]');
    };

    const clearDrag = () => {
      if (!drag) return;
      if (drag.captureTarget?.hasPointerCapture?.(drag.pointerId)) drag.captureTarget.releasePointerCapture(drag.pointerId);
      drag = null;
      document.body.classList.remove('is-horizontal-dragging');
    };

    main.addEventListener('pointerdown', (event) => {
      if (!enabled() || event.pointerType !== 'mouse' || event.button !== 0 || !isDragSafeTarget(event.target)) return;
      drag = {
        pointerId: event.pointerId,
        captureTarget: main,
        startX: event.clientX,
        startY: event.clientY,
        axis: null,
        completed: false
      };
    });

    main.addEventListener('pointermove', (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const horizontal = event.clientX - drag.startX;
      const vertical = event.clientY - drag.startY;
      if (!drag.axis) {
        if (Math.max(Math.abs(horizontal), Math.abs(vertical)) < 12) return;
        if (Math.abs(horizontal) <= Math.abs(vertical) * 1.2) {
          drag.axis = 'vertical';
          clearDrag();
          return;
        }
        drag.axis = 'horizontal';
        main.setPointerCapture(event.pointerId);
        document.body.classList.add('is-horizontal-dragging');
      }
      if (drag.axis !== 'horizontal') return;
      event.preventDefault();
      if (drag.completed || Math.abs(horizontal) < 86) return;
      drag.completed = scrollToStop(horizontal < 0 ? 1 : -1);
    }, { passive: false });

    main.addEventListener('pointerup', clearDrag);
    main.addEventListener('pointercancel', clearDrag);
    main.addEventListener('lostpointercapture', clearDrag);

    window.addEventListener('keydown', (event) => {
      if (!enabled() || !canHandleKey(event)) return;
      const forward = event.key === 'ArrowDown' || (isUrdu ? event.key === 'ArrowLeft' : event.key === 'ArrowRight') || event.key === 'PageDown' || (event.key === ' ' && !event.shiftKey);
      const backward = event.key === 'ArrowUp' || (isUrdu ? event.key === 'ArrowRight' : event.key === 'ArrowLeft') || event.key === 'PageUp' || (event.key === ' ' && event.shiftKey);
      if (!forward && !backward) return;
      if (scrollToStop(forward ? 1 : -1)) event.preventDefault();
    });

    window.addEventListener('type2learn:motion', () => {
      wheelAmount = 0;
      horizontalAmount = 0;
      lockedUntil = 0;
      window.clearTimeout(trackpadSettleTimer);
      clearDrag();
    });
  };

  const setupPointerMotion = () => {
    if (!window.matchMedia('(pointer: fine)').matches) return;
    document.querySelectorAll('[data-hero-scene]').forEach((scene) => {
      scene.addEventListener('pointermove', (event) => {
        if (document.body.classList.contains('motion-off')) return;
        const rect = scene.getBoundingClientRect();
        const x = (((event.clientX - rect.left) / rect.width - 0.5) * 2) * (isUrdu ? -1 : 1);
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

  const setupFastNavigation = () => {
    document.querySelectorAll('.desktop-nav a, .mobile-nav a').forEach((link) => {
      link.addEventListener('click', (event) => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const destination = new URL(link.href, window.location.href);
        if (destination.origin !== window.location.origin) return;
        if (destination.pathname === window.location.pathname && destination.hash) return;
        event.preventDefault();
        link.classList.add('is-pending');
        document.body.classList.add('is-navigating');
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => window.location.assign(destination.href)));
      });
    });
  };

  const loadScript = (source) => new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src="' + source + '"]');
    if (existing) {
      if (existing.dataset.loaded === 'true') resolve();
      else {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
      }
      return;
    }
    const script = document.createElement('script');
    script.src = source;
    script.async = true;
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true';
      resolve();
    }, { once: true });
    script.addEventListener('error', reject, { once: true });
    document.head.append(script);
  });

  let motionRuntimeStarted = false;
  const startMotionRuntime = async () => {
    if (motionRuntimeStarted || document.querySelector('.legal-document, .auth-page')) return;
    motionRuntimeStarted = true;
    try {
      await loadScript('/vendor/gsap.min.js');
      await loadScript('/vendor/ScrollTrigger.min.js');
      await import('/experience.js?v=20260724-rtl1');
    } catch (error) {
      document.body.classList.add('experience-fallback');
    }
  };

  const setupImageDelivery = () => {
    document.querySelectorAll('img').forEach((image) => {
      image.decoding = 'async';
      if (image.classList.contains('brand-mark') || image.classList.contains('is-priority')) {
        image.loading = 'eager';
        image.fetchPriority = 'high';
        return;
      }
      image.loading = 'lazy';
      image.fetchPriority = 'low';
    });
  };

  const setupViewportComposition = () => {
    const root = document.documentElement;
    let framePending = false;

    const sync = () => {
      const width = Math.max(window.innerWidth || 0, 1);
      const height = Math.max(window.innerHeight || 0, 1);
      const ratio = width / height;
      const shape = width <= 720 ? 'mobile' : ratio >= 1.72 ? 'wide' : ratio >= 1.42 ? 'balanced' : 'tall';
      document.body.dataset.viewportShape = shape;
      root.style.setProperty('--viewport-ratio', ratio.toFixed(3));
      root.style.setProperty('--viewport-width', width + 'px');
      root.style.setProperty('--viewport-height', height + 'px');
      framePending = false;
    };

    const schedule = () => {
      if (framePending) return;
      framePending = true;
      window.requestAnimationFrame(sync);
    };

    sync();
    window.addEventListener('resize', schedule, { passive: true });
    window.visualViewport?.addEventListener('resize', schedule, { passive: true });
  };

  const setupControls = () => {
    const menu = document.getElementById('menu-toggle');
    const mobileNav = document.getElementById('mobile-nav');
    if (menu && mobileNav) {
      menu.addEventListener('click', () => {
        const open = menu.getAttribute('aria-expanded') === 'true';
        menu.setAttribute('aria-expanded', String(!open));
        menu.setAttribute('aria-label', isUrdu ? (open ? 'مینو کھولیں' : 'مینو بند کریں') : (open ? 'Open menu' : 'Close menu'));
        mobileNav.classList.toggle('is-open', !open);
      });
    }

    const motion = document.getElementById('motion-toggle');
    if (motion) motion.addEventListener('click', () => setMotion(!document.body.classList.contains('motion-off')));

    const colorModeCycle = ['flat', 'balanced', 'vivid'];
    const syncColorModeControls = (value) => {
      const mode = colorModeCycle.includes(value) ? value : colorModeApi.get();
      document.querySelectorAll('[data-color-mode-toggle]').forEach((control) => {
        control.dataset.colorMode = mode;
        control.setAttribute('aria-label', colorModeAria(mode));
        const state = control.querySelector('[data-color-mode-state]');
        if (state) state.textContent = colorModeLabel(mode);
      });
    };
    document.querySelectorAll('[data-color-mode-toggle]').forEach((control) => {
      control.addEventListener('click', () => {
        const current = colorModeApi.get();
        const next = colorModeCycle[(colorModeCycle.indexOf(current) + 1) % colorModeCycle.length];
        colorModeApi.set(next);
      });
    });
    window.addEventListener('type2learn:color-mode', (event) => syncColorModeControls(event.detail?.mode));
    syncColorModeControls(colorModeApi.get());

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
        const isAcceptedUrdu = answer.includes('تبدیل') && (answer.includes('ہو') || answer.includes('ہوت'));
        if ((isUrdu && isAcceptedUrdu) || (!isUrdu && (accepted.includes(answer) || (answer.includes('value') && answer.includes('chang'))))) {
          feedback.className = 'demo-feedback is-correct';
          feedback.textContent = isUrdu ? 'بہت اچھا — یہ جواب درستگی کے اگلے مرحلے کے لیے تیار ہے۔ اب سبق آپ سے خیال کو کوڈ میں استعمال کرنے کو کہے گا۔' : 'Good correction-ready response. Next, the lesson would ask you to apply the idea in code.';
        } else if (!answer) {
          feedback.className = 'demo-feedback is-needs-work';
          feedback.textContent = isUrdu ? 'ایک مختصر فقرہ آزمائیں۔ اشارہ یہ ہے: ”ویری ایبل ایک ایسی قدر محفوظ کرتا ہے جو…“' : 'Try one short phrase. The cue is: “A variable stores a value that can ...”';
        } else {
          feedback.className = 'demo-feedback is-needs-work';
          feedback.textContent = isUrdu ? 'آپ نے خیال شروع کر دیا ہے۔ اشارے کی طرف واپس جائیں اور بتائیں کہ محفوظ قدر کے ساتھ کیا ہو سکتا ہے۔' : 'You have started the idea. Revisit the cue and explain what can happen to the stored value.';
        }
      });
      const skip = document.getElementById('skip-demo');
      if (skip) skip.addEventListener('click', () => {
        const input = document.getElementById('demo-answer');
        if (input) input.value = '';
        feedback.className = 'demo-feedback';
        feedback.textContent = isUrdu ? 'سرگرمی دوبارہ شروع ہو گئی ہے۔ جب چاہیں پھر سے آغاز کریں۔' : 'The activity is reset. Start again whenever you are ready.';
      });
    }
  };

  const setupAuthExperience = () => {
    const authPage = document.querySelector('.auth-page');
    if (!authPage) return;

    const slides = Array.from(document.querySelectorAll('[data-auth-slide]'));
    const slideButtons = Array.from(document.querySelectorAll('[data-auth-slide-button]'));
    const formStage = document.querySelector('.auth-form-stage');
    const title = document.getElementById('auth-title');
    const description = document.getElementById('auth-description');
    const integrationNote = document.querySelector('.auth-integration-note');
    if (formStage && !document.querySelector('[data-auth-account]')) {
      formStage.insertAdjacentHTML('afterend', '<section class="auth-account" data-auth-account aria-hidden="true" hidden><span class="auth-account-avatar" data-auth-account-avatar aria-hidden="true">T2</span><p class="section-kicker">Authenticated account</p><h2 data-auth-account-name>Type2Learn learner</h2><p data-auth-account-email></p><div class="auth-account-actions"><a class="button button-primary" href="/learn/">Continue to Type2Learn' + icon('arrow', true) + '</a><button class="auth-signout" type="button" data-auth-signout>Sign out</button></div></section>');
    }
    const googleButton = document.querySelector('[data-google-auth]');
    if (googleButton && !document.querySelector('.auth-google-terms')) {
      googleButton.insertAdjacentHTML('afterend', '<p class="auth-google-terms">By continuing with Google, you agree to the <a href="/terms/">Terms of Service</a> and <a href="/privacy/">Privacy Policy</a>.</p>');
    }
    if (googleButton && !document.querySelector('[data-guest-access]')) {
      (document.querySelector('.auth-google-terms') || googleButton).insertAdjacentHTML('afterend', '<div class="auth-guest-access"><button class="auth-guest-button" type="button" data-guest-access>Continue as a guest</button><p>A random browser cookie keeps this guest space separate. No account is created.</p></div>');
    }
    const loginFormForEmailLink = document.querySelector('[data-auth-form="login"]');
    const loginOptions = loginFormForEmailLink?.querySelector('.auth-form-options');
    if (loginOptions && !document.querySelector('[data-auth-mode="email-link"]')) {
      loginOptions.insertAdjacentHTML('beforeend', '<button type="button" class="auth-text-button" data-auth-mode="email-link">Email me a sign-in link</button>');
    }
    if (formStage && !document.querySelector('[data-auth-form="email-link"]')) {
      formStage.insertAdjacentHTML('beforeend', '<form class="auth-form" data-auth-form="email-link" aria-hidden="true" hidden><div class="auth-reset-mark" aria-hidden="true">✉</div><p class="auth-reset-copy" data-email-link-copy>We will email a one-time sign-in link. It also verifies that you control this email address.</p><label class="auth-field"><span>Email address</span><input id="email-link-email" name="email" type="email" autocomplete="email" inputmode="email" placeholder="name@example.com" required></label><button class="button button-primary auth-submit" type="submit" data-email-link-submit>Email me a sign-in link</button><p class="auth-status" data-auth-status role="status" aria-live="polite"></p><p class="auth-switch"><button type="button" data-auth-mode="login">Back to sign in</button></p></form>');
    }
    const forms = Array.from(document.querySelectorAll('[data-auth-form]'));
    if (integrationNote?.lastChild) {
      integrationNote.lastChild.textContent = 'Connecting secure account services…';
      integrationNote.classList.add('is-connecting');
    }
    const modeCopy = {
      login: ['Welcome back.', 'Continue from the exact point where your learning paused.'],
      register: ['Create your account.', 'Set up a private place for progress, preferences, and return.'],
      reset: ['Reset your password.', 'Prepare a secure recovery link for the email connected to your account.'],
      'email-link': ['Sign in by email.', 'We will send a one-time link that securely signs you in and verifies your email address.']
    };
    let activeSlide = 0;
    let slideTimer = null;

    const loadSlide = (index) => {
      const image = slides[(index + slides.length) % slides.length]?.querySelector('img[data-src]');
      if (!image) return;
      image.src = image.dataset.src;
      image.removeAttribute('data-src');
    };
    const canPlaySlides = () => !document.body.classList.contains('motion-off') && !document.hidden && !window.matchMedia('(prefers-reduced-motion: reduce)').matches && !window.matchMedia('(max-width: 720px)').matches;
    const showSlide = (index, restart = true) => {
      activeSlide = (index + slides.length) % slides.length;
      loadSlide(activeSlide);
      loadSlide(activeSlide + 1);
      slides.forEach((slide, slideIndex) => {
        const active = slideIndex === activeSlide;
        slide.classList.toggle('is-active', active);
        slide.setAttribute('aria-hidden', String(!active));
      });
      slideButtons.forEach((button, buttonIndex) => button.setAttribute('aria-pressed', String(buttonIndex === activeSlide)));
      if (restart) startSlides();
    };
    const startSlides = () => {
      window.clearInterval(slideTimer);
      slideTimer = null;
      if (!canPlaySlides() || slides.length < 2) return;
      slideTimer = window.setInterval(() => showSlide(activeSlide + 1, false), 6800);
    };

    slideButtons.forEach((button) => {
      const index = Number(button.dataset.authSlideButton || 0);
      button.addEventListener('pointerenter', () => loadSlide(index), { passive: true });
      button.addEventListener('focus', () => loadSlide(index));
      button.addEventListener('click', () => showSlide(index));
    });
    window.addEventListener('type2learn:motion', startSlides);
    window.addEventListener('resize', startSlides, { passive: true });
    document.addEventListener('visibilitychange', startSlides);
    const idleLoad = () => loadSlide(1);
    if ('requestIdleCallback' in window) window.requestIdleCallback(idleLoad, { timeout: 1600 });
    else window.setTimeout(idleLoad, 900);
    startSlides();

    const showMode = (mode, focus = true) => {
      const copy = modeCopy[mode] || modeCopy.login;
      if (title) title.textContent = copy[0];
      if (description) description.textContent = copy[1];
      forms.forEach((form) => {
        const active = form.dataset.authForm === mode;
        form.hidden = !active;
        form.classList.toggle('is-active', active);
        form.setAttribute('aria-hidden', String(!active));
        const status = form.querySelector('[data-auth-status]');
        if (status) {
          status.textContent = '';
          status.className = 'auth-status';
        }
      });
      if (mode === 'reset') {
        const resetEmail = document.getElementById('reset-email');
        const loginEmail = document.getElementById('login-email');
        if (resetEmail && loginEmail?.value && !resetEmail.value) resetEmail.value = loginEmail.value;
      }
      if (mode === 'email-link') {
        const emailLinkEmail = document.getElementById('email-link-email');
        const loginEmail = document.getElementById('login-email');
        if (emailLinkEmail && loginEmail?.value && !emailLinkEmail.value) emailLinkEmail.value = loginEmail.value;
      }
      if (focus) window.requestAnimationFrame(() => document.querySelector('[data-auth-form="' + mode + '"] input')?.focus());
    };

    document.querySelectorAll('[data-auth-mode]').forEach((button) => button.addEventListener('click', () => showMode(button.dataset.authMode)));

    document.querySelectorAll('[data-password-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        const input = document.getElementById(button.dataset.passwordToggle);
        if (!input) return;
        const visible = input.type === 'text';
        input.type = visible ? 'password' : 'text';
        button.setAttribute('aria-pressed', String(!visible));
        button.setAttribute('aria-label', visible ? 'Show password' : 'Hide password');
        input.focus({ preventScroll: true });
      });
    });

    const setAuthStatus = (form, message, kind = 'ready') => {
      const status = form.querySelector('[data-auth-status]');
      if (!status) return;
      status.className = 'auth-status is-' + kind;
      status.textContent = message;
    };

    const guestButton = document.querySelector('[data-guest-access]');
    guestButton?.addEventListener('click', async () => {
      guestButton.disabled = true;
      setAuthStatus(document.querySelector('[data-auth-form="login"]'), 'Opening a private guest learning space…', 'working');
      try {
        const { createType2LearnGuest } = await import('/guest-session.js?v=20260731-guest1');
        if (!createType2LearnGuest()) throw new Error('Guest cookie unavailable');
        window.location.assign('/course/');
      } catch (_) {
        guestButton.disabled = false;
        setAuthStatus(document.querySelector('[data-auth-form="login"]'), 'Guest access needs browser cookies. Enable cookies for this site and try again.', 'error');
      }
    });

    const loginForm = document.querySelector('[data-auth-form="login"]');
    const loginEmail = document.getElementById('login-email');
    const rememberEmail = document.getElementById('remember-email');
    try {
      const savedEmail = window.localStorage.getItem('type2learn-remember-email');
      if (savedEmail && loginEmail && rememberEmail) {
        loginEmail.value = savedEmail;
        rememberEmail.checked = true;
      }
    } catch (error) { /* The form remains usable when storage is unavailable. */ }

    const registerForm = document.querySelector('[data-auth-form="register"]');
    const registerPassword = document.getElementById('register-password');
    const registerConfirm = document.getElementById('register-confirm');
    const validatePasswordMatch = () => {
      if (!registerConfirm) return;
      registerConfirm.setCustomValidity(registerPassword?.value === registerConfirm.value ? '' : 'The passwords do not match.');
    };
    registerPassword?.addEventListener('input', validatePasswordMatch);
    registerConfirm?.addEventListener('input', validatePasswordMatch);
    import('/firebase-auth.js?v=20260807-google-popup2')
      .then(({ setupFirebaseAuth }) => setupFirebaseAuth({ setStatus: setAuthStatus }))
      .catch(() => {
        if (integrationNote?.lastChild) integrationNote.lastChild.textContent = 'Account services could not connect';
        integrationNote?.classList.remove('is-connecting');
        integrationNote?.classList.add('is-error');
        forms.forEach((form) => setAuthStatus(form, 'Account services could not connect. Check your internet connection and reload the page.', 'error'));
      });
  };

  setupViewportComposition();
  enhancePage();
  setupImageDelivery();
  let savedMotion = null;
  try { savedMotion = window.localStorage.getItem('type2learn-motion'); } catch (error) { /* Use the system preference. */ }
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  setMotion(savedMotion ? savedMotion === 'off' : prefersReducedMotion, false);
  animateWords();
  setupReveals();
  setupControls();
  setupAuthExperience();
  setupScrollExperience();
  setupSectionNavigation();
  setupPointerMotion();
  setupFastNavigation();
  window.addEventListener('type2learn:motion', (event) => {
    if (!event.detail?.off) startMotionRuntime();
  });
  if (!document.body.classList.contains('motion-off')) {
    if (document.readyState === 'complete') window.requestAnimationFrame(startMotionRuntime);
    else window.addEventListener('load', () => window.requestAnimationFrame(startMotionRuntime), { once: true });
  }

})();
