const requested = new URLSearchParams(window.location.search).get('courseId') || '';
// Keep the parameterless historical URL working for people returning to the
// prototype, while every catalogue-selected course (including the original
// Neurodivergent Conditions course) uses the reviewed Markdown manifest
// player. This makes curriculum replacement deterministic rather than adding
// a browser-only hard-coded course per new title.
if (!requested) await import('./course.js?v=20260809-playful-balance1');
else await import('./dynamic-course.js?v=20260813-authoring2');
