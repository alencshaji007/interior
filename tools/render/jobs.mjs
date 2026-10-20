// Stills rendered with Cycles, each described as a room + camera + palette.
// Output lands in assets/images/<name>-<width>.(webp|jpg).
const L = 'landscape', P = 'portrait';
const SIZES = {
  // [renderW, renderH, outputs...]
  hero: [1920, 1080, [1920, 960]],
  [L]: [1600, 1000, [1600, 800]],
  wide: [1600, 900, [1600, 800]],
  [P]: [1000, 1250, [1000, 600]],
  square: [1100, 1100, [1100, 600]],
  sq: [900, 900, [900, 600]],
  detail: [700, 700, [700]],
  band: [1920, 1080, [1920, 1000]],
  og: [1200, 630, [1200]],
};

const PALETTES = {
  oak: {},
  terra: { wall: '#eadbc9', floor: 'terracotta', floorTint: '#e9b996', fabric: '#efe3d2', fabric2: '#c9a17c', accent: '#8f5a3c', rug: '#d8c3a8' },
  glass: { wall: '#ece8e1', floor: 'travertine', fabric: '#eee9e1', fabric2: '#b9ad9c', rug: '#e2dbcf' },
  atelier: { wall: '#e6e3de', floor: 'concrete', fabric2: '#9d9488', accent: '#4a3f36', wood: '#cdb59b', darkWood: '#4e4038' },
  coastal: { wall: '#f1eee9', floor: 'oak', floorTint: '#f2eadf', fabric: '#f3f0ea', fabric2: '#d9d6cf', rug: '#e8e4dc', outside: '#d8d6cc' },
  stone: { wall: '#ddd5ca', floor: 'stone', fabric2: '#a39584', accent: '#5b4637', darkWood: '#54463c' },
  minimal: { wall: '#f4f2ee', floorTint: '#f3ece2', fabric: '#f1eee8', fabric2: '#d8d2c8', accent: '#9a8a78', rug: '#e9e4dc', darkWood: '#8a7766' },
  // Commercial interiors.
  office: { floor: 'carpet', floorTint: '#b9bbbc', wall: '#f3f1ed' },
  lounge: { floorTint: '#f6efe6', wall: '#f3efe9' },
  reception: { floorTint: '#efe4d6', wall: '#f2eee8' },
  meeting: { floor: 'herringbone', wall: '#efebe5' },
  studio: { floor: 'polished', floorTint: '#d9d4cc', wall: '#e9e6e1' },
};

export const JOBS = [
  // Every still on the site is now a photorealistic image from tools/photoreal,
  // so nothing is rendered. To render one again, add an entry such as
  //   { name: 'cta-dusk', room: 'living', camera: 'window', size: 'wide', samples: 160 }
  // and note that it overwrites the published photo of the same name.
];

export function expand(job, { preview = false } = {}) {
  const [w, h, outs] = SIZES[job.size];
  const scale = preview ? 0.5 : 1;
  const formats = job.formats || ['webp', 'jpg'];
  const outputs = [];
  outs.forEach((ow) => formats.forEach((f) => outputs.push({
    key: `${job.name}-${ow}.${f}`,
    width: Math.round(ow * scale),
    type: f === 'webp' ? 'image/webp' : 'image/jpeg',
    quality: f === 'webp' ? 0.8 : 0.82,
  })));
  return {
    room: job.room,
    camera: job.camera,
    options: job.options || {},
    palette: PALETTES[job.palette || 'oak'],
    lighting: job.lighting,
    width: Math.round(w * scale),
    height: Math.round(h * scale),
    samples: preview ? 48 : job.samples,
    outputs,
    depth: job.depth ? { width: preview ? 400 : 800, near: 0.8, far: 14 } : null,
  };
}
