// This policy is intentionally deterministic. A model can make the wording
// warmer, but it never decides whether support is warranted or changes a
// preference itself.
export const ADAPTIVE_POLICY_VERSION = 1;

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
  }
};

const metric = (summary, key) => Math.max(0, Number(summary?.metrics?.[key]) || 0);

export const adaptiveCandidateForSummary = (summary) => {
  const firstActionMs = metric(summary, 'firstActionMs');
  const activeMs = metric(summary, 'activeMs');
  const typingPauseMs = metric(summary, 'typingLongestPauseMs');
  const ttsStarts = metric(summary, 'ttsStarts');
  const returns = metric(summary, 'returns') + metric(summary, 'rereads');

  if (firstActionMs >= 90000) return candidates.start;
  if (typingPauseMs >= 45000 || (activeMs >= 12 * 60 * 1000 && summary?.phase === 'read')) return candidates.spacing;
  if (activeMs >= 8 * 60 * 1000 && summary?.phase === 'read' && ttsStarts === 0) return candidates.audio;
  if (returns >= 2) return candidates.encouragement;
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
