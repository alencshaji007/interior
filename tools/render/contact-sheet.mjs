// Tile screenshots into one contact sheet for quick visual review.
//   node contact-sheet.mjs out.png cols thumbWidth img1 img2 ...
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'fs';
const [out, cols, tw, ...imgs] = process.argv.slice(2);
const html = `<body style="margin:0;background:#888;display:grid;grid-template-columns:repeat(${cols},${tw}px);gap:4px">${imgs.map((p) => `<div style="position:relative"><img src="file://${p}" style="width:${tw}px;display:block"><span style="position:absolute;top:2px;left:4px;font:12px sans-serif;background:#fff">${p.split('/').pop()}</span></div>`).join('')}</body>`;
const b = await chromium.launch();
const pg = await b.newPage({ viewport: { width: cols * (Number(tw) + 4), height: 400 } });
fs.writeFileSync(out + '.html', html);
await pg.goto('file://' + out + '.html');
await pg.screenshot({ path: out, fullPage: true });
await b.close();
