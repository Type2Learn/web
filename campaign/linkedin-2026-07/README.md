# Type2Learn LinkedIn narrative campaign

This folder contains a publication-ready 4:5 LinkedIn campaign built from the Type2Learn website, product context, supplied PDF pack, working preview, official logo, and the owner-provided web-analytics screenshots.

## Deliverables

- `posts/01-...jpg` through `posts/15-...jpg`: fifteen standalone narrative posts.
- `posts/16-project-overview.jpg`: the featured project overview.
- `campaign-contact-sheet.jpg`: one-page visual index of all exports.
- `POSTING-GUIDE.md`: recommended sequence, caption openers, and alt text.
- `UPLOAD-SCHEDULE-2026-07-23-to-2026-08-02.md`: exact PKT publishing path and upload routine.
- `type2learn-linkedin-upload-calendar.ics`: importable calendar containing every upload and engagement window.
- `IMAGEGEN-PROMPTS.md`: final direction and provenance for the four illustrative scenes and sixteen mascot poses.

Every final post is a true 2× source render at 2400 × 3000 pixels, exported as a maximum-quality JPEG. The images are rendered from the live layout rather than enlarged from earlier JPEGs. Every post uses the same invitation:

> **NEURODIVERGENT VOICES WANTED**<br>
> Interested in helping us shape Type2Learn?<br>
> **contact@type2learn.tech**<br>
> Are you neurodivergent? Your perspective is enough—no diagnosis details needed. Under 18? Ask a parent or guardian to contact us.

Every post also includes a tailored **NEUROINCLUSIVE USE CASE** inside its main content—not only in the recruitment footer—so the specific neurodivergent need or design purpose remains explicit when the image is viewed on its own.

The official supplied logo at `../../assets/type2learn-logo.png` is composited unchanged. The exact owner-supplied Type2Learn bunny at `assets/type2learn-bunny-mascot.png` is preserved as the mascot identity reference. Each post uses a purpose-made pose in `assets/mascot/` so the bunny actively reinforces that post’s idea and delivers the shared invitation. Headlines use the locally licensed Cormorant Garamond font; supporting copy uses Manrope. The campaign follows the project palette: Growth Green, Learning Teal, Focus Cyan, Trust Blue, Deep Ink, and Cloud White.

## Publication safeguards

- People shown are illustrative scenes, not participant testimonials.
- Product directions and module concepts are labelled as in development rather than released or proven.
- The campaign does not claim diagnosis, treatment, guaranteed retention, universal effectiveness, accreditation, or measured learning outcomes.
- The traffic post distinguishes unique visitors from request counts and dates the metric.
- The featured post labels the owner-supplied GA4 export as one-day sessions, not unique people: 1,959 sessions and 1,940 engaged sessions on 22 July 2026.
- Confirm that `contact@type2learn.tech` is monitored before publication. Do not ask contributors to disclose a diagnosis or child information in public comments.

## Re-export

Run the site from the repository root:

```sh
python3 -m http.server 8013 --bind 127.0.0.1
```

Then run:

```sh
node campaign/linkedin-2026-07/render.mjs
```

The renderer requires the existing Playwright installation in the adjacent `newwebsite` workspace and the current local Nix Chromium path. If Chromium changes, update `chromiumPath` in `render.mjs`.
