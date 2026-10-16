// Checks the 3D hero (home page) and the WebGL depth-parallax room viewer
// (services page) with final assets.
//   node check-viewer.mjs http://127.0.0.1:8080/ <outDir>
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const [baseArg, out] = process.argv.slice(2);
const base = baseArg.replace(/\/?$/, '/');
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('response', (r) => { if (r.status() >= 400) errors.push(r.status() + ' ' + r.url()); });
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await p.goto(base + 'index.html');
await p.waitForFunction(() => document.querySelector('[data-hero]').classList.contains('is-3d'), null, { timeout: 180000 });
await p.goto(base + 'services.html');
await p.evaluate(() => document.querySelector('#spaces').scrollIntoView());
await p.waitForFunction(() => document.querySelector('[data-viewer-frame]').classList.contains('is-webgl'), null, { timeout: 120000 });
await p.mouse.move(500, 600, { steps: 4 });
await p.waitForTimeout(2000);
await p.locator('[data-viewer-frame]').screenshot({ path: out + '/viewer-living.png', timeout: 120000 });
await p.click('#tab-kitchen');
await p.waitForTimeout(4000);
await p.locator('[data-viewer-frame]').screenshot({ path: out + '/viewer-kitchen.png', timeout: 120000 });
console.log({ webgl: true, panel: await p.textContent('[data-room-name]') });
const fine = errors.filter((e) => !e.includes('KHR_parallel_shader_compile'));
console.log(fine.length ? fine.join('\n') : 'no errors');
await b.close();
process.exit(fine.length ? 1 : 0);
