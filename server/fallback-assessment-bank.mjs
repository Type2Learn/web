// Authored assessment reserve. This is intentionally deterministic source
// code, not an AI output: it keeps the learner journey available when a model
// provider, a generated bank, or an evaluator is offline.

const idFor = (prefix, position) => `${prefix}-${String(position).padStart(2, '0')}`;

const supportFromSource = (source) => {
  const match = String(source || '').match(/(?:support|supports):\s*([^\n.;]+)/i);
  return match?.[1]?.trim() || 'ask what support would make the next step clearer';
};

const objectivePhrase = (objective) => String(objective?.description || '')
  .replace(/^Recognise that\s+/i, '')
  .replace(/\.$/, '');

const moduleItems = (curriculum) => {
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
  const objectives = curriculum.objectives;
  const open = objectives.slice(0, 9).map((objective, index) => ({
    id: idFor('final-open', index + 1), objectiveIds: [objective.id], responseMode: 'open',
    prompt: `In your own words, explain one useful idea about ${objectivePhrase(objective)}.`,
    options: [], correctOptionIndex: -1,
    answerGuide: 'A response accurately describes the approved objective without diagnosing or making claims about a person.',
    rubric: ['Uses the relevant approved objective.', 'Keeps the explanation respectful and practical.'],
    feedback: 'Result under review. You can continue whenever you are ready.'
  }));
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
  // calm run uses a small, shuffled subset, so a return visit does not always
  // repeat the same questions while still staying inside the approved limit.
  const items = curriculum.scope === 'final'
    ? allItems
    : [
      ...allItems.filter((item) => item.responseMode === 'open').sort(() => Math.random() - 0.5).slice(0, 4),
      ...allItems.filter((item) => item.responseMode === 'mcq').sort(() => Math.random() - 0.5).slice(0, 5)
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
