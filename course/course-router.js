const requested = new URLSearchParams(window.location.search).get('courseId') || '';
const legacy = !requested || requested === 'course-1-neurodivergent-conditions-v2';
if (legacy) await import('./course.js?v=20260809-playful-balance1');
else await import('./dynamic-course.js?v=20260813-authoring1');
