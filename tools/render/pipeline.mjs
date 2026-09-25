// FORMA image pipeline.
//   1. Chromium builds each room with js/room-kit.js and exports GLB (+ depth map).
//   2. Blender/Cycles (bpy) path traces and denoises it, writing WebP/JPEG.
//
//   node pipeline.mjs [filters...] [--preview] [--python /path/to/python]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JOBS, expand } from './jobs.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const preview = args.includes('--preview');
const renderOnly = args.includes('--render-only'); // reuse previously exported scenes
const si = args.indexOf('--samples');
const samplesOverride = si >= 0 ? args[si + 1] : '';
const pi = args.indexOf('--python');
const python = pi >= 0 ? args[pi + 1] : (process.env.BPY_PYTHON || 'python3');
const filters = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--python' && args[i - 1] !== '--samples');
const sceneDir = path.join(here, 'out/scenes');
const imageDir = preview ? path.join(here, 'out') : path.join(here, '../../assets/images');
fs.mkdirSync(sceneDir, { recursive: true });
fs.mkdirSync(imageDir, { recursive: true });

const jobs = JOBS.filter((j) => !filters.length || filters.some((f) => j.name.includes(f)));
console.log(`${jobs.length} job(s) → ${imageDir}`);

// Stage 1: export scenes.
if (!renderOnly) {
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const job of jobs) {
  const spec = expand(job, { preview });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error(`[${job.name}] page error:`, e.message));
  await page.goto('file://' + path.join(here, 'export.html'));
  await page.waitForFunction('window.exporterReady', null, { timeout: 60000 });
  const t = Date.now();
  const res = await page.evaluate((j) => window.exportJob(j), spec);
  const glb = path.join(sceneDir, job.name + '.glb');
  fs.writeFileSync(glb, Buffer.from(res.glb, 'base64'));
  if (res.depth) fs.writeFileSync(path.join(imageDir, `${job.name}-depth.png`), Buffer.from(res.depth.split(',')[1], 'base64'));
  fs.writeFileSync(path.join(sceneDir, job.name + '.json'), JSON.stringify({
    name: job.name, glb, outDir: imageDir, camera: res.camera, lighting: res.lighting,
    width: spec.width, height: spec.height, samples: spec.samples, exposure: job.exposure || 1, caustics: !!job.caustics,
    outputs: spec.outputs.map((o) => ({ key: o.key, width: o.width, format: o.key.endsWith('.webp') ? 'webp' : 'jpg', quality: Math.round(o.quality * 100) })),
  }, null, 2));
  console.log(`exported ${job.name} (${((Date.now() - t) / 1000).toFixed(1)}s)`);
  await page.close();
}
await browser.close();
}

// Stage 2: Cycles renders, one at a time (Cycles already uses every core).
for (const job of jobs) {
  const t = Date.now();
  const r = spawnSync(python, [path.join(here, 'cycles_render.py'), path.join(sceneDir, job.name + '.json')], {
    encoding: 'utf8',
    env: Object.assign({}, process.env, samplesOverride ? { FORMA_SAMPLES: samplesOverride } : {}),
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) {
    console.error(`FAILED ${job.name}\n${(r.stderr || '').slice(-3000)}\n${(r.stdout || '').slice(-2000)}`);
    continue;
  }
  console.log(`rendered ${job.name} (${((Date.now() - t) / 1000).toFixed(0)}s)`);
}
