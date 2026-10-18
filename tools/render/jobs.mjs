// Every still used on the site, described as a room + camera + palette.
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
  // Stills not yet replaced by photorealistic ones from tools/photoreal; drop
  // each entry once its photo is published.

  // Editorial / section imagery.
  { name: 'cta-dusk', room: 'living', camera: 'window', size: 'wide', samples: 160,
    lighting: { sun: [-8, 1.2, -12], sunColor: '#ff9b5e', sunIntensity: 1.2, skyTop: '#39465a', skyBottom: '#d99c73', ground: '#4a443e', envIntensity: 0.55, lampIntensity: 12, lampSoftIntensity: 5, exposure: 1.25 } },

  // Services.
  { name: 'service-residential', room: 'living', camera: 'lounge', size: P, samples: 128 },
  { name: 'service-villa', room: 'villa', camera: 'main', size: P, samples: 128, palette: 'glass' },
  { name: 'service-lighting', room: 'dining', camera: 'pendant', size: P, samples: 128,
    lighting: { skyTop: '#5d6a7c', skyBottom: '#e3b18b', sun: [-6, 1.5, -12], sunColor: '#ffae78', sunIntensity: 1.4, envIntensity: 0.6, lampIntensity: 10, exposure: 1.2 } },
  { name: 'service-turnkey', room: 'kitchen', camera: 'front', size: P, samples: 128 },

  // Approvals & project management (desk study).
  { name: 'project-atelier', room: 'office', camera: 'desk', size: P, samples: 128, palette: 'atelier', options: { loft: true } },

  // Page imagery.
  { name: 'about-band', room: 'workspace', camera: 'main', size: 'band', samples: 128, palette: 'office' },
  { name: 'services-hero', room: 'reception', camera: 'wait', size: P, samples: 128, palette: 'reception' },
  { name: 'process-hero', room: 'meeting', camera: 'screen', size: P, samples: 128, palette: 'meeting' },
  { name: 'svc-design', room: 'workspace', camera: 'plan', size: P, samples: 128, palette: 'office', options: { noCeiling: true, noExterior: true } },
  { name: 'svc-commercial', room: 'workspace', camera: 'aisle', size: P, samples: 128, palette: 'office' },

  // Who we serve.
  { name: 'serve-offices', room: 'reception', camera: 'main', size: 'sq', samples: 128, palette: 'reception' },
  { name: 'serve-villas', room: 'villa', camera: 'window', size: 'sq', samples: 128, palette: 'glass' },
  { name: 'serve-apartments', room: 'bedroom', camera: 'side', size: 'sq', samples: 128, palette: 'coastal', options: { city: true } },
  { name: 'serve-commercial', room: 'studio', camera: 'wide', size: 'sq', samples: 128, palette: 'studio' },

  // Finishing-works close-up.
  ...['stone'].map((m) => ({
    name: 'material-' + m, room: 'materialStudio', camera: 'main', size: 'square', samples: m === 'glass' ? 256 : 128, options: { material: m, noExterior: true, frontWall: false },
  })),
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
