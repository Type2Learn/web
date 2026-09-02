// This policy is intentionally deterministic. A model can make the wording
// warmer, but it never decides whether support is warranted or changes a
// preference itself.
export const ADAPTIVE_POLICY_VERSION = 3;

const copy = (english, urdu) => ({ english, urdu });

const candidates = {
  start: {
    id: 'start-one-small-step', kind: 'task-initiation',
    title: copy('Start one small step', 'ایک چھوٹا قدم شروع کریں'),
    description: copy('Show one clear first action at the start of the next task.', 'اگلے کام کے آغاز پر ایک واضح پہلا قدم دکھائیں۔'),
    reason: copy('This module had a long pause before the first action.', 'اس ماڈیول میں پہلے عمل سے پہلے ایک طویل وقفہ تھا۔')
  },
  spacing: {
    id: 'layout-open', kind: 'preference', preference: { key: 'layout', value: 'open' },
    title: copy('More space around each task', 'ہر کام کے ارد گرد زیادہ جگہ'),
    description: copy('Use a more open layout in the next module. You can change it back anytime.', 'اگلے ماڈیول میں زیادہ کھلی ترتیب استعمال کریں۔ آپ اسے کبھی بھی واپس بدل سکتے ہیں۔'),
    reason: copy('There were several long pauses while reading.', 'پڑھتے وقت کئی طویل وقفے آئے۔')
  },
  readingWidth: {
    id: 'reading-width-narrow', kind: 'preference', preference: { key: 'reading-width', value: 'narrow' },
    title: copy('Shorter reading lines', 'مختصر پڑھنے کی سطریں'),
    description: copy('Try shorter reading lines in the next module. You can change them back anytime.', 'اگلے ماڈیول میں مختصر سطریں آزمائیں۔ آپ انہیں کبھی بھی واپس بدل سکتے ہیں۔'),
    reason: copy('This reading section stayed open for a while.', 'یہ پڑھنے والا حصہ کچھ دیر تک کھلا رہا۔')
  },
  audio: {
    id: 'text-to-speech-on', kind: 'preference', preference: { key: 'text-to-speech', value: 'on' },
    title: copy('Keep optional read-aloud ready', 'اختیاری بلند آواز پڑھنا تیار رکھیں'),
    description: copy('Keep the Play audio control ready. It will still never start by itself.', 'آڈیو چلانے کا کنٹرول تیار رکھیں۔ یہ پھر بھی خودبخود شروع نہیں ہوگا۔'),
    reason: copy('This reading task took a little longer than usual.', 'اس پڑھنے کے کام میں معمول سے کچھ زیادہ وقت لگا۔')
  },
  encouragement: {
    id: 'encouragement-balanced', kind: 'preference', preference: { key: 'encouragement', value: 'balanced' },
    title: copy('A little more visible encouragement', 'تھوڑی زیادہ نمایاں حوصلہ افزائی'),
    description: copy('Use calm, more visible progress moments in the next module.', 'اگلے ماڈیول میں پرسکون اور زیادہ نمایاں پیش رفت کے لمحات استعمال کریں۔'),
    reason: copy('You returned to this task more than once.', 'آپ اس کام پر ایک سے زیادہ بار واپس آئے۔')
  },
  readingSpacing: {
    id: 'reading-spacing-relaxed', kind: 'preference', preference: { key: 'reading-spacing', value: 'relaxed' },
    title: copy('More room between reading lines', 'پڑھنے کی سطروں کے درمیان زیادہ جگہ'),
    description: copy('Try roomier line and paragraph spacing in the next module. You can change it back anytime.', 'اگلے ماڈیول میں سطروں اور پیراگراف کے درمیان زیادہ جگہ آزمائیں۔ آپ اسے کبھی بھی واپس بدل سکتے ہیں۔'),
    reason: copy('You moved back through several parts of this reading task.', 'آپ اس پڑھنے کے کام کے کئی حصوں میں واپس گئے۔')
  },
  readingSurface: {
    id: 'reading-surface-soft-blue', kind: 'preference', preference: { key: 'reading-surface', value: 'soft-blue' },
    title: copy('A softer reading surface', 'نرم پڑھنے کی سطح'),
    description: copy('Try the soft-blue lesson surface in the next module. It changes presentation only, not the lesson.', 'اگلے ماڈیول میں نرم نیلی سبق کی سطح آزمائیں۔ یہ صرف پیشکش بدلتی ہے، سبق نہیں۔'),
    reason: copy('You spent time with an optional visual explanation and then returned to the lesson.', 'آپ نے اختیاری بصری وضاحت کے ساتھ وقت گزارا اور پھر سبق پر واپس آئے۔')
  },
  returnFromAi: {
    id: 'return-from-ai-one-step', kind: 'task-initiation',
    title: copy('Return to one clear next step', 'ایک واضح اگلے قدم پر واپس آئیں'),
    description: copy('Keep the next task small and visible after using page support.', 'صفحے کی مدد استعمال کرنے کے بعد اگلا کام چھوٹا اور واضح رکھیں۔'),
    reason: copy('You spent time with the page helper during this module.', 'آپ نے اس ماڈیول میں صفحے کے مددگار کے ساتھ وقت گزارا۔')
  }
};

const metric = (summary, key) => Math.max(0, Number(summary?.metrics?.[key]) || 0);

export const adaptiveCandidateForSummary = (summary) => {
  const firstActionMs = metric(summary, 'firstActionMs');
  const activeMs = metric(summary, 'activeMs');
  const typingPauseMs = metric(summary, 'typingLongestPauseMs');
  const ttsStarts = metric(summary, 'ttsStarts');
  const returns = metric(summary, 'returns') + metric(summary, 'rereads');
  const rereads = metric(summary, 'rereads');
  const readingSectionMoves = metric(summary, 'readingSectionMoves');
  const scrollBacktracks = metric(summary, 'scrollBacktracks');
  const taskRevisits = metric(summary, 'taskRevisits');
  const typingRetries = metric(summary, 'typingAbandons') + (metric(summary, 'typingBackspaces') >= 8 ? 1 : 0);
  const visualActiveMs = metric(summary, 'visualActiveMs');
  const visualCloses = metric(summary, 'visualCloses');
  const aiActiveMs = metric(summary, 'aiActiveMs');
  const aiRequests = metric(summary, 'aiRequests');
  // The Behaviour Context contributes only its neutral, temporary support
  // states. It does not create a learner label, change a setting, or affect
  // assessment readiness. These states make the existing one-change proposal
  // more faithful to the learner's explicitly selected support surface.
  const behaviourStates = new Set(Array.isArray(summary?.behaviour?.states)
    ? summary.behaviour.states.map((state) => String(state)) : []);

  // The saved state names below are themselves created only after their
  // documented matched signals. `using-support` alone is not enough for an
  // offer; it must be paired with `returning`, which denotes support use with
  // no task movement. This keeps the policy at two neutral signals minimum.
  if (behaviourStates.has('starting')) return candidates.start;
  if (behaviourStates.has('returning')) return candidates.returnFromAi;
  if (behaviourStates.has('re-reading')) return candidates.readingWidth;
  if (behaviourStates.has('working-through-typing')) return candidates.spacing;
  if (firstActionMs >= 90000 && returns >= 1) return candidates.start;
  if (aiActiveMs >= 6 * 60 * 1000 && aiRequests >= 3) return candidates.returnFromAi;
  if (typingPauseMs >= 45000 && typingRetries >= 1) return candidates.spacing;
  if (activeMs >= 8 * 60 * 1000 && rereads >= 2 && summary?.phase === 'read') return candidates.readingWidth;
  if (activeMs >= 8 * 60 * 1000 && readingSectionMoves >= 3 && summary?.phase === 'read' && ttsStarts === 0) return candidates.audio;
  if (returns >= 2 && taskRevisits >= 1) return candidates.encouragement;
  if (activeMs >= 8 * 60 * 1000 && scrollBacktracks >= 3 && summary?.phase === 'read') return candidates.readingSpacing;
  if (visualActiveMs >= 45_000 && visualCloses >= 1) return candidates.readingSurface;
  return null;
};

export const visibleProposal = (proposal) => proposal ? {
  id: String(proposal.id || ''),
  moduleIndex: Number(proposal.moduleIndex) || 0,
  candidateId: String(proposal.candidateId || ''),
  kind: proposal.kind === 'preference' ? 'preference' : 'task-initiation',
  preference: proposal.preference?.key && proposal.preference?.value
    ? { key: String(proposal.preference.key), value: String(proposal.preference.value) }
    : null,
  title: String(proposal.title || ''),
  description: String(proposal.description || ''),
  reason: String(proposal.reason || ''),
  status: String(proposal.status || 'active')
} : null;
