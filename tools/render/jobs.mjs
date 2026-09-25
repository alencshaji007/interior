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
  og: [1200, 630, [1200]],
};

const PALETTES = {
  oak: {},
  terra: { wall: '#eadbc9', floor: 'terracotta', floorTint: '#e9b996', fabric: '#efe3d2', fabric2: '#c9a17c', accent: '#8f5a3c', rug: '#d8c3a8' },
  glass: { wall: '#ece8e1', floor: 'travertine', fabric: '#eee9e1', fabric2: '#b9ad9c', rug: '#e2dbcf' },
  atelier: { wall: '#e6e3de', floor: 'concrete', fabric2: '#9d9488', accent: '#4a3f36', wood: '#cdb59b', darkWood: '#4e4038' },
  coastal: { wall: '#f1eee9', floor: 'oak', floorTint: '#f2eadf', fabric: '#f3f0ea', fabric2: '#d9d6cf', rug: '#e8e4dc', outside: '#d8d6cc' },
  stone: { wall: '#ddd5ca', floor: 'stone', fabric2: '#a39584', accent: '#5b4637', darkWood: '#54463c' },
};

export const JOBS = [
  // Hero poster (fallback when WebGL/motion is unavailable) + social card.
  { name: 'hero-living', room: 'living', camera: 'hero', size: 'hero', samples: 128 },
  { name: 'og-image', room: 'living', camera: 'wide', size: 'og', samples: 128, formats: ['jpg'] },

  // Room showcase (with depth maps for the 3D parallax viewer).
  { name: 'room-living', room: 'living', camera: 'wide', size: L, samples: 128, depth: true },
  { name: 'room-bedroom', room: 'bedroom', camera: 'main', size: L, samples: 128, depth: true },
  { name: 'room-kitchen', room: 'kitchen', camera: 'main', size: L, samples: 128, depth: true },
  { name: 'room-dining', room: 'dining', camera: 'main', size: L, samples: 128, depth: true },
  { name: 'room-office', room: 'office', camera: 'main', size: L, samples: 128, depth: true },

  // Editorial / section imagery.
  { name: 'intro-stair', room: 'villa', camera: 'stair', size: P, samples: 128, palette: 'glass' },
  { name: 'about-studio', room: 'office', camera: 'shelves', size: P, samples: 128, palette: 'atelier', options: { loft: true } },
  { name: 'cta-dusk', room: 'living', camera: 'window', size: 'wide', samples: 160,
    lighting: { sun: [-8, 1.2, -12], sunColor: '#ff9b5e', sunIntensity: 1.2, skyTop: '#39465a', skyBottom: '#d99c73', ground: '#4a443e', envIntensity: 0.55, lampIntensity: 12, lampSoftIntensity: 5, exposure: 1.25 } },

  // Services.
  { name: 'service-residential', room: 'living', camera: 'lounge', size: P, samples: 128 },
  { name: 'service-villa', room: 'villa', camera: 'main', size: P, samples: 128, palette: 'glass' },
  { name: 'service-apartment', room: 'bedroom', camera: 'side', size: P, samples: 128, palette: 'coastal' },
  { name: 'service-furniture', room: 'living', camera: 'chair', size: P, samples: 128 },
  { name: 'service-lighting', room: 'dining', camera: 'pendant', size: P, samples: 128,
    lighting: { skyTop: '#5d6a7c', skyBottom: '#e3b18b', sun: [-6, 1.5, -12], sunColor: '#ffae78', sunIntensity: 1.4, envIntensity: 0.6, lampIntensity: 10, exposure: 1.2 } },
  { name: 'service-turnkey', room: 'kitchen', camera: 'front', size: P, samples: 128 },

  // Selected projects.
  { name: 'project-oak', room: 'living', camera: 'hero', size: L, samples: 128 },
  { name: 'project-terra', room: 'dining', camera: 'angle', size: P, samples: 128, palette: 'terra', options: { stoneWalls: false } },
  { name: 'project-glass', room: 'villa', camera: 'window', size: L, samples: 128, palette: 'glass' },
  { name: 'project-atelier', room: 'office', camera: 'desk', size: P, samples: 128, palette: 'atelier', options: { loft: true } },
  { name: 'project-coastal', room: 'bedroom', camera: 'main', size: L, samples: 128, palette: 'coastal', options: { coastal: true } },
  { name: 'project-stone', room: 'kitchen', camera: 'detail', size: P, samples: 128, palette: 'stone', options: { stoneWalls: true, darkStone: true } },

  // Material palette close-ups.
  ...['wood', 'stone', 'marble', 'metal', 'glass', 'fabric'].map((m) => ({
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
