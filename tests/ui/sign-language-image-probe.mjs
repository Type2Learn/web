/**
 * Manual browser evidence for the on-device sign-language input foundation.
 *
 * This is intentionally not in the release gate: it downloads MediaPipe's
 * browser runtime and uses a real image. Run against a local server with:
 *   TYPE2LEARN_BASE_URL=http://127.0.0.1:4176 node tests/ui/sign-language-image-probe.mjs
 *
 * It proves local image → landmark → fixed feature-vector ingestion. It does
 * not claim to recognise a PSL word from a still image.
 */
import { chromium } from 'playwright';

const baseUrl = process.env.TYPE2LEARN_BASE_URL || 'http://127.0.0.1:4176';
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;
const browser = await chromium.launch({ headless: true, executablePath });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

try {
  // Use the public shell rather than /course/: that protected route may
  // correctly redirect an unauthenticated test browser before evaluation.
  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
  const output = await page.evaluate(async () => {
    const image = new Image();
    image.src = '/sign-language/fixtures/mediapipe-hand-call.jpg';
    await image.decode();
    const { createLocalHandImageProbe } = await import('/sign-language/image-probe.js');
    const probe = await createLocalHandImageProbe();
    try {
      const result = await probe.probe(image);
      return {
        origin: result.origin,
        detectedHands: result.detectedHands,
        featureDimension: result.featureDimension,
        translationAvailable: result.translationAvailable,
        recognisedSign: result.recognisedSign,
        finiteFeatures: [...result.features].every(Number.isFinite)
      };
    } finally {
      probe.close();
    }
  });
  if (output.origin !== 'on-device' || output.detectedHands < 1 || output.featureDimension !== 126 || !output.finiteFeatures || output.translationAvailable || output.recognisedSign !== null) {
    throw new Error(`Unexpected image probe output: ${JSON.stringify(output)}`);
  }
  console.log(JSON.stringify({ ok: true, baseUrl, ...output }, null, 2));
} finally {
  await browser.close();
}
