// Checks the tabbed room photos on the services page: the active photo loads,
// clicking and arrow keys switch rooms, and the panel follows.
//   node check-viewer.mjs http://127.0.0.1:8080/ <outDir>
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const [baseArg, out] = process.argv.slice(2);
const base = baseArg.replace(/\/?$/, '/');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('response', (r) => { if (r.status() >= 400) errors.push(r.status() + ' ' + r.url()); });
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await p.goto(base + 'services.html');
await p.evaluate(() => document.querySelector('#spaces').scrollIntoView());
await p.waitForTimeout(1500);
const state = () => p.evaluate(() => {
  const active = [...document.querySelectorAll('[data-room-slide].is-active')];
  const img = active[0] && active[0].querySelector('img');
  return {
    active: active.map((a) => a.dataset.roomSlide).join(','),
    loaded: !!img && img.complete && img.naturalWidth > 0,
    name: document.querySelector('[data-room-name]').textContent,
    // only the active room is exposed to assistive technology
    ariaSynced: [...document.querySelectorAll('[data-room-slide]')]
      .every((s) => s.classList.contains('is-active') === !s.hasAttribute('aria-hidden')),
  };
});
const living = await state();
await p.locator('[data-viewer-frame]').screenshot({ path: out + '/viewer-living.png', timeout: 120000 });
await p.click('#tab-kitchen');
await p.waitForTimeout(1500);
const kitchen = await state();
await p.locator('[data-viewer-frame]').screenshot({ path: out + '/viewer-kitchen.png', timeout: 120000 });
await p.keyboard.press('ArrowRight');
await p.waitForTimeout(1000);
const dining = await state();
const legacy = await p.evaluate(() => !!document.querySelector('[data-viewer-canvas], [data-fallback-room]'));
console.log({ living, kitchen, dining, legacy });
const ok = living.active === 'living' && living.loaded && kitchen.active === 'kitchen' && kitchen.loaded &&
  kitchen.name === 'Kitchen' && dining.active === 'dining' && dining.name === 'Dining' && !legacy &&
  [living, kitchen, dining].every((s) => s.ariaSynced);
console.log(errors.length ? errors.join('\n') : 'no errors');
await b.close();
process.exit(ok && !errors.length ? 0 : 1);
