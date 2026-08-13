// BEHAVIOURAL LEARNING PARTNER
// This service receives only a compact, versioned aggregate. It deliberately
// cannot receive the learner's typed response, chat, speech transcript,
// keystrokes, score, or a behavioural label. Policy selects the support; a
// model may only phrase a two-sentence message after consent.
import { createHash } from 'node:crypto';
import { apiError } from './errors.mjs';
import { adaptiveUsageCaps, usageEstimate } from './usage-ledger.mjs';

const LEGACY_COURSE_ID = 'course-1-neurodivergent-conditions-v2';
const CONSENT_VERSION = 1;
const MAX_MODULE_INDEX = 99;
const ROLES = new Set(['calm-guide', 'learning-partner', 'self-challenge', 'visual-co-explorer']);
const PHASES = new Set(['preview', 'read', 'type', 'check', 'apply', 'assessment', 'complete']);
const PRESENCE = new Set(['quiet', 'available', 'involved']);
const hash = (value) => createHash('sha256').update(String(value)).digest('hex');
const bounded = (value, maximum = 1000) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.min(Math.round(number), maximum) : 0;
};
const enumValue = (value, set, fallback) => set.has(value) ? value : fallback;
const estimateTokens = (value) => Math.ceil(String(value).length / 3);

const languageCopy = (language, english, urdu) => language === 'ur' ? urdu : english;

// These authored gaps are tied to reviewed module objectives. They let the
// fictional partner ask for one relationship without generating curriculum or
// giving away an answer. A model may only rephrase the selected line.
const partnerGaps = [
  ['I understand attention can feel different. I am still unsure how that can make starting a task harder. Can you explain one link?', 'میں سمجھتا ہوں کہ توجہ مختلف محسوس ہو سکتی ہے۔ مجھے ابھی یہ واضح نہیں کہ اس سے کام شروع کرنا کیسے مشکل ہو سکتا ہے۔ کیا آپ ایک تعلق سمجھا سکتے ہیں؟'],
  ['I know dyslexia can affect written language. What is one support that can make a page easier to work with?', 'میں جانتا ہوں کہ ڈسلیکسیا تحریری زبان پر اثر ڈال سکتا ہے۔ کون سی ایک مدد صفحے کے ساتھ کام آسان بنا سکتی ہے؟'],
  ['I understand people can experience the autism spectrum differently. Can you connect one learning experience to one respectful support?', 'میں سمجھتا ہوں کہ لوگ آٹزم اسپیکٹرم کو مختلف طرح سے محسوس کر سکتے ہیں۔ کیا آپ سیکھنے کے ایک تجربے کو ایک باعزت مدد سے جوڑ سکتے ہیں؟'],
  ['I know writing can take extra effort. What could make one written idea easier to organise?', 'میں جانتا ہوں کہ لکھنے میں اضافی محنت لگ سکتی ہے۔ ایک تحریری خیال کو منظم کرنا کس طرح آسان بنایا جا سکتا ہے؟'],
  ['I understand coordination can affect tasks. What is one way to make the next physical step clearer?', 'میں سمجھتا ہوں کہ ہم آہنگی کاموں پر اثر ڈال سکتی ہے۔ اگلا جسمانی قدم واضح بنانے کا ایک طریقہ کیا ہے؟'],
  ['I know numbers can feel difficult in different ways. Can you give one example of a support that keeps a number task understandable?', 'میں جانتا ہوں کہ اعداد مختلف طریقوں سے مشکل محسوس ہو سکتے ہیں۔ کوئی ایک مثال دیں کہ مدد کس طرح عددی کام کو قابلِ فہم رکھ سکتی ہے؟'],
  ['I understand spoken information can be hard to process in some settings. What could make one instruction easier to follow?', 'میں سمجھتا ہوں کہ کچھ جگہوں پر بولی ہوئی معلومات سمجھنا مشکل ہو سکتا ہے۔ ایک ہدایت کو آسان بنانے کے لیے کیا کیا جا سکتا ہے؟'],
  ['I know visual information can need another format. What is one way to keep the same idea accessible?', 'میں جانتا ہوں کہ بصری معلومات کو دوسرے انداز میں درکار ہو سکتی ہیں۔ اسی خیال کو قابلِ رسائی رکھنے کا ایک طریقہ کیا ہے؟'],
  ['I understand people can learn in different ways. What is one respectful support that keeps the task meaningful?', 'میں سمجھتا ہوں کہ لوگ مختلف طریقوں سے سیکھ سکتے ہیں۔ ایک باعزت مدد کیا ہے جو کام کو بامعنی رکھتی ہے؟'],
  ['I know a physical or motor task can need a different route. What could make the next action more accessible?', 'میں جانتا ہوں کہ جسمانی یا حرکی کام کو مختلف طریقہ درکار ہو سکتا ہے۔ اگلا عمل زیادہ قابلِ رسائی کیسے ہو سکتا ہے؟'],
  ['I understand sensory experiences can differ. What is one choice that could make a learning space feel more workable?', 'میں سمجھتا ہوں کہ حسی تجربات مختلف ہو سکتے ہیں۔ کون سا ایک انتخاب سیکھنے کی جگہ کو زیادہ قابلِ عمل بنا سکتا ہے؟']
];

// Authored, curriculum-bound fallbacks. They make the feature useful offline
// and guard against malformed provider wording. They offer process support,
// never a diagnosis, a score, an answer, or emotional pressure.
const authored = ({ role, trigger, language, phase, moduleIndex, courseId }) => {
  const assessment = phase === 'assessment';
  const copy = {
    'calm-guide': {
      starting: ['Start with the first visible sentence only. You can decide what comes next after that.', 'صرف پہلے نظر آنے والے جملے سے شروع کریں۔ اس کے بعد کیا کرنا ہے آپ خود طے کر سکتے ہیں۔'],
      returning: ['Welcome back. Look at the first action on this page and take only that step.', 'واپس خوش آمدید۔ اس صفحے پر پہلے عمل کو دیکھیں اور صرف وہی مرحلہ لیں۔'],
      'working-through-typing': ['Pause at the next word, then continue when it feels ready. One phrase is enough for now.', 'اگلے لفظ پر رکیں، پھر جب مناسب لگے جاری رکھیں۔ فی الحال ایک فقرہ کافی ہے۔'],
      fallback: ['Keep one clear action in view. You can move at your own pace.', 'ایک واضح عمل سامنے رکھیں۔ آپ اپنی رفتار سے آگے بڑھ سکتے ہیں۔']
    },
    'learning-partner': {
      'working-through-typing': assessment
        ? ['I can help with the process: read the prompt once, choose text or speech, then share your own answer. I cannot give an answer or hint.', 'میں عمل میں مدد کر سکتا ہوں: سوال ایک بار پڑھیں، متن یا آواز منتخب کریں، پھر اپنا جواب دیں۔ میں جواب یا اشارہ نہیں دے سکتا۔']
        : ((courseId || LEGACY_COURSE_ID) === LEGACY_COURSE_ID ? partnerGaps[moduleIndex] : null) || ['I understand part of this idea. I am still unsure how it connects to a useful support—can you explain one link in your own words?', 'میں اس خیال کا ایک حصہ سمجھتا ہوں۔ مجھے ابھی یہ واضح نہیں کہ یہ مفید مدد سے کیسے جڑتا ہے—کیا آپ اپنے الفاظ میں ایک تعلق سمجھا سکتے ہیں؟'],
      're-reading': ['I noticed you are revisiting this idea. Tell me one relationship you can see between the idea and a support.', 'لگتا ہے آپ اس خیال کو دوبارہ دیکھ رہے ہیں۔ کیا آپ خیال اور مدد کے درمیان ایک تعلق بتا سکتے ہیں؟'],
      fallback: ['Help me complete one part of the idea in your own words. I will only reflect what you show me.', 'خیال کا ایک حصہ اپنے الفاظ میں مکمل کرنے میں میری مدد کریں۔ میں صرف وہی دہراؤں گا جو آپ دکھائیں گے۔']
    },
    'self-challenge': {
      'ready-for-next-step': ['Optional mission: connect one idea from this section to a real situation. You can replace or dismiss this at any time.', 'اختیاری مشن: اس حصے کے ایک خیال کو کسی حقیقی صورتحال سے جوڑیں۔ آپ اسے کسی بھی وقت بدل یا بند کر سکتے ہیں۔'],
      fallback: ['Optional mission: repair one small idea or give one example. There is no score and you can skip it.', 'اختیاری مشن: ایک چھوٹا خیال درست کریں یا ایک مثال دیں۔ کوئی اسکور نہیں اور آپ اسے چھوڑ سکتے ہیں۔']
    },
    'visual-co-explorer': {
      're-reading': ['Would a simple map help? It can show one connection at a time between the idea, a learning impact, and a support.', 'کیا ایک سادہ نقشہ مددگار ہوگا؟ یہ خیال، سیکھنے پر اثر، اور مدد کے درمیان ایک وقت میں ایک تعلق دکھا سکتا ہے۔'],
      fallback: ['I can show this idea another way using a small visual relationship map. It will not open unless you choose it.', 'میں ایک مختصر بصری ربطی نقشے سے اس خیال کو دوسرے طریقے سے دکھا سکتا ہوں۔ یہ آپ کے انتخاب کے بغیر نہیں کھلے گا۔']
    }
  };
  const pair = copy[role]?.[trigger] || copy[role]?.fallback || copy['calm-guide'].fallback;
  return languageCopy(language, pair[0], pair[1]);
};

// Two neutral signals are required. The output describes a temporary support
// state, not a learner trait. This exact deterministic policy is also used by
// the browser for offline/local authored support.
export const directiveForContext = (context) => {
  const signals = context.signals || {};
  const count = Object.values(signals).filter(Boolean).length;
  if (!context.enabled || count < 2 || context.dismissed) return null;
  const role = context.role;
  const phase = context.phase;
  let trigger = 'needs-a-choice';
  let surface = 'bubble';
  let action = 'none';
  if (signals.delayedStart && signals.returned) {
    trigger = 'starting'; action = 'start-small';
  } else if (signals.rereads && signals.longReading) {
    trigger = 're-reading'; action = 'open-visual';
  } else if (signals.longTypingPause && signals.retries) {
    trigger = 'working-through-typing'; action = role === 'learning-partner' ? 'teach-partner' : 'smaller-step';
  } else if (signals.aiRequests && signals.noTaskMovement) {
    trigger = 'returning'; action = 'return-to-task';
  } else if (signals.completed && role === 'self-challenge') {
    trigger = 'ready-for-next-step'; action = 'optional-mission';
  } else if (signals.assessmentUncertainty) {
    trigger = 'needs-a-choice'; action = 'process-support';
  } else return null;
  if (role === 'visual-co-explorer') action = 'open-visual';
  if (context.layout === 'focused') surface = 'quiet-trigger';
  if (context.presence === 'quiet') surface = 'quiet-trigger';
  return { role, trigger, surface, action, reasonCategory: trigger, expires: 'task', message: authored({ role, trigger, language: context.language, phase, moduleIndex: context.moduleIndex, courseId: context.courseId }) };
};

// Exported for the offline contract matrix. This remains server-only code; the
// browser has no route to call it except through the authenticated endpoint.
export const cleanContext = (body = {}) => {
  const moduleIndex = Number(body.moduleIndex);
  if (!Number.isInteger(moduleIndex) || moduleIndex < 0 || moduleIndex > MAX_MODULE_INDEX) throw apiError(400, 'INVALID_MODULE', 'This partner request is not for an available module.');
  const controls = body.controls || {};
  const rawSignals = body.signals || {};
  const allowedSignals = ['delayedStart', 'returned', 'rereads', 'longReading', 'longTypingPause', 'retries', 'aiRequests', 'noTaskMovement', 'completed', 'assessmentUncertainty'];
  const courseId = String(body.courseId || LEGACY_COURSE_ID).trim().toLowerCase();
  const courseVersion = String(body.courseVersion || '').trim();
  if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(courseId) || (courseVersion && !/^\d+\.\d+(?:\.\d+)?$/.test(courseVersion))) {
    throw apiError(400, 'INVALID_COURSE_CONTEXT', 'This partner request is not for an available course.');
  }
  return {
    schemaVersion: 1,
    courseId,
    courseVersion,
    moduleIndex,
    phase: enumValue(body.phase, PHASES, 'read'),
    language: body.language === 'ur' ? 'ur' : 'en',
    layout: ['focused', 'balanced', 'open'].includes(body.layout) ? body.layout : 'balanced',
    role: enumValue(controls.role, ROLES, 'calm-guide'),
    presence: enumValue(controls.presence, PRESENCE, 'available'),
    enabled: controls.enabled === true,
    proactive: controls.proactive !== false,
    dismissed: Boolean(body.dismissed),
    // These are boolean matches only. No raw copy, typed answer, transcript,
    // microphone data, or hidden score may be carried in this contract.
    signals: Object.fromEntries(allowedSignals.map((key) => [key, Boolean(rawSignals[key])])),
    objectiveIds: Array.isArray(body.objectiveIds) ? body.objectiveIds.map((id) => String(id).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64)).filter(Boolean).slice(0, 3) : [],
    supportHistory: {
      accepted: bounded(body.supportHistory?.accepted, 20),
      dismissed: bounded(body.supportHistory?.dismissed, 20)
    }
  };
};

export const validModelMessage = (value) => {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  if (!text || text.length > 280) return '';
  if ((text.match(/[.!؟]/g) || []).length > 2) return '';
  // Keep model wording in the narrow companion role. It must not identify a
  // learner, pressure them, compare them, expose a result, or turn into an
  // answer-giving surface. The authored fallback remains available instead.
  if (/(?:\bscore\b|\bpercentage\b|\brank(?:ing)?\b|\bstreak\b|\bdiagnos\w*\b|\bdisorder\b|\bmust\b|\bcorrect answer\b|\bcopy (?:this|the) answer\b|\banswer exactly\b|\bchoose (?:an )?option\b|\bfaster than\b|\beveryone\b)/i.test(text)) return '';
  return text;
};

export const createBehaviouralPartnerService = ({ config, firebase, ledger, provider }) => {
  const enabled = () => Boolean(config.behaviourContextEnabled && config.adaptiveLearningEnabled);
  const available = () => Boolean(enabled() && firebase.available && firebase.firestore);
  const profile = (uid) => firebase.firestore.collection('type2learnLearningProfiles').doc(hash(uid));
  const status = () => ({
    enabled: enabled(), available: available(), requiresSignIn: true,
    aiWordingEnabled: Boolean(config.mascotPartnerAiEnabled && provider?.available?.() && ledger),
    primary: config.geminiFastModel || null, fallback: config.openAiModel || null,
    schemaVersion: 1
  });
  const assertConsent = async (authorization) => {
    if (!available()) throw apiError(503, 'BEHAVIOUR_CONTEXT_UNAVAILABLE', 'Learning partner support is not available right now.');
    const learner = await firebase.verifyBearer(authorization);
    const data = (await profile(learner.uid).get()).data() || {};
    if (data.consentVersion !== CONSENT_VERSION || data.adaptiveEnabled !== true) throw apiError(403, 'ADAPTIVE_CONSENT_REQUIRED', 'Choose adaptive learning support before requesting personalised partner wording.');
    return learner;
  };
  const directive = async ({ authorization, body }) => {
    const learner = await assertConsent(authorization);
    const context = cleanContext(body);
    const deterministic = directiveForContext(context);
    if (!deterministic || !context.proactive) return { directive: null, source: 'authored' };
    let message = deterministic.message;
    let source = 'authored';
    if (config.mascotPartnerAiEnabled && provider?.available?.() && ledger) {
      const instructions = 'Return JSON only: {"message":"..."}. Rephrase the supplied authored learning-partner message in at most two calm sentences. Keep the same action and objective. Never diagnose, score, pressure, compare, give a correct answer, reveal an assessment answer, or mention data collection.';
      const input = JSON.stringify({ role: deterministic.role, trigger: deterministic.trigger, phase: context.phase, language: context.language, objectiveIds: context.objectiveIds, authoredMessage: message, assessment: context.phase === 'assessment' });
      const inputTokens = estimateTokens(instructions + input);
      let reservation;
      try {
        // Reserve enough for one Gemini attempt and—only when its JSON cannot
        // be validated—one small Nano repair. Provider errors still resolve to
        // the authored message rather than consuming another unbounded call.
        reservation = await ledger.reserve({ kind: 'adaptive', userHash: hash(learner.uid), usage: { usd: usageEstimate(inputTokens * 2, 180, config), inputTokens: inputTokens * 2, outputTokens: 180, credits: 0 }, caps: adaptiveUsageCaps(config), requestsPerMinute: config.adaptiveRequestsPerMinute });
        const schema = { type: 'object', additionalProperties: false, required: ['message'], properties: { message: { type: 'string' } } };
        let generated = await provider.generate({ purpose: 'behavioural-partner', instructions, input, maxOutputTokens: 90, jsonSchema: schema });
        let parsed;
        try { parsed = JSON.parse(generated.text); } catch (_) { parsed = null; }
        let candidate = validModelMessage(parsed?.message);
        let totalInput = Number(generated.usage?.inputTokens) || inputTokens;
        let totalOutput = Number(generated.usage?.outputTokens) || 0;
        let openAiInput = generated.provider === 'openai' ? totalInput : 0;
        let openAiOutput = generated.provider === 'openai' ? totalOutput : 0;
        // Gemini produced a syntactically invalid or policy-invalid object.
        // GPT-5.4 Nano now receives the same bounded contract as a repair/
        // verification fallback—not curriculum, raw learner work, or a new
        // chance to decide the directive.
        if (!candidate && generated.provider === 'gemini') {
          generated = await provider.generate({ purpose: 'behavioural-partner', forceOpenAi: true, instructions, input, maxOutputTokens: 90, jsonSchema: schema });
          try { parsed = JSON.parse(generated.text); } catch (_) { parsed = null; }
          candidate = validModelMessage(parsed?.message);
          const repairInput = Number(generated.usage?.inputTokens) || inputTokens;
          const repairOutput = Number(generated.usage?.outputTokens) || 0;
          totalInput += repairInput;
          totalOutput += repairOutput;
          if (generated.provider === 'openai') {
            openAiInput += repairInput;
            openAiOutput += repairOutput;
          }
        }
        if (candidate) { message = candidate; source = generated.provider === 'gemini' ? 'gemini' : 'nano-fallback'; }
        await ledger.settle({ ...reservation, actual: { usd: openAiInput ? usageEstimate(openAiInput, openAiOutput, config) : 0, inputTokens: totalInput, outputTokens: totalOutput, credits: 0 } });
        reservation = null;
      } catch {
        // The deterministic message is the explicit normal fallback.
      } finally {
        if (reservation) await ledger.release({ ...reservation, tolerateMissing: true }).catch(() => {});
      }
    }
    return { directive: { ...deterministic, message, objectiveIds: context.objectiveIds }, source };
  };
  return { status, directive, cleanContext };
};
