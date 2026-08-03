// Course 1 source: user-provided "Course 1.docx". Educational content only;
// it is not a diagnostic, assessment, or individual support recommendation.
export const COURSE_CONTENT = {
  id: 'course-1-neurodivergent-conditions-v2',
  version: '1.1',
  source: 'User-provided Course 1.docx',
  reviewStatus: 'User-provided prototype source; factual and curriculum review are pending.',
  title: 'Introduction to Neurodivergent Conditions',
  label: 'Educational course',
  contentNotice: 'This user-provided educational content describes general experiences and support ideas. It cannot identify or diagnose anyone.',
  conclusion: {
    title: 'Keep support flexible and respectful',
    paragraphs: [
      'There is no single way to experience any condition or disability. The most helpful support is flexible, respectful, and based on what the individual says they need.',
      'A useful question is: "What would make this task easier or more accessible for you?"'
    ]
  },
  finalExam: {
    title: 'Final exam',
    description: 'Use what you learned across the course. Answer one question at a time; your score is based only on correct answers.',
    questions: [
      {
        question: 'Which statement best explains why support should be individualized?',
        options: [
          ['Everyone with the same condition learns in exactly the same way.', false],
          ['A diagnosis determines a person\'s strengths and abilities.', false],
          ['People can have different strengths, challenges, and support needs.', true],
          ['Support means lowering expectations.', false]
        ]
      },
      {
        question: 'ADHD may affect a person\'s ability to:',
        options: [
          ['Hear all sounds clearly.', false],
          ['Understand numbers only.', false],
          ['Manage attention, organization, impulses, and task completion.', true],
          ['Move their body at all times.', false]
        ]
      },
      {
        question: 'Dyslexia most commonly affects:',
        options: [
          ['Reading, spelling, and processing written language.', true],
          ['Physical balance and coordination.', false],
          ['Vision in every situation.', false],
          ['A person\'s intelligence.', false]
        ]
      },
      {
        question: 'Autism Spectrum Disorder may involve differences in:',
        options: [
          ['Social communication, interaction, interests, behavior, or sensory experiences.', true],
          ['Only handwriting ability.', false],
          ['Only mathematical ability.', false],
          ['A person\'s ability to hear.', false]
        ]
      },
      {
        question: 'Dysgraphia can make which task more difficult?',
        options: [
          ['Writing, handwriting, spelling, or organizing written ideas.', true],
          ['Recognizing colors only.', false],
          ['Understanding spoken language only.', false],
          ['Walking long distances only.', false]
        ]
      },
      {
        question: 'Dyspraxia, also called Developmental Coordination Disorder, mainly affects:',
        options: [
          ['Movement, coordination, balance, and motor planning.', true],
          ['A person\'s intelligence.', false],
          ['The ability to see all objects.', false],
          ['The ability to understand emotions.', false]
        ]
      },
      {
        question: 'Dyscalculia is mainly associated with difficulty understanding:',
        options: [
          ['Numbers, quantities, calculations, or mathematical concepts.', true],
          ['Written letters only.', false],
          ['Physical movement only.', false],
          ['Sounds and volume only.', false]
        ]
      },
      {
        question: 'Auditory Processing Disorder may make it difficult to:',
        options: [
          ['Process and understand spoken sounds, especially in noisy environments.', true],
          ['See small text clearly.', false],
          ['Control hand movements.', false],
          ['Recognize numbers visually.', false]
        ]
      },
      {
        question: 'Which support may help a learner with visual impairment or low vision?',
        options: [
          ['Smaller text and lower contrast.', false],
          ['Larger text, zoom, strong contrast, or screen-reader support.', true],
          ['Removing all written instructions.', false],
          ['Using color as the only form of feedback.', false]
        ]
      },
      {
        question: 'Which statement best describes intellectual/developmental disabilities, physical or motor disabilities, and sensory processing sensitivities?',
        options: [
          ['They affect every person in exactly the same way.', false],
          ['They may affect communication, learning, movement, endurance, or responses to sensory input, so support should fit the individual.', true],
          ['They mean a person cannot learn independently.', false],
          ['Technology is the only useful form of support.', false]
        ]
      }
    ]
  },
  steps: [
    {
      module: 'Module 1',
      title: 'ADHD',
      duration: 'About 4 minutes',
      content: {
        definitionHeading: 'What is it?',
        definition: 'ADHD is a neurodevelopmental condition that can affect attention, planning, memory, time management, energy levels, and impulse control.',
        dailyLifeHeading: 'How might it affect learning or daily life?',
        dailyLife: 'A learner may forget instructions, lose track of time, struggle to start tasks, become distracted, or find it difficult to sit still for long periods.',
        strengthsHeading: 'What strengths might a person have?',
        strengths: 'Some people with ADHD may be creative, energetic, curious, good at noticing connections, or able to focus deeply on subjects they enjoy. These strengths are not the same for everyone.',
        challengesHeading: 'What challenges might they experience?',
        challenges: ['Forgetting homework or materials', 'Managing large or boring tasks', 'Waiting or taking turns', 'Organising time', 'Controlling frustration or impulses'],
        supportsHeading: 'What support can help?',
        supports: ['Break tasks into smaller steps', 'Use reminders, calendars, and checklists', 'Allow movement breaks', 'Reduce distractions', 'Give written instructions']
      },
      simple: 'ADHD can affect how someone starts, plans, and stays with a task. People can have different strengths and support needs.',
      example: 'One support idea from this module is to use visible steps and reminders.',
      hint: 'Look for the support that makes a task more visible and manageable.',
      typing: { level: 'Key idea typing', prompt: 'Type the visible key idea in the field.', target: 'Visible steps and reminders can help make a task easier to begin and follow.' },
      check: {
        question: 'Which support may help someone with ADHD?',
        options: [['Giving one very large task', false], ['Using visible steps and reminders', true], ['Removing all breaks', false], ['Expecting the learner to remember every step without support.', false]],
        explanation: 'Right. Visible steps and reminders are support ideas named in this module.'
      }
    },
    {
      module: 'Module 2',
      title: 'Dyslexia',
      duration: 'About 4 minutes',
      content: {
        definitionHeading: 'What is it?',
        definition: 'Dyslexia is a learning difference that mainly affects reading, spelling, and connecting written letters with speech sounds. It does not reflect intelligence or effort.',
        dailyLifeHeading: 'How might it affect learning or daily life?',
        dailyLife: 'Reading may take longer or feel tiring. A person may understand information better when it is explained aloud.',
        strengthsHeading: 'What strengths might a person have?',
        strengths: 'Some people with dyslexia may have strong storytelling, creative, visual, practical, or big-picture thinking skills.',
        challengesHeading: 'What challenges might they experience?',
        challenges: ['Reading unfamiliar words', 'Spelling consistently', 'Reading aloud', 'Keeping their place on a page', 'Completing long reading tasks'],
        supportsHeading: 'What support can help?',
        supports: ['Audiobooks and text-to-speech', 'Larger text and more spacing', 'Extra reading time', 'Shorter reading sections', 'Typing or oral answers when appropriate']
      },
      simple: 'Dyslexia affects some reading and spelling processes. It does not measure intelligence or effort.',
      example: 'One support idea from this module is to use text-to-speech or a shorter reading section.',
      hint: 'Notice the distinction between a reading process and a person\'s intelligence.',
      typing: { level: 'Key idea typing', prompt: 'Type the key idea in the field.', target: 'Dyslexia affects certain language and reading processes, not intelligence.' },
      check: {
        question: 'Does dyslexia mean someone has low intelligence?',
        options: [['Yes, because reading can take longer.', false], ['No. It affects certain language and reading processes, not intelligence.', true], ['Only if someone uses read-aloud support.', false], ['Only when a person needs extra reading time.', false]],
        explanation: 'Correct. The module states that dyslexia does not reflect intelligence or effort.'
      }
    },
    {