# Type2Learn website

Official static, multi-page website for the Type2Learn nonprofit. It uses page-specific photography, module identity marks, Manrope and Cormorant Garamond fonts, GSAP ScrollTrigger, and Three.js. Cloudflare Web Analytics is loaded from the official Cloudflare beacon URL.

The supplied Type2Learn logo is used unchanged in the header and as the browser favicon. Approved team portraits are shown first; profiles without an approved portrait use distinct non-human editorial placeholders.

## Run locally

From the repository root:

```sh
python3 -m http.server 8000 --bind 0.0.0.0
```

Then open `http://localhost:8000`.

## Deploy on Render

The root-level `render.yaml` defines a Render static site with `staticPublishPath: .`, automatic deploys from commits, and baseline response headers. Create a new Render Blueprint from this repository; no build command or environment variables are required.

Every primary public route has its own directory and `index.html`, so no single-page-app rewrite is needed. Render redirects the former Research page into How it works, the former Support page into Community, and the former privacy/accessibility/security/terms pages into the consolidated Trust center. The legacy HTML files also contain immediate canonical redirects for hosts that do not process `render.yaml`.

Images are compressed WebP assets where source fidelity allows it, and below-the-fold `<img>` elements use lazy loading, asynchronous decoding, and low fetch priority. The original supplied PNG logo stays unchanged. No image build service or runtime image transformation is required on Render.

## Motion and accessibility

The Motion control in the header disables the pinned and decorative animation experience. System-level `prefers-reduced-motion` receives the same static presentation. Core content and navigation remain usable without animation.

Desktop sections use browser-native snap stops to prevent a fast wheel gesture from skipping a complete section. Mobile keeps natural document scrolling and lightweight, touch-native versions of the scroll experiences.

## Website credit

Built with **native.builder** for Type2Learn, from **3 August to 6 August**. Human direction, product context, and accessibility standards shaped every decision.
