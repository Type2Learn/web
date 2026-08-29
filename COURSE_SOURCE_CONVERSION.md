# Source-to-course conversion

Type2Learn publishes only reviewed `type2learn-theory-course/v1` courses. This
document explains how an administrator can turn source material into that
canonical file without treating a model response as curriculum approval.

## Choose the right entry point

| Starting material | Recommended route | What happens |
| --- | --- | --- |
| A complete reviewed Type2Learn Markdown file | **Import reviewed Markdown directly** | The server parses, validates, and compiles it. |
| A partially formatted Type2Learn Markdown file | **Private source intake → Convert extracted source** | The fixer normalises the text, repairs its structure if needed, then returns an editable canonical draft. |
| A `.txt`, `.md`, `.markdown`, or `.csv` source | **Private source intake → Convert extracted source** | Text is bounded and retained privately; the admin explicitly starts conversion. |
| Text-based PDF | **Private source intake → Convert extracted source** | `pdf-parse` extracts local text. The PDF binary is never sent to a model. |
| PowerPoint `.pptx` deck | **Private source intake → Convert extracted source** | The server reads only visible slide text from safe ZIP/XML entries. Images, notes, embedded media, macros, and external targets are not processed. |
| Scan, image-only PDF/deck, legacy `.ppt`, or unsupported document | **Private source intake → Download/transcribe** | It stays private and is marked **requires transcription**. No model conversion is offered. |

Current limits are 25 MB per source file, 220,000 extracted/Markdown characters,
and 12,000 source characters passed to an explicit AI conversion request.

## Canonical Markdown contract

The parser requires this shape. Use the complete starter in
[`server/theory-course-markdown.mjs`](server/theory-course-markdown.mjs) or
the **Insert bilingual Markdown template** button in `/admin/`.

```md
---
format: type2learn-theory-course/v1
id: lowercase-course-id
version: 1.0.0
title.en: English course title
title.ur: اردو کورس کا عنوان
label.en: Educational course
label.ur: تعلیمی کورس
notice.en: General educational notice.
notice.ur: عمومی تعلیمی نوٹس۔
---

# Module: stable-module-id

## English
### Title
...
### Definition
...
### Daily life
...
### Strengths
...
### Challenges
- ...
### Supports
- ...
### Simple
...
### Example
...
### Hint
...
### Typing
level: Key idea typing
prompt: ...
target: ...
### Check
question: ...
- [x] Reviewed correct response
- [ ] Plausible alternative
- [ ] Plausible alternative
- [ ] Plausible alternative

## Urdu
### Title
...
### Definition
...
### Daily life
...
### Strengths
...
### Challenges
- ...
### Supports
- ...
### Simple
...
### Example
...
### Hint
...
### Typing
level: Key idea typing
prompt: ...
target: ...
### Check
question: ...
- [x] Reviewed correct response
- [ ] Plausible alternative
- [ ] Plausible alternative
- [ ] Plausible alternative

# Final exam
## English
### Question 1
question: ...
- [x] Reviewed correct response
- [ ] Alternative
- [ ] Alternative
- [ ] Alternative

## Urdu
### Question 1
question: ...
- [x] Reviewed correct response
- [ ] Alternative
- [ ] Alternative
- [ ] Alternative
```

Rules enforced by the server:

- Course and module IDs use safe lowercase route keys.
- Every module has English and Urdu fields, a bounded typing activity, and one
  four-option MCQ with exactly one marked answer in the private source.
- English and Urdu final checks have matching counts and at most 21 questions.
- The learner manifest never contains answer keys, source uploads, review
  notes, or private storage locations.
- The canonical file remains editable, but each save returns through the same
  strict validator and compiler.

## Conversion pipeline

1. **Private local extraction** — text files are read as text; PDFs use
   bounded local text extraction; PPTX uses bounded ZIP/XML slide text
   extraction. Unsupported and image-only files remain private.
2. **Deterministic normalisation** — line endings, unsafe control characters,
   zero-width characters, size limits, and the requested course ID/version are
   normalised before any AI work.
3. **Gemini-first draft** — after an administrator presses the conversion
   button, only the extracted text is sent to the configured model router. It
   must return one JSON object containing canonical Markdown. Gemini is first,
   Featherless is the capacity-limited middle fallback, and GPT-5.4 Mini is
   used only if those providers cannot complete the bounded review draft.
4. **Strict deterministic test** — the generated Markdown is parsed and
   validated for every required bilingual field, activity, MCQ, final check,
   identifier, and private/learner-manifest boundary.
5. **One bounded structural repair** — if the strict test fails, the model gets
   the candidate plus the exact validator errors once. It can return a repaired
   draft; it cannot publish it.
6. **Independent AI critique** — a separate structured checker compares the
   draft with the extracted source and can flag unsupported claims,
   answer-revealing wording, learner labels, missing objectives, or unsuitable
   tone. A critic outage is shown as a warning, never hidden.
7. **Human review and normal release gate** — the administrator reads/edits the
   canonical Markdown, validates and compiles it, reviews each module, chooses
   narration/TTS, verifies backups, approves, and publishes. Conversion never
   creates a learner-visible course on its own.

The conversion report displays the parser result, deterministic checks, model
stages, and critic issues. **Ready for human review** does not mean approved,
fact-checked, translated perfectly, or published.

## Safety and privacy boundaries

- Original private files are not sent to a model, exposed to learners, put in
  backup packages, or included in the public catalogue.
- The model receives at most a bounded plain-text extraction after explicit
  administrator action. Text inside the source is treated as data, not model
  instructions.
- Models may draft or repair structure; they cannot change an existing
  published course, auto-approve a course, or bypass the backup/publishing
  workflow.
- Administrators must verify factual accuracy, translation quality, source
  licensing, age suitability, accessibility, question correctness, and all
  recorded answer keys before release.

## Test evidence

The repository includes direct automated coverage in:

- `tests/course-authoring/source-to-markdown-handoff.test.mjs` — real service
  boundary for text/PDF/PPTX intake, private-source isolation, conversion,
  strict validation, repair, critique, and later compilation.
- `tests/course-authoring/workspace-form-contract.test.mjs` — admin UI/API
  contract for PDF/PPTX intake and conversion control.
- `tests/ai/core.test.mjs` and `tests/ai/featherless-provider.test.mjs` —
  Gemini/Featherless/OpenAI routing and bounded extended authoring output.
