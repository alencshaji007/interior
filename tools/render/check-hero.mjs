// Verifies the home hero (a photo with a slow push-in, no live 3D scene) and
// the small real-time 3D ornaments.
//   node check-hero.mjs http://127.0.0.1:8080/index.html <outDir>
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const [url, out] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('response', (r) => { if (r.status() >= 400) errors.push(r.status() + ' ' + r.url()); });
await page.goto(url);
await page.waitForFunction(() => document.documentElement.classList.contains('is-loaded'), null, { timeout: 60000 });
const hero = await page.evaluate(() => {
  const img = document.querySelector('.hero__poster img');
  return {
    liveCanvas: !!document.querySelector('[data-hero-canvas], .hero__canvas'),
    photoLoaded: !!img && img.complete && img.naturalWidth > 0,
    drift: getComputedStyle(document.querySelector('.hero__poster')).animationName,
  };
});
await page.screenshot({ path: out + '/hero.png', timeout: 120000 });
// Ornaments are created once the page is idle; the home page has three.
await page.waitForFunction(() => (window.FORMA.ornaments || []).length >= 3, null, { timeout: 120000 }).catch(() => {});
const ornaments = await page.evaluate(() => (window.FORMA.ornaments || []).length);
console.log({ ...hero, ornaments });
const ok = !hero.liveCanvas && hero.photoLoaded && hero.drift === 'hero-drift' && ornaments === 3;
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
process.exit(ok && !errors.length ? 0 : 1);
