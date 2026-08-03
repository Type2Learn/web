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
      module: 'Module 3',
      title: 'Autism Spectrum Disorder',
      duration: 'About 4 minutes',
      content: {
        definitionHeading: 'What is it?',
        definition: 'Autism is a neurodevelopmental condition that can affect communication, social interaction, routines, interests, attention, and sensory experiences. Autism is a spectrum, so people can have very different strengths and support needs.',
        dailyLifeHeading: 'How might it affect learning or daily life?',
        dailyLife: 'A person may prefer clear instructions, predictable routines, focused interests, or extra time to process information and social situations.',
        strengthsHeading: 'What strengths might a person have?',
        strengths: 'Some autistic people may have strong attention to detail, deep knowledge of interests, pattern recognition, honesty, creativity, or commitment to routines.',
        challengesHeading: 'What challenges might they experience?',
        challenges: ['Understanding sarcasm or indirect language', 'Managing unexpected changes', 'Coping with crowds or sensory overload', 'Communicating in unfamiliar situations', 'Recovering after demanding social experiences'],
        supportsHeading: 'What support can help?',
        supports: ['Clear, direct language', 'Written steps and visual schedules', 'Warnings before changes', 'Quiet spaces or sensory breaks', 'Connecting activities to personal interests']
      },
      simple: 'Autism is a spectrum: people can have different experiences, strengths, and support needs.',
      example: 'One support idea from this module is to give a warning before a change.',
      hint: 'The word spectrum describes variation, not one fixed experience.',
      typing: { level: 'Guided typing', prompt: 'Type one short phrase at a time in the field.', phrases: ['Autistic people can have different combinations of strengths.', 'They can also have different support needs.'] },
      check: {
        question: 'What does "autism spectrum" mean?',
        options: [['Every autistic person has the same strengths and support needs.', false], ['Autistic people can have different combinations of strengths, challenges, and support needs.', true], ['Only one type of support is useful for autistic people.', false], ['It means autistic people cannot have strengths.', false]],
        explanation: 'Right. The module explains that autistic people can have different strengths, challenges, and support needs.'
      }
    },
    {
      module: 'Module 4',
      title: 'Dysgraphia',
      duration: 'About 4 minutes',
      content: {
        definitionHeading: 'What is it?',
        definition: 'Dysgraphia is a learning difference that can affect handwriting, spelling, written expression, organisation, and the physical process of writing.',
        dailyLifeHeading: 'How might it affect learning or daily life?',
        dailyLife: 'A learner may understand an idea but struggle to write it down quickly, neatly, or in the same way they can explain it verbally.',
        strengthsHeading: 'What strengths might a person have?',
        strengths: 'They may have strong ideas, verbal communication, creativity, problem-solving, or understanding of a topic that is not visible in their written work.',
        challengesHeading: 'What challenges might they experience?',
        challenges: ['Writing slowly', 'Hand pain or fatigue', 'Organising paragraphs', 'Copying notes', 'Spelling and punctuation', 'Producing readable handwriting'],
        supportsHeading: 'What support can help?',
        supports: ['Typing or speech-to-text', 'Graphic organisers', 'Bullet points and sentence starters', 'Handwriting breaks', 'Less unnecessary copying', 'Grading ideas separately from handwriting']
      },
      simple: 'A person can understand an idea while finding the physical process of writing difficult.',
      example: 'One support idea from this module is to use typing or speech-to-text.',
      hint: 'Think about alternatives that let someone show an idea without relying only on handwriting.',
      typing: { level: 'Recall typing', prompt: 'Use your own words to name one alternative to handwriting. The prompt stays inside the field while you type.', reference: 'For example: typing, speech-to-text, voice recording, or an oral explanation.' },
      check: {
        question: 'What is one alternative to handwriting?',
        options: [['Typing, speech-to-text, voice recording, or an oral explanation', true], ['Removing the learner\'s ideas from the task', false], ['Requiring more unnecessary copying', false], ['Only increasing the amount of handwriting required.', false]],
        explanation: 'Correct. The module lists typing, speech-to-text, voice recording, and oral explanation as alternatives.'
      }
    },
    {
      module: 'Module 5',
      title: 'Dyspraxia / Developmental Coordination Disorder',
      duration: 'About 4 minutes',
      content: {
        definitionHeading: 'What is it?',
        definition: 'Developmental Coordination Disorder, also called dyspraxia, affects movement planning, coordination, balance, and spatial awareness.',
        dailyLifeHeading: 'How might it affect learning or daily life?',
        dailyLife: 'Tasks such as writing, dressing, using tools, playing sports, or moving through busy spaces may require extra time and energy.',
        strengthsHeading: 'What strengths might a person have?',
        strengths: 'People with DCD may develop persistence, creative problem-solving, and strong awareness of how to adapt tasks to suit their bodies.',
        challengesHeading: 'What challenges might they experience?',
        challenges: ['Dropping or spilling objects', 'Learning physical skills', 'Handwriting and drawing', 'Balance and coordination', 'Moving quickly between tasks', 'Feeling tired after physical activities'],
        supportsHeading: 'What support can help?',
        supports: ['Demonstrate tasks step by step', 'Keep workspaces organised', 'Use adapted tools or pencil grips', 'Allow extra time', 'Provide typing options', 'Avoid teasing or rushing']
      },
      simple: 'DCD mainly affects movement planning and coordination. It does not determine intelligence.',
      example: 'One support idea from this module is to demonstrate a task step by step.',
      hint: 'Separate movement planning and coordination from intelligence.',
      typing: { level: 'Key idea typing', prompt: 'Type the key idea in the field.', target: 'DCD mainly affects movement planning and coordination.' },
      check: {
        question: 'Does DCD indicate low intelligence?',
        options: [['Yes, because it affects handwriting.', false], ['No. It mainly affects movement planning and coordination.', true], ['Only when someone needs extra time.', false], ['Yes, because coordination always determines intelligence.', false]],
        explanation: 'Right. The module describes DCD as affecting movement planning and coordination.'
      }
    },
    {
      module: 'Module 6',
      title: 'Dyscalculia',
      duration: 'About 4 minutes',
      content: {
        definitionHeading: 'What is it?',
        definition: 'Dyscalculia is a learning difference that affects understanding numbers, quantities, mathematical facts, measurements, and calculation steps.',
        dailyLifeHeading: 'How might it affect learning or daily life?',
        dailyLife: 'A person may find maths, money, time, measurements, schedules, or number-based instructions more difficult.',
        strengthsHeading: 'What strengths might a person have?',
        strengths: 'They may have strengths in language, creativity, practical tasks, art, communication, or problem-solving outside number-based situations.',
        challengesHeading: 'What challenges might they experience?',
        challenges: ['Remembering maths facts', 'Understanding place value', 'Choosing the correct operation', 'Telling time', 'Handling money', 'Completing timed maths questions'],
        supportsHeading: 'What support can help?',
        supports: ['Number lines and diagrams', 'Worked examples', 'Grid paper', 'Formula sheets', 'Real-life examples', 'Extra time and permitted calculation tools']
      },
      simple: 'Dyscalculia can affect number and calculation processes. Diagrams can make steps easier to see and organise.',
      example: 'One support idea from this module is to use a number line, diagram, or worked example.',
      hint: 'Look for the support that makes number relationships and steps visible.',
      typing: { level: 'Guided typing', prompt: 'Type one short phrase at a time in the field.', phrases: ['Diagrams can make numbers easier to see.', 'They can also help organise mathematical steps.'] },
      check: {
        question: 'Why can diagrams help with dyscalculia?',
        options: [['They make numbers and mathematical steps easier to see and organise.', true], ['They remove the need to understand the task.', false], ['They make every maths question timed.', false], ['They mean mathematical ideas never need explaining.', false]],
        explanation: 'Correct. Diagrams can make number relationships and steps easier to see and organise.'