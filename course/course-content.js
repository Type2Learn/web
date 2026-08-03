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
      }
    },
    {
      module: 'Module 7',
      title: 'Auditory Processing Disorder',
      duration: 'About 4 minutes',
      content: {
        definitionHeading: 'What is it?',
        definition: 'Auditory Processing Disorder involves difficulty making sense of spoken sounds, even when a person may hear sounds normally.',
        dailyLifeHeading: 'How might it affect learning or daily life?',
        dailyLife: 'Understanding speech may become harder in noisy rooms, during fast conversations, or when instructions are given only once.',
        strengthsHeading: 'What strengths might a person have?',
        strengths: 'Some people may learn especially well through visual information, written examples, demonstrations, or hands-on activities.',
        challengesHeading: 'What challenges might they experience?',
        challenges: ['Following long verbal instructions', 'Understanding speech in background noise', 'Confusing similar-sounding words', 'Remembering spoken information', 'Becoming tired after long lectures'],
        supportsHeading: 'What support can help?',
        supports: ['Written instructions', 'Visual examples', 'Shorter directions', 'Quiet seating', 'Seeing the speaker\'s face', 'Repeating instructions in their own words']
      },
      simple: 'Spoken information can be easier to use when it is shorter, quieter, and available in writing too.',
      example: 'One support idea from this module is to give a shorter direction and a written version.',
      hint: 'Think about a way to make spoken information easier to keep and revisit.',
      typing: { level: 'Key idea typing', prompt: 'Type the key support idea in the field.', target: 'Shorter steps and a written version can make spoken instructions easier.' },
      check: {
        question: 'What is one way to make spoken instructions easier?',
        options: [['Give them in shorter steps and provide a written version.', true], ['Give them only once in a noisy room.', false], ['Make the direction longer and faster.', false], ['Use only fast spoken directions without a written version.', false]],
        explanation: 'Right. The module recommends shorter directions and a written version.'
      }
    },
    {
      module: 'Module 8',
      title: 'Visual Impairment / Low Vision',
      duration: 'About 4 minutes',
      content: {
        definitionHeading: 'What is it?',
        definition: 'Visual impairment and low vision are broad terms for vision differences that can affect reading, recognising objects, navigating spaces, or accessing visual information.',
        dailyLifeHeading: 'How might it affect learning or daily life?',
        dailyLife: 'A person may need alternative ways to access worksheets, screens, charts, videos, signs, or unfamiliar spaces.',
        strengthsHeading: 'What strengths might a person have?',
        strengths: 'Some people may develop strong listening, tactile, memory, navigation, communication, or problem-solving skills.',
        challengesHeading: 'What challenges might they experience?',
        challenges: ['Reading small or crowded text', 'Seeing low-contrast information', 'Managing glare or bright lights', 'Reading boards or charts', 'Navigating unfamiliar spaces', 'Experiencing eye strain'],
        supportsHeading: 'What support can help?',
        supports: ['Larger text and better contrast', 'Screen readers and magnification', 'Alt text and descriptions of visuals', 'Large-print or digital materials', 'Clear descriptions of spaces', 'Accessible pathways']
      },
      simple: 'A digital page is more accessible when it can be read, enlarged, understood, and used in different ways.',
      example: 'One support idea from this module is to provide alt text and descriptions of visuals.',
      hint: 'Look for a change that makes visual information easier to access without assuming everyone sees it the same way.',
      typing: { level: 'Guided typing', prompt: 'Type one short phrase at a time in the field.', phrases: ['Readable text and good contrast help make a page accessible.', 'Alt text and screen-reader-friendly formatting help too.'] },
      check: {
        question: 'What is one way to make a digital page more accessible?',
        options: [['Use readable text, good contrast, zoom, alt text, or screen-reader-friendly formatting.', true], ['Make all text small and crowded.', false], ['Use low contrast so fewer details are visible.', false], ['Remove zoom and screen-reader support.', false]],
        explanation: 'Correct. The module lists readable text, contrast, zoom, alt text, and screen-reader-friendly formatting.'
      }
    },
    {
      module: 'Module 9',
      title: 'Intellectual / Developmental Disabilities',
      duration: 'About 4 minutes',
      content: {
        definitionHeading: 'What is it?',
        definition: 'Developmental disabilities can affect learning, communication, movement, behaviour, or daily living. Intellectual disability involves differences in intellectual functioning and everyday adaptive skills.',
        dailyLifeHeading: 'How might it affect learning or daily life?',
        dailyLife: 'A person may need more time, repetition, practical examples, or support with routines, communication, planning, money, or safety.',
        strengthsHeading: 'What strengths might a person have?',
        strengths: 'Strengths may include practical skills, creativity, memory for familiar routines, music, art, sports, kindness, or strong relationships.',
        challengesHeading: 'What challenges might they experience?',
        challenges: ['Understanding abstract ideas', 'Following long instructions', 'Making quick decisions', 'Managing unfamiliar routines', 'Explaining what support they need', 'Being rushed or spoken over'],
        supportsHeading: 'What support can help?',
        supports: ['Clear and simple language', 'Pictures and demonstrations', 'Small, manageable steps', 'Repetition and practice', 'Extra response time', 'Allowing the person to try independently']
      },
      simple: 'A helpful support can make the task clearer while still allowing someone to try independently.',
      example: 'One support idea from this module is to use clear language, small steps, and extra response time.',
      hint: 'Look for the response that respects the person\'s choices and chance to participate.',
      typing: { level: 'Recall typing', prompt: 'In your own words, describe what is better than taking over a task immediately. The prompt stays inside the field while you type.', reference: 'Ask what support the person wants and allow them to try first.' },
      check: {
        question: 'What is better than taking over a task immediately?',
        options: [['Ask what support the person wants and allow them to try first.', true], ['Assume the person cannot take part.', false], ['Speak over the person so the task ends quickly.', false], ['Make all choices for the person without asking.', false]],
        explanation: 'Right. The module recommends asking what support the person wants and allowing an independent try.'
      }
    },
    {
      module: 'Module 10',
      title: 'Physical / Motor Disabilities',
      duration: 'About 4 minutes',
      content: {
        definitionHeading: 'What is it?',
        definition: 'Physical or motor disabilities can affect movement, strength, balance, hand control, endurance, or the ability to use standard tools. They may be present from birth or result from illness, injury, pain, or another health condition.',
        dailyLifeHeading: 'How might it affect learning or daily life?',
        dailyLife: 'A person may need more time, accessible equipment, alternative ways to write or type, or accessible routes through buildings and digital spaces.',
        strengthsHeading: 'What strengths might a person have?',
        strengths: 'A person may have strong knowledge, creativity, communication, persistence, or problem-solving skills. Physical ability does not determine intelligence.',
        challengesHeading: 'What challenges might they experience?',
        challenges: ['Handwriting, typing, clicking, or drawing', 'Tremors, pain, stiffness, weakness, or fatigue', 'Opening items or managing small objects', 'Stairs, crowds, uneven ground, or narrow spaces', 'Using standard desks, keyboards, or mice', 'Having different abilities on different days'],
        supportsHeading: 'What support can help?',
        supports: ['Voice input and keyboard shortcuts', 'Trackballs, styluses, or predictive text', 'Larger buttons and one-handed typing', 'Templates and saved phrases', 'Rest breaks and flexible deadlines', 'Accessible routes and alternative tasks', 'Asking before touching someone\'s body or mobility equipment']
      },
      simple: 'Accessible tools and routes can help someone take part without making assumptions about their knowledge or ability.',
      example: 'One support idea from this module is to offer voice input, keyboard shortcuts, or larger buttons.',
      hint: 'Think about personal space, safety, and asking before offering hands-on help.',
      typing: { level: 'Key idea typing', prompt: 'Type the respectful support idea in the field.', target: 'Ask before helping with a mobility device because it is part of a person\'s personal space.' },
      check: {
        question: 'Why should someone ask before helping with a mobility device?',
        options: [['The person may have a preferred or safer way to move, and their equipment is part of their personal space.', true], ['It is always faster to move the equipment without asking.', false], ['Mobility equipment does not need personal boundaries.', false], ['Touch the equipment first, then ask later.', false]],
        explanation: 'Correct. The module notes that a person may have a preferred or safer way to move, and their equipment is part of their personal space.'
      }
    },
    {
      module: 'Module 11',
      title: 'Sensory Processing Sensitivities',
      duration: 'About 4 minutes',
      content: {
        definitionHeading: 'What are sensory sensitivities?',
        definition: 'Sensory sensitivities happen when sounds, lights, touch, movement, smells, tastes, or visual information feel unusually strong, weak, or distracting. They can occur alongside autism, ADHD, anxiety, migraine, or other experiences.',
        dailyLifeHeading: 'How might they affect learning or daily life?',
        dailyLife: 'A person may find classrooms, crowds, clothing, food, screens, smells, or sudden sounds difficult to tolerate or concentrate around.',
        strengthsHeading: 'What strengths might a person have?',
        strengths: 'Some people may notice details, patterns, sounds, textures, or changes that others miss. They may also have strong self-awareness about what helps them feel comfortable.',
        challengesHeading: 'What challenges might they experience?',
        challenges: ['Noise, bright lights, or strong smells', 'Unexpected touch', 'Crowded spaces', 'Flashing images or fast movement', 'Certain clothing or food textures', 'Becoming overwhelmed or unable to communicate'],
        supportsHeading: 'What support can help?',
        supports: ['Reduce noise, brightness, or visual clutter', 'Use headphones or fidget tools', 'Offer quiet spaces', 'Allow movement or regulation breaks', 'Notice early signs of overload', 'Let people explain their sensory needs without embarrassment']
      },
      simple: 'Reducing stimulation and taking a break can help before sensory overload becomes more severe.',
      example: 'One support idea from this module is to reduce noise or visual clutter and offer a quiet space.',
      hint: 'Look for the response that reduces stimulation before someone becomes overwhelmed.',
      typing: { level: 'Recall typing', prompt: 'In your own words, describe a helpful response to early signs of sensory overload. The prompt stays inside the field while you type.', reference: 'Reduce stimulation and take a break before the overload becomes more severe.' },
      check: {
        question: 'What should someone do when they notice early signs of sensory overload?',
        options: [['Reduce stimulation and take a break before the overload becomes more severe.', true], ['Add more flashing images and noise.', false], ['Ignore the signs until the task is over.', false], ['Increase stimulation so the learner gets used to it.', false]],
        explanation: 'Right. The module recommends reducing stimulation and taking a break before overload becomes more severe.'
      }
    }
  ]
};
