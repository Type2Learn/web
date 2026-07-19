# Type2Learn web preview

Static, multi-page Type2Learn product preview. It uses generated page-specific photography, module identity marks, Manrope and Cormorant Garamond fonts, GSAP ScrollTrigger, and Three.js. Cloudflare Web Analytics is loaded from the official Cloudflare beacon URL.

## Run locally

From the repository root:

```sh
python3 -m http.server 8000 --bind 0.0.0.0
```

Then open `http://localhost:8000`.

## Deploy on Render

The root-level `render.yaml` defines a Render static site with `staticPublishPath: .`, automatic deploys from commits, and baseline response headers. Create a new Render Blueprint from this repository; no build command or environment variables are required.

Every primary public route has its own directory and `index.html`, so no single-page-app rewrite is needed. Render redirects the former Research page into How it works, the former Support page into Community, and the former privacy/accessibility/security/terms pages into the consolidated Trust center. The legacy HTML files also contain immediate canonical redirects for hosts that do not process `render.yaml`.

## Motion and accessibility

The Motion control in the header disables the pinned and decorative animation experience. System-level `prefers-reduced-motion` receives the same static presentation. Core content and navigation remain usable without animation.
