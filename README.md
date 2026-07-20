# Type2Learn website

Official static, multi-page website for the Type2Learn nonprofit. It uses page-specific photography, module identity marks, Manrope and Cormorant Garamond fonts, GSAP ScrollTrigger, and Three.js. Cloudflare Web Analytics and Google Analytics (`G-9ER1QJLGCW`) are loaded on every HTML page.

The supplied Type2Learn logo is used unchanged in the header and as the browser favicon. The founder's supplied portrait appears first. Co-founder portraits edited from supplied images are labelled as such, and profiles without an approved portrait use a clearly labelled non-human editorial figure.

## Run locally

From the repository root:

```sh
python3 -m http.server 8000 --bind 0.0.0.0
```

Then open `http://localhost:8000`.

## Deploy on Render

The root-level `render.yaml` defines a Render static site with `staticPublishPath: .`, automatic deploys from commits, and baseline response headers. Create a new Render Blueprint from this repository; no build command or environment variables are required.

Every primary public route has its own directory and `index.html`, so no single-page-app rewrite is needed. Privacy and Terms are full, standalone, indexable documents at `/privacy/` and `/terms/`, with downloadable copies of the supplied source PDFs. Render redirects the former Research page into How it works, Support into Community, and the legacy Accessibility and Security routes into the relevant Trust-center sections.

The centered account experience is available at `/login/`. Sign-in, registration, password visibility, remembered email, Terms acceptance, password recovery, and Google-provider states are complete at the interface level. Authentication deliberately remains non-operative until the Firebase project configuration is supplied; no account data is transmitted or implied to be stored by the static preview.

Images are compressed WebP assets where source fidelity allows it, and below-the-fold `<img>` elements use lazy loading, asynchronous decoding, and low fetch priority. The original supplied PNG logo stays unchanged. No image build service or runtime image transformation is required on Render.

## Search indexing

Every primary route has a unique title, description, canonical URL, Open Graph and Twitter metadata, index directives, and Schema.org structured data. Duplicate legacy routes are excluded from indexing and canonicalized to their consolidated pages.

- Sitemap: `https://type2learn.tech/sitemap.xml`
- Crawler rules: `https://type2learn.tech/robots.txt`

Submit the sitemap URL in Google Search Console after deployment. The sitemap also includes the primary page and team images so eligible image assets can be discovered with their page context.

## Motion and accessibility

The Motion control in the header disables the pinned and decorative animation experience. System-level `prefers-reduced-motion` receives the same static presentation. Core content and navigation remain usable without animation.

Desktop sections use browser-native snap stops to prevent a fast wheel gesture from skipping a complete section. Vertical wheel, arrow-key, and horizontal trackpad gestures move in the same forward/backward section sequence. Legal documents and mobile pages keep natural document scrolling; mobile also receives lightweight, touch-native versions of the visual experiences.

## Official channels

- GitHub: https://github.com/Type2Learn
- LinkedIn: https://www.linkedin.com/company/type2learn/

## Policy publication status

The Privacy Policy and Terms of Service reproduce the substantive text supplied in the official PDF pack. The source documents identify themselves as publication drafts and contain unresolved operator, address, market, vendor, payment, and governing-law requirements. Those requirements remain visibly disclosed on the web pages and must be completed with qualified counsel before the documents become operative policies.

## Website credit

Built with **native.builder** for Type2Learn, from **3 August to 6 August**. Human direction, product context, and accessibility standards shaped every decision.
