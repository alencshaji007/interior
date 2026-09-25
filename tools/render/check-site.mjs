// Smoke test: load the site, report console errors / failed requests, and
// take screenshots at the given viewport widths.
//   node check-site.mjs <url> <outDir> [widths...] [--reduced] [--scroll]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const [url, outDir, ...rest] = process.argv.slice(2);
const reduced = rest.includes('--reduced');
const scroll = rest.includes('--scroll');
const widths = rest.filter((a) => !a.startsWith('--')).map(Number);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const w of widths.length ? widths : [1440]) {
  const h = w >= 992 ? 900 : w >= 768 ? 1024 : 844;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: reduced ? 'reduce' : 'no-preference', hasTouch: w < 992, isMobile: w < 768 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url()));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()}: ${r.url()}`); });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(6000);
  const state = await page.evaluate(() => ({
    classes: document.documentElement.className,
    hero3d: document.querySelector('[data-hero]').classList.contains('is-3d'),
    loader: !!document.querySelector('[data-loader]'),
    scrollW: document.documentElement.scrollWidth, innerW: innerWidth,
  }));
  console.log(`\n== ${w}px`, JSON.stringify(state));
  await page.screenshot({ path: `${outDir}/w${w}${reduced ? '-reduced' : ''}-top.png`, timeout: 120000 });
  if (scroll) {
    const total = await page.evaluate(() => document.documentElement.scrollHeight);
    let i = 0;
    for (let y = 0; y < total; y += h * 0.9) {
      await page.evaluate((yy) => window.scrollTo(0, yy), y);
      await page.waitForTimeout(1600);
      await page.screenshot({ path: `${outDir}/w${w}${reduced ? '-reduced' : ''}-s${String(i++).padStart(2, '0')}.png`, timeout: 120000 });
    }
  }
  const uniq = [...new Set(errors)];
  console.log(uniq.length ? uniq.slice(0, 40).join('\n') : 'no console errors');
  await ctx.close();
}
await browser.close();
