// Writes assets/textures/<name>.webp from js/room-kit.js's procedural set.
//   node export-textures.mjs
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, '../../assets/textures');
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.goto('file://' + path.join(here, 'export.html'));
await page.waitForFunction('window.exporterReady');
const list = await page.evaluate(() => window.exportTextures());
for (const { name, url } of list) {
  fs.writeFileSync(path.join(outDir, name + '.webp'), Buffer.from(url.split(',')[1], 'base64'));
}
console.log(`wrote ${list.length} textures to ${outDir}`);
await browser.close();
