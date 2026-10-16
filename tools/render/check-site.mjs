// Smoke test: load every page, report console errors / failed requests and
// horizontal overflow, and take screenshots at the given viewport widths.
//   node check-site.mjs <baseUrl> <outDir> [widths...] [--reduced] [--scroll] [--no3d]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const PAGES = ['index.html', 'about.html', 'services.html', 'projects.html', 'process.html', 'contact.html'];
const [baseArg, outDir, ...rest] = process.argv.slice(2);
const base = baseArg.replace(/\/?$/, '/');
const reduced = rest.includes('--reduced');
const scroll = rest.includes('--scroll');
const no3d = rest.includes('--no3d');
const widths = rest.filter((a) => !a.startsWith('--')).map(Number);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let failed = false;
for (const w of widths.length ? widths : [1440]) {
  const h = w >= 992 ? 900 : w >= 768 ? 1024 : 844;
  for (const path of PAGES) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: reduced ? 'reduce' : 'no-preference', hasTouch: w < 992, isMobile: w < 768 });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url()));
    page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()}: ${r.url()}`); });
    await page.goto(base + path + (no3d ? '?no3d' : ''), { waitUntil: 'load' });
    await page.waitForTimeout(path === 'index.html' ? 6000 : 3000);
    const state = await page.evaluate(() => ({
      classes: document.documentElement.className,
      hero3d: !!document.querySelector('[data-hero].is-3d'),
      loader: !!document.querySelector('[data-loader]'),
      overflowX: document.documentElement.scrollWidth - innerWidth,
    }));
    const name = `${outDir}/${path.replace('.html', '')}-w${w}${reduced ? '-reduced' : ''}`;
    await page.screenshot({ path: `${name}-top.png`, timeout: 120000 });
    if (scroll) {
      const total = await page.evaluate(() => document.documentElement.scrollHeight);
      let i = 0;
      for (let y = 0; y < total; y += h * 0.9) {
        await page.evaluate((yy) => window.scrollTo(0, yy), y);
        await page.waitForTimeout(1400);
        await page.screenshot({ path: `${name}-s${String(i++).padStart(2, '0')}.png`, timeout: 120000 });
      }
      state.overflowX = Math.max(state.overflowX, await page.evaluate(() => document.documentElement.scrollWidth - innerWidth));
    }
    // swiftshader has no parallel shader compile; that warning is environmental.
    const uniq = [...new Set(errors)].filter((e) => !e.includes('KHR_parallel_shader_compile'));
    if (uniq.length || state.overflowX > 0 || state.loader) failed = true;
    console.log(`== ${path} @${w}px`, JSON.stringify(state), uniq.length ? '\n  ' + uniq.slice(0, 40).join('\n  ') : '— no console errors');
    await ctx.close();
  }
}
await browser.close();
process.exit(failed ? 1 : 0);
