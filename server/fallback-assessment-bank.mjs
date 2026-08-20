// Authored assessment reserve. This is intentionally deterministic source
// code, not an AI output: it keeps the learner journey available when a model
// provider, a generated bank, or an evaluator is offline.

const idFor = (prefix, position) => `${prefix}-${String(position).padStart(2, '0')}`;

// The reserve must be repeatable even when the model is unavailable. Each run
// gets a stable, per-run order in assessment-service; this selector simply
// chooses a safe authored subset without relying on Math.random().
const rotateTake = (items, amount, seed = 0) => {
  const ordered = [...items].sort((left, right) => left.id.localeCompare(right.id));
  if (ordered.length <= amount) return ordered;
  const start = Math.abs(Number(seed) || 0) % ordered.length;
  return Array.from({ length: amount }, (_, index) => ordered[(start + index) % ordered.length]);
};

const supportFromSource = (source) => {
  const match = String(source || '').match(/(?:support|supports):\s*([^\n.;]+)/i);
  return match?.[1]?.trim() || 'ask what support would make the next step clearer';
};

const objectivePhrase = (objective) => String(objective?.description || '')
  .replace(/^Recognise that\s+/i, '')
  .replace(/\.$/, '');

const reviewedFallbackAvailable = (curriculum) => curriculum?.reviewedManifest === true;

const cleanStatement = (value) => String(value || '')
  .replace(/^\s*[^:\n]{1,90}:\s*/, '')
  .replace(/\s+/g, ' ')
  .trim();

// Reviewed lessons do not need a model to form a safe reserve: their approved
// prose already supplies factual statements. This creates recognition checks
// from that prose only, while preserving an author-reviewed MCQ whenever one
// is present. It is deliberately generic across subjects—unlike the legacy
// accessibility reserve below—so a science or humanities course is never
// assessed with assumptions from the neurodivergence course.
const reviewedSourceStatements = (source) => {
  const candidates = String(source || '')
    .split(/\n+|(?<=[.!?])\s+/u)
    .map(cleanStatement)
    .filter((statement) => statement.length >= 18 && statement.length <= 260);
  return [...new Set(candidates.map((item) => item.replace(/[.!?]+$/, '')))].slice(0, 12);
};

const genericDistractors = [
  'The lesson says the idea has no connection to the topic being studied.',
  'The lesson says examples and relationships are not useful for understanding.',
  'The lesson says the main idea should be ignored when applying the topic.',
  'The lesson says there is only one possible way to explain every topic.'
];

const reviewedOpenItems = (curriculum, objectives) => {
  const prompts = [
    ['Explain the central reviewed idea in your own words.', 'A response accurately explains the approved main idea using the learner’s own words.'],
    ['Name one detail from this module that helps make the main idea clearer.', 'A response connects one approved detail to the reviewed main idea.'],
    ['Give one example, relationship, or next action that fits this module.', 'A response uses an example, relationship, or application grounded in the approved module.'],
    ['What is one important distinction this module asks a learner to notice?', 'A response identifies one meaningful course-grounded distinction or connection.'],
    ['How would you explain this idea to someone beginning the topic?', 'A response gives a clear, accurate explanation without adding unsupported claims.'],
    ['What part of this module would you check again before using the idea?', 'A response names a relevant approved detail or relationship.'],
    ['Connect the main idea to a familiar situation or another course idea.', 'A response makes a plausible connection that remains within the reviewed source.'],
    ['Summarise the module in one or two useful sentences.', 'A response accurately summarises the approved lesson idea.'],
    ['What question could help someone think further about this idea?', 'A response asks a relevant question grounded in the reviewed topic.']
  ];
  return prompts.map(([prompt, answerGuide], index) => ({
    id: idFor('reviewed-open', index + 1),
    objectiveIds: [objectives[index % objectives.length].id],
    responseMode: 'open',
    prompt,
    options: [],
    correctOptionIndex: -1,
    answerGuide,
    rubric: ['Uses an approved course idea.', 'Keeps the explanation clear and relevant.'],
    feedback: 'Result under review. You can continue to the next small question when you are ready.'
  }));
};

const reviewedMcqItem = ({ id, objectiveId, prompt, options, correctOptionIndex }) => ({
  id,
  objectiveIds: [objectiveId],
  responseMode: 'mcq',
  prompt,
  options,
  correctOptionIndex,
  answerGuide: '',
  rubric: [],
  feedback: 'Your choice is recorded. You can continue to the next small question when you are ready.'
});

const reviewedSourceMcqs = (curriculum, objectiveId, amount = 8, prefix = 'reviewed-source') => {
  const statements = reviewedSourceStatements(curriculum.source);
  const supplied = statements.length ? statements : ['The reviewed module presents one central idea and supporting details.'];
  return Array.from({ length: amount }, (_, index) => {
    const statement = supplied[index % supplied.length];
    return reviewedMcqItem({
      id: idFor(prefix, index + 1),
      objectiveId,
      prompt: index % 2 === 0
        ? 'Which statement is supported by the reviewed lesson?'
        : 'Which statement matches the approved course material?',
      options: [statement, ...genericDistractors.slice(0, 3)],
      correctOptionIndex: 0
    });
  });
};

const reviewedModuleItems = (curriculum) => {
  const objective = curriculum.objectives[0];
  const authored = curriculum?.fallbackChecks?.module;
  const authoredItem = authored && Array.isArray(authored.options) && Number.isInteger(authored.correctOptionIndex)
    ? [reviewedMcqItem({ id: authored.id || 'reviewed-module-check', objectiveId: objective.id, prompt: authored.prompt, options: authored.options, correctOptionIndex: authored.correctOptionIndex })]
    : [];
  return [
    ...reviewedOpenItems(curriculum, [objective]),
    ...authoredItem,
    ...reviewedSourceMcqs(curriculum, objective.id, 8, 'reviewed-module-source')
  ];
};

const reviewedFinalItems = (curriculum) => {
  const objectives = curriculum.objectives;
  const open = reviewedOpenItems(curriculum, objectives).slice(0, 9).map((item, index) => ({
    ...item,
    id: idFor('reviewed-final-open', index + 1)
  }));
  const authored = (Array.isArray(curriculum?.fallbackChecks?.final) ? curriculum.fallbackChecks.final : [])
    .filter((check) => Array.isArray(check?.options) && Number.isInteger(check?.correctOptionIndex) && check.objectiveId)
    .map((check, index) => reviewedMcqItem({
      id: `reviewed-final-check-${index + 1}`,
      objectiveId: check.objectiveId,
      prompt: check.prompt,
      options: check.options,
      correctOptionIndex: check.correctOptionIndex
    }));
  const sourceItems = objectives.flatMap((objective, index) => {
    const unitSource = String(curriculum.source || '').split(/\n\n+/u)[index] || curriculum.source;
    return reviewedSourceMcqs({ ...curriculum, source: unitSource }, objective.id, 2, `reviewed-final-source-${index + 1}`);
  });
  const openObjectiveIds = new Set(open.flatMap((item) => item.objectiveIds));
  const primaryCoverage = objectives
    .filter((objective) => !openObjectiveIds.has(objective.id))
    .map((objective) => sourceItems.find((item) => item.objectiveIds.includes(objective.id)))
    .filter(Boolean);
  // A final check has a fixed learner-facing rhythm. Author-approved final
  // questions are included, while source-grounded items first cover every
  // approved objective that is not already represented by an open response.
  // This is what keeps a multi-module course auditable even offline.
  const mcq = [...primaryCoverage, ...authored, ...sourceItems];
  const selected = Array.from({ length: 12 }, (_, index) => mcq[index % Math.max(1, mcq.length)]).map((item, index) => ({
    ...item,
    id: idFor('reviewed-final-mcq', index + 1)
  }));
  return [...open, ...selected];
};

const moduleItems = (curriculum) => {
  if (reviewedFallbackAvailable(curriculum)) return reviewedModuleItems(curriculum);
  const objective = curriculum.objectives[0];
  const phrase = objectivePhrase(objective);
  const support = supportFromSource(curriculum.source);
  const open = [
    ['Explain the main idea from this module in your own words.', 'A response describes the approved main idea without diagnosing anyone.'],
    ['Name one way this idea may affect learning or participation.', 'A response gives one respectful, course-grounded effect on learning or participation.'],
    ['What is one respectful support that could help?', 'A response suggests a course-grounded support and keeps learner choice visible.'],
    ['How could you use this idea in a classroom, family, or study setting?', 'A response applies the idea without making assumptions about a person.'],
    ['What is one thing this lesson asks us not to assume about another person?', 'A response avoids reducing a person to a label or a single difficulty.'],
    ['Write one clear next step that could make this task easier to begin.', 'A response offers one practical next step grounded in the lesson.'],
    ['How could someone ask about support while keeping the learner in control?', 'A response includes choice, consent, or a respectful question.'],
    ['Describe a strength or possibility that should remain visible alongside support needs.', 'A response recognises that people have individual strengths and needs.'],
    ['How could written, visual, spoken, or practical information be made clearer here?', 'A response suggests an accessible way to present information.'],
    ['What could a teacher, family member, or peer do before a task becomes overwhelming?', 'A response names a preventative, respectful support.'],
    ['Give an example of a choice that supports participation without forcing disclosure.', 'A response gives an optional support that does not demand private information.'],
    ['What part of this lesson could be useful outside a classroom?', 'A response transfers a central lesson idea to everyday participation.'],
    ['How could this idea be explained without comparing learners?', 'A response uses clear, non-competitive language.'],
    ['What would a learner-controlled version of this support look like?', 'A response keeps the person able to choose, pause, or adapt.'],
    ['Name one question you could ask to learn what would help next.', 'A response asks about needs respectfully instead of assuming.'],
    ['Summarise the lesson in one or two calm, practical sentences.', 'A response accurately summarises the approved lesson idea.']
  ].map(([prompt, guide], index) => ({
    id: idFor('open', index + 1), objectiveIds: [objective.id], responseMode: 'open', prompt,
    options: [], correctOptionIndex: -1, answerGuide: guide,
    rubric: ['Stays within the approved course idea.', 'Uses respectful, non-diagnostic language.'],
    feedback: 'Result under review. You can continue to the next small question when you are ready.'
  }));
  const mcq = [
    ['Which choice best matches the lesson?', phrase, 'Assume the same support works for everyone.', 'Use speed or ranking to decide who gets help.', 'Require a person to share private information before offering support.'],
    ['What is the most respectful next step?', support, 'Make a decision without asking the learner.', 'Remove choices to make everyone work the same way.', 'Treat support as proof that someone cannot learn.'],
    ['What does this course focus on?', 'Making participation clearer and more accessible.', 'Diagnosing a learner from one task.', 'Comparing learners by speed.', 'Using one fixed method for every learner.'],
    ['Which response keeps learner dignity in view?', 'Ask what helps and keep the next action clear.', 'Assume difficulty means a lack of ability.', 'Wait for a learner to fail before offering support.', 'Use a score to decide whether support is deserved.'],
    ['What should a useful support change?', 'The access to the task, while keeping the learning goal clear.', 'The learner’s value or potential.', 'Whether the learner can take part at all.', 'The right to ask questions or take a break.'],
    ['Which choice protects privacy?', 'Offer options without asking for a diagnosis or private proof.', 'Ask for personal records before giving a clear instruction.', 'Share a learner’s information with the whole group.', 'Make support conditional on disclosure.'],
    ['What is a good way to introduce a new task?', 'Make one next action clear and let the learner choose a useful support.', 'Give many unrelated instructions at once.', 'Hide the next step until the learner guesses it.', 'Compare the learner with others first.'],
    ['Which statement is most accurate?', 'Different people can use different supports and still work toward a meaningful goal.', 'Everyone benefits from exactly the same approach.', 'Support is only useful after repeated failure.', 'A person’s needs can be decided from one observation.'],
    ['What does respectful language do in learning?', 'It describes an idea without making assumptions about a person.', 'It replaces the need to make tasks clear.', 'It guarantees the same experience for everyone.', 'It measures how quickly someone understands.'],
    ['Which option makes participation more flexible?', 'Offer a clear alternative input or presentation when it fits the task.', 'Remove all instructions to make the task open-ended.', 'Require one fixed response format for every learner.', 'Use a public comparison to motivate learners.'],
    ['When a learner needs a pause, what is a helpful response?', 'Make a calm return path and keep the next action visible.', 'Treat the pause as a failed attempt.', 'Remove the learner from the task permanently.', 'Add more instructions immediately.'],
    ['What is a strong first question before adding a support?', 'What would help you take the next step?', 'Why can’t you work exactly like everyone else?', 'Can you prove you need help?', 'How fast can you finish without support?'],
    ['Which choice avoids a harmful assumption?', 'Keep strengths, preferences, and support needs separate from labels.', 'Assume one label predicts the same experience for everyone.', 'Assume a hard task shows a lack of effort.', 'Assume support removes independence.'],
    ['What should remain available when support is offered?', 'The learner’s ability to choose, pause, and ask for clarification.', 'A public ranking of progress.', 'A requirement to disclose private information.', 'A single fixed path with no adjustments.'],
    ['Which option uses evidence from this course appropriately?', 'Use a clear, practical support and review whether it helps participation.', 'Promise that one technique will work for everyone.', 'Use a score as the only evidence of learning.', 'Treat the lesson as a clinical diagnosis.'],
    ['What is the clearest way to continue after uncertainty?', 'Return to one small, visible next action.', 'Add several new demands at once.', 'Make the learner start the whole course again.', 'Hide feedback until the end.']
  ].map(([prompt, correct, ...incorrect], index) => ({
    id: idFor('mcq', index + 1), objectiveIds: [objective.id], responseMode: 'mcq', prompt,
    options: [correct, ...incorrect], correctOptionIndex: 0, answerGuide: '', rubric: [],
    feedback: 'Your choice is recorded. You can continue to the next small question when you are ready.'
  }));
  return [...open, ...mcq];
};

const finalItems = (curriculum) => {
  if (reviewedFallbackAvailable(curriculum)) return reviewedFinalItems(curriculum);
  const objectives = curriculum.objectives;
  // A short reviewed course can have fewer than nine objectives. A final
  // check still needs its fixed, calm 8–9 open-response shape, so reuse an
  // approved objective with a differently-worded prompt rather than silently
  // producing an invalid bank or inventing new curriculum material.
  const open = Array.from({ length: 9 }, (_, index) => {
    const objective = objectives[index % objectives.length];
    return ({
    id: idFor('final-open', index + 1), objectiveIds: [objective.id], responseMode: 'open',
    prompt: `In your own words, explain one useful idea about ${objectivePhrase(objective)}.`,
    options: [], correctOptionIndex: -1,
    answerGuide: 'A response accurately describes the approved objective without diagnosing or making claims about a person.',
    rubric: ['Uses the relevant approved objective.', 'Keeps the explanation respectful and practical.'],
    feedback: 'Result under review. You can continue whenever you are ready.'
    });
  });
  const mcq = Array.from({ length: 12 }, (_, index) => {
    const objective = objectives[index % objectives.length];
    return {
      id: idFor('final-mcq', index + 1), objectiveIds: [objective.id], responseMode: 'mcq',
      prompt: `Which choice best reflects this course idea: ${objectivePhrase(objective)}?`,
      options: [
        'Offer a clear, respectful support while keeping learner choice visible.',
        'Assume the same approach will work for everyone.',
        'Use a speed score to determine who can participate.',
        'Require private information before offering help.'
      ],
      correctOptionIndex: 0, answerGuide: '', rubric: [],
      feedback: 'Your choice is recorded. You can continue whenever you are ready.'
    };
  });
  return [...open, ...mcq];
};

export const createFallbackAssessmentBank = (curriculum) => {
  const allItems = curriculum.scope === 'final' ? finalItems(curriculum) : moduleItems(curriculum);
  // Each module has a 32-item authored reserve (16 open + 16 MCQ). A single
  // calm run uses a small deterministic subset, then assessment-service gives
  // it a stable per-run order. This keeps the no-model experience reproducible
  // and within the approved 4 open / 5 MCQ module cap.
  const items = curriculum.scope === 'final'
    ? allItems
    : [
      ...rotateTake(allItems.filter((item) => item.responseMode === 'open'), 4, Number(curriculum.moduleIndex) * 3),
      ...rotateTake(allItems.filter((item) => item.responseMode === 'mcq'), 5, Number(curriculum.moduleIndex) * 5)
    ];
  return {
    schemaVersion: 1,
    courseId: curriculum.courseId,
    curriculumVersion: curriculum.curriculumVersion,
    moduleIndex: curriculum.moduleIndex,
    language: curriculum.language,
    bankVersion: `authored-${curriculum.scope}-${curriculum.curriculumVersion}`,
    items,
    coverageMap: curriculum.objectives.map((objective) => ({
      objectiveId: objective.id,
      itemIds: items.filter((item) => item.objectiveIds.includes(objective.id)).map((item) => item.id)
    }))
  };
};
