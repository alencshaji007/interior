/* ==========================================================================
   FORMA — Procedural Interior Kit
   --------------------------------------------------------------------------
   A small library of architectural primitives, procedural materials and
   furnished room presets built with Three.js.

   It is shared by two consumers:
     1. js/three-scene.js      – the live, real-time hero scene
     2. tools/render/          – the offline path tracer that produces the
                                 still "photography" in assets/images

   Because both use the exact same rooms, the 3D hero and the imagery across
   the site read as one consistent body of work.

   Classic script (no ES modules) so the site runs straight from file://.
   Requires window.THREE (assets/vendor/three.bundle.min.js).
   ========================================================================== */
(function (root) {
  'use strict';

  const THREE = root.THREE;
  if (!THREE) throw new Error('FormaKit: THREE must be loaded first.');

  const TAU = Math.PI * 2;

  /* ------------------------------------------------------------------------
     Deterministic randomness + tileable value noise
     ------------------------------------------------------------------------ */

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Periodic 2D value noise. `px`/`py` are the lattice periods so textures
  // tile seamlessly when the sampled coordinates span exactly one period.
  function createNoise(seed) {
    const rand = rng(seed);
    const table = new Float32Array(4096);
    for (let i = 0; i < table.length; i++) table[i] = rand();

    const hash = (x, y) => table[((x * 1619 + y * 31337) & 0x7fffffff) % 4096];
    const fade = (t) => t * t * (3 - 2 * t);
    const mod = (a, n) => ((a % n) + n) % n;

    function noise(x, y, px, py) {
      const xi = Math.floor(x), yi = Math.floor(y);
      const xf = x - xi, yf = y - yi;
      const x0 = mod(xi, px), x1 = mod(xi + 1, px);
      const y0 = mod(yi, py), y1 = mod(yi + 1, py);
      const u = fade(xf), v = fade(yf);
      const a = hash(x0, y0), b = hash(x1, y0), c = hash(x0, y1), d = hash(x1, y1);
      return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
    }

    // Fractal sum in [0,1]; u,v in [0,1) with base frequencies fx, fy.
    function fbm(u, v, fx, fy, octaves) {
      let sum = 0, amp = 0.5, norm = 0, f = 1;
      for (let o = 0; o < octaves; o++) {
        sum += noise(u * fx * f, v * fy * f, fx * f, fy * f) * amp;
        norm += amp;
        amp *= 0.5;
        f *= 2;
      }
      return sum / norm;
    }

    return { noise, fbm };
  }

  /* ------------------------------------------------------------------------
     Canvas helpers
     ------------------------------------------------------------------------ */

  function createCanvas(w, h) {
    if (typeof OffscreenCanvas !== 'undefined' && !root.document) {
      return new OffscreenCanvas(w, h);
    }
    const c = root.document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const mix = (a, b, t) => a + (b - a) * t;
  const smooth = (e0, e1, x) => {
    const t = clamp01((x - e0) / (e1 - e0));
    return t * t * (3 - 2 * t);
  };

  // Paint every pixel with shader(u, v) -> [r,g,b] (0..255) and optionally
  // record a height value used to derive a normal map.
  function paint(size, shader, withHeight) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(size, size);
    const data = img.data;
    const heights = withHeight ? new Float32Array(size * size) : null;
    const out = [0, 0, 0, 0];
    for (let y = 0; y < size; y++) {
      const v = y / size;
      for (let x = 0; x < size; x++) {
        const u = x / size;
        shader(u, v, out);
        const i = (y * size + x) * 4;
        data[i] = out[0];
        data[i + 1] = out[1];
        data[i + 2] = out[2];
        data[i + 3] = 255;
        if (heights) heights[y * size + x] = out[3];
      }
    }
    ctx.putImageData(img, 0, 0);
    return { canvas, heights };
  }

  // Sobel-filter a height field into a tangent-space normal map canvas.
  function heightToNormal(heights, size, strength) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(size, size);
    const d = img.data;
    const h = (x, y) => heights[((y + size) % size) * size + ((x + size) % size)];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = (h(x + 1, y - 1) + 2 * h(x + 1, y) + h(x + 1, y + 1)) -
                   (h(x - 1, y - 1) + 2 * h(x - 1, y) + h(x - 1, y + 1));
        const dy = (h(x - 1, y + 1) + 2 * h(x, y + 1) + h(x + 1, y + 1)) -
                   (h(x - 1, y - 1) + 2 * h(x, y - 1) + h(x + 1, y - 1));
        let nx = -dx * strength, ny = dy * strength, nz = 1;
        const len = Math.hypot(nx, ny, nz);
        nx /= len; ny /= len; nz /= len;
        const i = (y * size + x) * 4;
        d[i] = (nx * 0.5 + 0.5) * 255;
        d[i + 1] = (ny * 0.5 + 0.5) * 255;
        d[i + 2] = (nz * 0.5 + 0.5) * 255;
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  function toTexture(canvas, { srgb = true, repeat = 1 } = {}) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat, repeat);
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    return tex;
  }

  /* ------------------------------------------------------------------------
     Procedural textures
     Each returns { map, normalMap? }. Colours are neutral-warm; material
     colour is multiplied on top so palettes can tint without regenerating.
     ------------------------------------------------------------------------ */

  const TextureFactory = {
    // Wide-plank oak. planks=true lays out staggered boards with fine joints.
    wood(size, { seed = 3, planks = false, rows = 6, light = [218, 190, 154], dark = [164, 128, 92] } = {}) {
      const n = createNoise(seed);
      const r = rng(seed + 11);
      const rowData = [];
      for (let i = 0; i < rows; i++) {
        const segs = r() < 0.5 ? 1 : 2;
        rowData.push({ segs, offset: Math.floor(r() * 4) / 4, tones: [0.9 + r() * 0.2, 0.9 + r() * 0.2, 0.9 + r() * 0.2] });
      }
      return paint(size, (u, v, out) => {
        let tone = 1, gap = 0, du = u, dv = v, shift = 0;
        if (planks) {
          const row = Math.floor(v * rows);
          const rd = rowData[row];
          const local = v * rows - row;
          const pu = (u + rd.offset) % 1;
          const seg = Math.floor(pu * rd.segs);
          tone = rd.tones[seg];
          shift = row * 7 + seg * 3; // integer shift keeps the lattice periodic
          const endDist = Math.min(pu * rd.segs - seg, 1 - (pu * rd.segs - seg)) / rd.segs;
          gap = local < 0.012 || endDist < 0.0012 ? 1 : 0;
          dv = local;
        }
        // Growth rings: stretched warped stripes running along u.
        const warp = n.fbm(du, v, 2, planks ? rows * 2 : 4, 4);
        const t = (dv * (planks ? 3 : 14) + warp * 2.4 + shift * 0.37);
        const ring = Math.pow(Math.abs(Math.sin(t * Math.PI)), 3);
        const fibre = n.fbm(du, v, 2, 512, 2);
        const figure = n.fbm(du, v, 4, planks ? rows * 4 : 16, 4);
        let k = 0.26 + ring * 0.14 + (fibre - 0.5) * 0.1 + (figure - 0.5) * 0.55;
        k = clamp01(k);
        out[0] = mix(light[0], dark[0], k) * tone;
        out[1] = mix(light[1], dark[1], k) * tone;
        out[2] = mix(light[2], dark[2], k) * tone;
        if (gap) { out[0] *= 0.45; out[1] *= 0.42; out[2] *= 0.4; }
        out[3] = gap ? 0 : 0.6 + fibre * 0.4;
      }, true);
    },

    // Calacatta-style marble: warm white ground with soft grey-gold veining.
    marble(size, { seed = 7, base = [238, 234, 227], vein = [150, 140, 128], dark = false } = {}) {
      const n = createNoise(seed);
      return paint(size, (u, v, out) => {
        const turb = n.fbm(u, v, 3, 3, 6);
        const t1 = u * 2 + v * 1 + turb * 4.5;
        const t2 = u * 1 - v * 3 + n.fbm(u, v, 5, 5, 5) * 6;
        const main = 1 - smooth(0.0, 0.07, Math.abs(Math.sin(t1 * Math.PI)));
        const fine = 1 - smooth(0.0, 0.025, Math.abs(Math.sin(t2 * Math.PI)));
        const cloud = n.fbm(u, v, 4, 4, 4);
        const k = clamp01(main * 0.85 + fine * 0.35 + (cloud - 0.5) * 0.15);
        const b = dark ? [46, 43, 41] : base;
        const c = dark ? [190, 182, 170] : vein;
        out[0] = mix(b[0], c[0], k);
        out[1] = mix(b[1], c[1], k);
        out[2] = mix(b[2], c[2], k);
        out[3] = 0;
      });
    },

    // Honed travertine with horizontal strata and small pores. tiles>0 adds grout.
    travertine(size, { seed = 5, tiles = 0, base = [214, 196, 170] } = {}) {
      const n = createNoise(seed);
      const r = rng(seed);
      const pores = [];
      for (let i = 0; i < 340; i++) pores.push([r(), r(), 0.002 + r() * 0.006, 0.4 + r() * 0.5]);
      const res = paint(size, (u, v, out) => {
        const strata = n.fbm(u, v, 2, 24, 4);
        const band = Math.sin((v * 12 + strata * 3) * Math.PI) * 0.5 + 0.5;
        const cloud = n.fbm(u, v, 4, 4, 5);
        const k = band * 0.12 + (cloud - 0.5) * 0.22 + (strata - 0.5) * 0.25;
        out[0] = base[0] * (1 - k * 0.6);
        out[1] = base[1] * (1 - k * 0.7);
        out[2] = base[2] * (1 - k * 0.85);
        let hgt = 0.5 + k * 0.2;
        if (tiles) {
          const gu = (u * tiles) % 1, gv = (v * tiles) % 1;
          if (gu < 0.004 || gv < 0.006) { out[0] *= 0.82; out[1] *= 0.8; out[2] *= 0.78; hgt = 0; }
        }
        out[3] = hgt;
      }, true);
      // Pores: small horizontally elongated voids painted on top.
      const ctx = res.canvas.getContext('2d');
      for (const [px, py, rad, a] of pores) {
        ctx.fillStyle = `rgba(120, 96, 70, ${a * 0.45})`;
        for (const ox of [-1, 0, 1]) {
          ctx.beginPath();
          ctx.ellipse((px + ox) * size, py * size, rad * size * 2.2, rad * size * 0.6, 0, 0, TAU);
          ctx.fill();
        }
      }
      return res;
    },

    // Limewash plaster: soft cloudy variation, almost imperceptible.
    plaster(size, { seed = 9, base = [236, 230, 220] } = {}) {
      const n = createNoise(seed);
      return paint(size, (u, v, out) => {
        const a = n.fbm(u, v, 3, 3, 5);
        const b = n.fbm(u, v, 24, 24, 3);
        const k = (a - 0.5) * 0.09 + (b - 0.5) * 0.035;
        out[0] = base[0] * (1 + k);
        out[1] = base[1] * (1 + k);
        out[2] = base[2] * (1 + k * 1.1);
        out[3] = a * 0.5 + b * 0.5;
      }, true);
    },

    // Woven fabric (linen) — used with a normal map for tactile highlights.
    fabric(size, { seed = 13, base = [232, 224, 210], weave = 180, boucle = false } = {}) {
      const n = createNoise(seed);
      return paint(size, (u, v, out) => {
        let hgt;
        if (boucle) {
          const loops = n.fbm(u, v, 96, 96, 3);
          const clump = n.fbm(u, v, 20, 20, 2);
          hgt = loops * 0.8 + clump * 0.4;
        } else {
          const wu = Math.sin(u * weave * TAU) * 0.5 + 0.5;
          const wv = Math.sin(v * weave * TAU) * 0.5 + 0.5;
          const slub = n.fbm(u, v, 8, 128, 3);
          hgt = (wu * 0.5 + wv * 0.5) * 0.6 + slub * 0.5;
        }
        const k = (hgt - 0.6) * 0.14;
        out[0] = base[0] * (1 + k);
        out[1] = base[1] * (1 + k);
        out[2] = base[2] * (1 + k);
        out[3] = hgt;
      }, true);
    },

    // Board-formed / smooth architectural concrete.
    concrete(size, { seed = 17, base = [178, 174, 168] } = {}) {
      const n = createNoise(seed);
      const r = rng(seed);
      const res = paint(size, (u, v, out) => {
        const a = n.fbm(u, v, 4, 4, 6);
        const b = n.fbm(u, v, 40, 40, 2);
        const k = (a - 0.5) * 0.22 + (b - 0.5) * 0.08;
        out[0] = base[0] * (1 + k);
        out[1] = base[1] * (1 + k);
        out[2] = base[2] * (1 + k);
        out[3] = a;
      }, true);
      const ctx = res.canvas.getContext('2d');
      for (let i = 0; i < 260; i++) {
        ctx.fillStyle = `rgba(80,76,70,${0.25 + r() * 0.3})`;
        ctx.beginPath();
        ctx.arc(r() * size, r() * size, 0.4 + r() * 1.4, 0, TAU);
        ctx.fill();
      }
      return res;
    },

    // Split-face / honed stone (limestone or basalt depending on base).
    stone(size, { seed = 19, base = [196, 188, 176], blocks = 0 } = {}) {
      const n = createNoise(seed);
      const r = rng(seed);
      const rowCount = blocks || 1;
      const rows = [];
      for (let i = 0; i < rowCount; i++) rows.push({ off: r(), tone: 0.88 + r() * 0.24 });
      return paint(size, (u, v, out) => {
        const a = n.fbm(u, v, 6, 6, 6);
        const b = n.fbm(u, v, 48, 48, 2);
        let tone = 1, joint = false;
        if (blocks) {
          const row = Math.floor(v * rowCount);
          const lv = v * rowCount - row;
          const lu = (u * 2 + rows[row].off) % 1;
          tone = rows[row].tone * (0.95 + Math.floor((u * 2 + rows[row].off)) % 2 * 0.1);
          joint = lv < 0.02 || lu < 0.01;
        }
        const k = (a - 0.5) * 0.3 + (b - 0.5) * 0.12;
        out[0] = base[0] * (1 + k) * tone;
        out[1] = base[1] * (1 + k) * tone;
        out[2] = base[2] * (1 + k) * tone;
        if (joint) { out[0] *= 0.55; out[1] *= 0.55; out[2] *= 0.55; }
        out[3] = joint ? 0 : 0.5 + a * 0.5;
      }, true);
    },

    // Brushed metal: fine anisotropic streaks in the roughness/colour.
    brushed(size, { seed = 23, base = [150, 124, 92] } = {}) {
      const n = createNoise(seed);
      return paint(size, (u, v, out) => {
        const s = n.fbm(u, v, 2, 400, 3);
        const k = (s - 0.5) * 0.25;
        out[0] = base[0] * (1 + k);
        out[1] = base[1] * (1 + k);
        out[2] = base[2] * (1 + k);
        out[3] = s;
      });
    },

    // Abstract gallery painting: earthy blocks, arcs and gestural marks.
    art(width, height, { seed = 1, palette = null } = {}) {
      const r = rng(seed);
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');
      const pal = palette || [
        ['#ebe4d8', '#b5835a', '#2d2926', '#c9b79c', '#8a6a4f'],
        ['#e9e2d6', '#6f6a5f', '#a65f3f', '#d9c7ad', '#2f2c29'],
        ['#efe9df', '#97876f', '#3b3631', '#c49a6c', '#dcd2c3'],
      ][seed % 3];
      ctx.fillStyle = pal[0];
      ctx.fillRect(0, 0, width, height);

      const S = Math.min(width, height);
      const layout = seed % 4;
      ctx.globalAlpha = 0.92;
      if (layout === 0) {
        // Large sun disc over a horizon block.
        ctx.fillStyle = pal[1];
        ctx.beginPath();
        ctx.arc(width * 0.58, height * 0.42, S * 0.26, 0, TAU);
        ctx.fill();
        ctx.fillStyle = pal[2];
        ctx.fillRect(0, height * 0.64, width, height * 0.36);
        ctx.fillStyle = pal[3];
        ctx.fillRect(width * 0.12, height * 0.64, width * 0.18, height * 0.36);
      } else if (layout === 1) {
        // Stacked arches.
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = pal[1 + i];
          const w = width * (0.5 - i * 0.12);
          const x = width * 0.5 - w / 2;
          const top = height * (0.22 + i * 0.12);
          ctx.beginPath();
          ctx.moveTo(x, height);
          ctx.lineTo(x, top + w / 2);
          ctx.arc(width * 0.5, top + w / 2, w / 2, Math.PI, 0);
          ctx.lineTo(x + w, height);
          ctx.fill();
        }
      } else if (layout === 2) {
        // Colour-field blocks (Rothko-esque, restrained).
        ctx.fillStyle = pal[3];
        ctx.fillRect(width * 0.1, height * 0.08, width * 0.8, height * 0.46);
        ctx.fillStyle = pal[2];
        ctx.fillRect(width * 0.1, height * 0.58, width * 0.8, height * 0.34);
        ctx.fillStyle = pal[1];
        ctx.fillRect(width * 0.1, height * 0.54, width * 0.8, height * 0.04);
      } else {
        // Single gestural brush stroke on raw canvas.
        ctx.strokeStyle = pal[2];
        ctx.lineCap = 'round';
        for (let k = 0; k < 40; k++) {
          ctx.globalAlpha = 0.05 + r() * 0.08;
          ctx.lineWidth = S * (0.05 + r() * 0.05);
          ctx.beginPath();
          const y0 = height * (0.5 + (r() - 0.5) * 0.06);
          ctx.moveTo(width * 0.15, y0);
          ctx.bezierCurveTo(width * 0.4, y0 - S * 0.3, width * 0.6, y0 + S * 0.3, width * 0.85, y0 - S * 0.05);
          ctx.stroke();
        }
      }
      // Canvas grain.
      ctx.globalAlpha = 1;
      const img = ctx.getImageData(0, 0, width, height);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const g = (r() - 0.5) * 14;
        d[i] += g; d[i + 1] += g; d[i + 2] += g;
      }
      ctx.putImageData(img, 0, 0);
      return canvas;
    },
  };

  /* ------------------------------------------------------------------------
     Material library
     ------------------------------------------------------------------------ */

  const DEFAULT_PALETTE = {
    wall: '#f3eee7',
    ceiling: '#f4f1ec',
    floor: 'oak',           // oak | travertine | marble | concrete | terracotta | stone
    floorTint: '#ffffff',
    fabric: '#ebe4d8',      // main upholstery (bouclé)
    fabric2: '#cbb89d',     // secondary upholstery (linen)
    accent: '#8a6b52',      // leather / accent chair
    wood: '#ffffff',        // tint over the oak texture
    darkWood: '#6e5a4a',
    metal: '#7a6450',       // bronze
    stone: '#ffffff',
    rug: '#ddd3c3',
    leaf: '#6f7a58',
    outside: '#e2d9cb',
  };

  // Every procedural texture the library uses: generator + the normal-map
  // strength derived from its height field (null = colour map only).
  // tools/render exports these to assets/textures/<key>.webp (and
  // <key>-normal.webp) so the live site can load them instead of computing.
  const TEXTURES = {
    wood: { gen: (s) => TextureFactory.wood(s, { seed: 4 }), normal: 0.8 },
    planks: { gen: (s) => TextureFactory.wood(s, { seed: 8, planks: true, rows: 8 }), normal: 1.6 },
    marble: { gen: (s) => TextureFactory.marble(s, { seed: 7 }), normal: null },
    marbleDark: { gen: (s) => TextureFactory.marble(s, { seed: 31, dark: true }), normal: null },
    travertine: { gen: (s) => TextureFactory.travertine(s, { seed: 5 }), normal: 1.4 },
    travTiles: { gen: (s) => TextureFactory.travertine(s, { seed: 6, tiles: 2 }), normal: 1.2 },
    plaster: { gen: (s) => TextureFactory.plaster(s, { seed: 9 }), normal: 0.35 },
    linen: { gen: (s) => TextureFactory.fabric(s, { seed: 13 }), normal: 1.4 },
    boucle: { gen: (s) => TextureFactory.fabric(s, { seed: 14, boucle: true }), normal: 3.2 },
    concrete: { gen: (s) => TextureFactory.concrete(s, { seed: 17 }), normal: 0.6 },
    stone: { gen: (s) => TextureFactory.stone(s, { seed: 19 }), normal: 1 },
    stoneWall: { gen: (s) => TextureFactory.stone(s, { seed: 21, blocks: 5, base: [190, 178, 160] }), normal: 2.5 },
    brushed: { gen: (s) => TextureFactory.brushed(s, { seed: 23 }), normal: null },
  };

  // Render every texture (and normal map) to canvases — used by the export
  // tooling to produce assets/textures.
  function generateTextureSet(size = 1024) {
    const out = [];
    Object.entries(TEXTURES).forEach(([key, t]) => {
      const res = t.gen(size);
      out.push({ name: key, canvas: res.canvas });
      if (t.normal) out.push({ name: key + '-normal', canvas: heightToNormal(res.heights, size, t.normal) });
    });
    return out;
  }

  /**
   * Build the shared material library.
   * options.images   — optional { key: HTMLImageElement|ImageBitmap } of
   *                    pre-rendered textures; anything missing is generated.
   * options.palette  — colour/material overrides (see DEFAULT_PALETTE).
   * options.textureSize — procedural resolution (default 1024).
   */
  function buildMaterials(options = {}) {
    const size = options.textureSize || 1024;
    const pal = Object.assign({}, DEFAULT_PALETTE, options.palette || {});
    const cache = options.textureCache || {};
    const images = options.images || {};
    const anisotropy = options.anisotropy || 8;

    const generated = (key) => (cache[key] = cache[key] || TEXTURES[key].gen(size));
    const fromImage = (img, srgb, repeat) => {
      const t = new THREE.Texture(img);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repeat, repeat);
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = anisotropy;
      t.needsUpdate = true;
      return t;
    };
    // Colour map for a texture key.
    const T = (key, repeat = 1) => images[key]
      ? fromImage(images[key], true, repeat)
      : toTexture(generated(key).canvas, { repeat });
    // Normal map for a texture key (strength fixed in TEXTURES).
    const N = (key, repeat = 1) => {
      if (images[key + '-normal']) return fromImage(images[key + '-normal'], false, repeat);
      const nk = key + '-normal';
      cache[nk] = cache[nk] || heightToNormal(generated(key).heights, generated(key).canvas.width, TEXTURES[key].normal);
      return toTexture(cache[nk], { srgb: false, repeat });
    };

    const std = (p) => new THREE.MeshStandardMaterial(p);
    const phys = (p) => new THREE.MeshPhysicalMaterial(p);

    const floorMaps = {
      oak: () => ({ map: T('planks'), normalMap: N('planks'), roughness: 0.5, color: pal.floorTint, texMeters: 2.4 }),
      travertine: () => ({ map: T('travTiles'), normalMap: N('travTiles'), roughness: 0.55, color: pal.floorTint, texMeters: 2.4 }),
      marble: () => ({ map: T('marble'), roughness: 0.18, color: pal.floorTint, texMeters: 3.0 }),
      concrete: () => ({ map: T('concrete'), normalMap: N('concrete'), roughness: 0.62, color: pal.floorTint, texMeters: 4 }),
      terracotta: () => ({ map: T('travTiles'), normalMap: N('travTiles'), roughness: 0.75, color: pal.floorTint, texMeters: 1.6 }),
      stone: () => ({ map: T('stone'), normalMap: N('stone'), roughness: 0.7, color: pal.floorTint, texMeters: 3 }),
    };
    const floorSpec = (floorMaps[pal.floor] || floorMaps.oak)();
    const texMeters = floorSpec.texMeters;
    delete floorSpec.texMeters;

    const M = {
      floor: std(floorSpec),
      wall: std({ map: T('plaster'), normalMap: N('plaster'), color: pal.wall, roughness: 0.95 }),
      ceiling: std({ map: T('plaster'), color: pal.ceiling, roughness: 0.97 }),
      oak: std({ map: T('wood'), normalMap: N('wood'), color: pal.wood, roughness: 0.58 }),
      oakSlat: std({ map: T('wood'), color: pal.wood, roughness: 0.62 }),
      walnut: std({ map: T('wood'), normalMap: N('wood'), color: pal.darkWood, roughness: 0.5 }),
      marble: phys({ map: T('marble'), color: pal.stone, roughness: 0.14, clearcoat: 0.3, clearcoatRoughness: 0.2 }),
      marbleDark: phys({ map: T('marbleDark'), roughness: 0.18, clearcoat: 0.3 }),
      travertine: std({ map: T('travertine'), normalMap: N('travertine'), color: pal.stone, roughness: 0.62 }),
      stone: std({ map: T('stone'), normalMap: N('stone'), color: pal.stone, roughness: 0.78 }),
      stoneWall: std({ map: T('stoneWall'), normalMap: N('stoneWall'), roughness: 0.85 }),
      concrete: std({ map: T('concrete'), normalMap: N('concrete'), roughness: 0.8 }),
      boucle: phys({ map: T('boucle', 3), normalMap: N('boucle', 3), color: pal.fabric, roughness: 0.97, sheen: 0.6, sheenRoughness: 0.7, sheenColor: new THREE.Color('#ffffff') }),
      linen: phys({ map: T('linen', 2), normalMap: N('linen', 2), color: pal.fabric2, roughness: 0.93, sheen: 0.4, sheenRoughness: 0.8, sheenColor: new THREE.Color('#fff8ee') }),
      linenLight: phys({ map: T('linen', 2), normalMap: N('linen', 2), color: '#f1ece3', roughness: 0.93, sheen: 0.4, sheenRoughness: 0.8, sheenColor: new THREE.Color('#ffffff') }),
      leather: phys({ color: pal.accent, roughness: 0.45, clearcoat: 0.15, clearcoatRoughness: 0.5 }),
      rug: phys({ map: T('boucle', 6), normalMap: N('boucle', 6), color: pal.rug, roughness: 1, sheen: 0.5, sheenRoughness: 0.9, sheenColor: new THREE.Color('#ffffff') }),
      bronze: std({ map: T('brushed', 1), color: pal.metal, metalness: 1, roughness: 0.34 }),
      brass: std({ color: '#b39463', metalness: 1, roughness: 0.28 }),
      blackSteel: std({ color: '#2b2926', metalness: 0.85, roughness: 0.42 }),
      frame: std({ color: '#3a342e', metalness: 0.7, roughness: 0.45 }),
      glass: phys({ color: '#ffffff', metalness: 0, roughness: 0.02, transmission: 1, ior: 1.5, thickness: 0.01, transparent: true, opacity: 1 }),
      glassSmoke: phys({ color: '#b7b0a6', metalness: 0, roughness: 0.05, transmission: 0.9, ior: 1.5, thickness: 0.02 }),
      sheer: std({ color: '#f6f2ea', roughness: 1, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false }),
      ceramic: phys({ color: '#efeae1', roughness: 0.35, clearcoat: 0.4 }),
      ceramicDark: phys({ color: '#3d3833', roughness: 0.55, clearcoat: 0.2 }),
      clay: std({ color: '#b27a56', roughness: 0.85 }),
      sand: std({ color: '#d7c6ab', roughness: 0.9 }),
      charcoal: std({ color: '#34302c', roughness: 0.7 }),
      paper: std({ color: '#efebe4', roughness: 0.95 }),
      leaf: std({ color: pal.leaf, roughness: 0.62, side: THREE.DoubleSide }),
      leafDark: std({ color: '#4c5a3c', roughness: 0.55, side: THREE.DoubleSide }),
      bark: std({ color: '#5d5044', roughness: 0.95 }),
      soil: std({ color: '#3a3129', roughness: 1 }),
      outside: std({ map: T('stone'), color: pal.outside, roughness: 0.9 }),
      hedge: std({ map: T('stone'), color: '#6f7d58', roughness: 0.95 }),
      lawn: std({ map: T('concrete'), color: '#a3b07e', roughness: 1 }),
      treeLine: std({ color: '#56623f', roughness: 1 }),
      water: phys({ color: '#9fb4b0', roughness: 0.05, metalness: 0.1, clearcoat: 1 }),
      light: std({ color: '#ffffff', emissive: new THREE.Color('#ffd7a6'), emissiveIntensity: 4, roughness: 1 }),
      lightSoft: std({ color: '#fbf4ea', emissive: new THREE.Color('#ffdcb0'), emissiveIntensity: 1.6, roughness: 1 }),
      screen: std({ color: '#1d1c1b', roughness: 0.2 }),
    };

    // Metres covered by one texture repeat, used by worldUV().
    M.floor.userData.texMeters = texMeters;
    M.wall.userData.texMeters = 3;
    M.ceiling.userData.texMeters = 4;
    M.oak.userData.texMeters = 1.6;
    M.oakSlat.userData = { texMeters: 1.2, grainVertical: true };
    M.walnut.userData.texMeters = 1.6;
    M.marble.userData.texMeters = 1.8;
    M.marbleDark.userData.texMeters = 1.8;
    M.travertine.userData.texMeters = 1.4;
    M.stone.userData.texMeters = 2;
    M.stoneWall.userData.texMeters = 3.2;
    M.concrete.userData.texMeters = 3;
    M.outside.userData.texMeters = 2.4;
    M.lawn.userData.texMeters = 5;
    M.hedge.userData.texMeters = 1.5;
    M.bronze.userData.texMeters = 0.6;

    M.palette = pal;
    M.textureCache = cache;
    return M;
  }

  /* ------------------------------------------------------------------------
     Geometry helpers
     ------------------------------------------------------------------------ */

  // Planar-project UVs in metres so textures keep real-world scale on any
  // box, regardless of its size. Picks the projection per face normal.
  function worldUV(geometry, metres, grainVertical) {
    const pos = geometry.attributes.position;
    const nor = geometry.attributes.normal;
    if (!pos || !nor) return geometry;
    const uv = new Float32Array(pos.count * 2);
    const s = 1 / metres;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
      let u, v;
      if (ay >= ax && ay >= az) { u = x; v = z; }
      else if (ax >= az) { u = z; v = y; }
      else { u = x; v = y; }
      if (grainVertical && !(ay >= ax && ay >= az)) { const t = u; u = v; v = t; }
      uv[i * 2] = u * s;
      uv[i * 2 + 1] = v * s;
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return geometry;
  }

  function mesh(geometry, material, opts = {}) {
    if (material && material.userData && material.userData.texMeters && opts.worldUV !== false) {
      worldUV(geometry, material.userData.texMeters, material.userData.grainVertical);
    }
    const m = new THREE.Mesh(geometry, material);
    m.castShadow = opts.cast !== false;
    m.receiveShadow = true;
    return m;
  }

  function box(w, h, d, material, radius = 0, opts = {}) {
    const geo = radius > 0
      ? new THREE.RoundedBoxGeometry(w, h, d, opts.segments || 3, Math.min(radius, w / 2, h / 2, d / 2))
      : new THREE.BoxGeometry(w, h, d);
    return mesh(geo, material, opts);
  }

  function cyl(rTop, rBottom, h, material, segs = 48, opts = {}) {
    return mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segs, 1, !!opts.open), material, Object.assign({ worldUV: false }, opts));
  }

  function at(obj, x, y, z, ry = 0) {
    obj.position.set(x, y, z);
    if (ry) obj.rotation.y = ry;
    return obj;
  }

  function group(...children) {
    const g = new THREE.Group();
    children.forEach((c) => c && g.add(c));
    return g;
  }

  // Revolve a 2D profile ([r, y] pairs) into a vessel shape.
  function lathe(profile, material, segs = 48) {
    const pts = profile.map(([r, y]) => new THREE.Vector2(r, y));
    return mesh(new THREE.LatheGeometry(pts, segs), material, { worldUV: false });
  }

  /* ------------------------------------------------------------------------
     Objects & furniture
     Every builder returns a Group whose origin sits on the floor, centred,
     facing +Z.
     ------------------------------------------------------------------------ */

  const Objects = {
    vase(M, { h = 0.42, r = 0.12, variant = 0, mat } = {}) {
      const profiles = [
        [[0, 0], [r * 0.7, 0], [r, h * 0.25], [r * 0.95, h * 0.6], [r * 0.45, h * 0.88], [r * 0.4, h], [r * 0.36, h], [0.001, h * 0.2]],
        [[0, 0], [r * 0.9, 0], [r, h * 0.1], [r * 0.9, h * 0.5], [r * 0.35, h * 0.8], [r * 0.5, h], [r * 0.46, h], [0.001, h * 0.15]],
        [[0, 0], [r, 0], [r * 1.05, h * 0.5], [r, h], [r * 0.93, h], [0.001, h * 0.1]],
      ];
      return group(lathe(profiles[variant % 3], mat || M.ceramic));
    },

    bowl(M, { r = 0.18, mat } = {}) {
      return group(lathe([[0, 0], [r * 0.5, 0], [r * 0.9, r * 0.25], [r, r * 0.45], [r * 0.94, r * 0.45], [r * 0.84, r * 0.26], [0.001, r * 0.06]], mat || M.ceramicDark));
    },

    books(M, { count = 4, seed = 2 } = {}) {
      const r = rng(seed);
      const g = new THREE.Group();
      const cols = ['#d9d0c1', '#8c7a66', '#3b3733', '#b8a48a', '#e8e3da', '#6f6254'];
      let y = 0;
      for (let i = 0; i < count; i++) {
        const w = 0.2 + r() * 0.1, d = 0.26 + r() * 0.06, t = 0.025 + r() * 0.03;
        const b = box(w, t, d, new THREE.MeshStandardMaterial({ color: cols[Math.floor(r() * cols.length)], roughness: 0.85 }), 0.003);
        at(b, (r() - 0.5) * 0.03, y + t / 2, (r() - 0.5) * 0.03, (r() - 0.5) * 0.3);
        g.add(b);
        y += t;
      }
      return g;
    },

    sculpture(M, { kind = 'pebbles', scale = 1 } = {}) {
      const g = new THREE.Group();
      if (kind === 'pebbles') {
        const specs = [[0.16, 0.06, 0.13, M.travertine], [0.12, 0.05, 0.1, M.stone], [0.08, 0.04, 0.07, M.marble]];
        let y = 0;
        specs.forEach(([rx, ry, rz, mat], i) => {
          const s = mesh(new THREE.SphereGeometry(1, 32, 16), mat, { worldUV: false });
          s.scale.set(rx * scale, ry * scale, rz * scale);
          s.position.set(i * 0.01, y + ry * scale * 0.85, 0);
          s.rotation.y = i * 0.7;
          y += ry * scale * 1.6;
          g.add(s);
        });
      } else if (kind === 'sphere') {
        const s = mesh(new THREE.SphereGeometry(0.14 * scale, 48, 32), M.marble, { worldUV: false });
        s.position.y = 0.14 * scale;
        g.add(s);
      } else {
        // Open ring on a plinth.
        const ring = mesh(new THREE.TorusGeometry(0.16 * scale, 0.035 * scale, 24, 64), M.ceramicDark, { worldUV: false });
        ring.position.y = 0.2 * scale;
        g.add(ring, at(box(0.18 * scale, 0.05 * scale, 0.1 * scale, M.travertine, 0.005), 0, 0.025 * scale, 0));
      }
      return g;
    },

    // Olive-style tree or fig in a stone planter. Foliage is merged into a
    // single geometry for performance.
    plant(M, { height = 2.2, spread = 0.8, seed = 1, leafSize = 1, leaves = 900, pot = true, potR = 0.3 } = {}) {
      const r = rng(seed);
      const g = new THREE.Group();
      const potH = pot ? 0.55 : 0;
      if (pot) {
        g.add(at(cyl(potR, potR * 0.82, potH, M.stone, 48), 0, potH / 2, 0));
        g.add(at(cyl(potR * 0.92, potR * 0.92, 0.02, M.soil, 32), 0, potH - 0.03, 0));
      }
      // Trunk + branches as tubes.
      const trunkTop = new THREE.Vector3((r() - 0.5) * 0.2, potH + height * 0.55, (r() - 0.5) * 0.2);
      const trunkCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, potH - 0.05, 0),
        new THREE.Vector3((r() - 0.5) * 0.12, potH + height * 0.25, (r() - 0.5) * 0.12),
        trunkTop,
      ]);
      const trunkGeos = [new THREE.TubeGeometry(trunkCurve, 16, 0.035 * Math.max(1, height / 2.2), 8, false)];
      const clusters = [];
      const branchCount = 4 + Math.floor(r() * 3);
      for (let i = 0; i < branchCount; i++) {
        const a = (i / branchCount) * TAU + r() * 0.8;
        const len = spread * (0.5 + r() * 0.5);
        const end = new THREE.Vector3(
          trunkTop.x + Math.cos(a) * len,
          potH + height * (0.7 + r() * 0.3),
          trunkTop.z + Math.sin(a) * len * 0.8,
        );
        const mid = trunkTop.clone().lerp(end, 0.5).add(new THREE.Vector3(0, 0.1, 0));
        trunkGeos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([trunkTop, mid, end]), 10, 0.016, 6, false));
        clusters.push(end);
      }
      clusters.push(trunkTop.clone().add(new THREE.Vector3(0, height * 0.35, 0)));
      g.add(mesh(THREE.mergeGeometries(trunkGeos), M.bark, { worldUV: false }));

      // Leaves: small flattened ellipsoids scattered in each cluster.
      const leafBase = new THREE.SphereGeometry(1, 6, 4);
      const tmp = new THREE.Object3D();
      const geosA = [], geosB = [];
      const per = Math.ceil(leaves / clusters.length);
      clusters.forEach((c) => {
        for (let i = 0; i < per; i++) {
          const rad = spread * 0.55 * Math.cbrt(r());
          const th = r() * TAU, ph = Math.acos(2 * r() - 1);
          tmp.position.set(
            c.x + rad * Math.sin(ph) * Math.cos(th),
            c.y + rad * Math.cos(ph) * 0.6,
            c.z + rad * Math.sin(ph) * Math.sin(th),
          );
          tmp.rotation.set(r() * TAU, r() * TAU, r() * TAU);
          tmp.scale.set(0.055 * leafSize, 0.004, 0.014 * leafSize);
          tmp.updateMatrix();
          const lg = leafBase.clone().applyMatrix4(tmp.matrix);
          (r() < 0.6 ? geosA : geosB).push(lg);
        }
      });
      if (geosA.length) g.add(mesh(THREE.mergeGeometries(geosA), M.leaf, { worldUV: false }));
      if (geosB.length) g.add(mesh(THREE.mergeGeometries(geosB), M.leafDark, { worldUV: false }));
      g.userData.sway = 'plant';
      return g;
    },

    // Large-leaf floor plant (bird of paradise / banana style).
    bigLeafPlant(M, { height = 1.8, seed = 4, potR = 0.26 } = {}) {
      const r = rng(seed);
      const g = new THREE.Group();
      const potH = 0.5;
      g.add(at(cyl(potR, potR * 0.9, potH, M.ceramicDark, 48), 0, potH / 2, 0));
      const stems = [], blades = [];
      const count = 9;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * TAU + r() * 0.5;
        const lean = 0.15 + r() * 0.35;
        const h = height * (0.55 + r() * 0.45);
        const tip = new THREE.Vector3(Math.cos(a) * lean, potH + h, Math.sin(a) * lean);
        stems.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
          new THREE.Vector3(0, potH, 0),
          new THREE.Vector3(Math.cos(a) * lean * 0.3, potH + h * 0.5, Math.sin(a) * lean * 0.3),
          tip,
        ]), 8, 0.01, 5, false));
        // Blade: a scaled, slightly cupped disc oriented along the stem.
        const blade = new THREE.SphereGeometry(1, 16, 8);
        const m = new THREE.Matrix4();
        const o = new THREE.Object3D();
        o.position.copy(tip).add(new THREE.Vector3(Math.cos(a) * 0.12, 0.2, Math.sin(a) * 0.12));
        o.rotation.set(0, -a, 0.9 + r() * 0.4);
        o.scale.set(0.34, 0.012, 0.11);
        o.updateMatrix();
        m.copy(o.matrix);
        blades.push(blade.applyMatrix4(m));
      }
      g.add(mesh(THREE.mergeGeometries(stems), M.leafDark, { worldUV: false }));
      g.add(mesh(THREE.mergeGeometries(blades), M.leaf, { worldUV: false }));
      g.userData.sway = 'plant';
      return g;
    },

    sofa(M, { w = 2.8, d = 1.0, mat, baseMat, pillows = true, seed = 3 } = {}) {
      const fab = mat || M.boucle;
      const g = new THREE.Group();
      const r = rng(seed);
      g.add(at(box(w - 0.14, 0.08, d - 0.14, baseMat || M.walnut, 0.01), 0, 0.04, 0));
      g.add(at(box(w, 0.26, d, fab, 0.06), 0, 0.21, 0));
      const n = w > 2.4 ? 3 : 2;
      const armW = 0.22;
      const cw = (w - armW * 2) / n;
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + armW + cw * (i + 0.5);
        g.add(at(box(cw - 0.012, 0.17, d - 0.28, fab, 0.075, { segments: 4 }), x, 0.42, 0.1));
        const back = box(cw - 0.03, 0.42, 0.22, fab, 0.1, { segments: 4 });
        back.rotation.x = -0.14;
        g.add(at(back, x, 0.64, -d / 2 + 0.25));
      }
      g.add(at(box(w, 0.52, 0.18, fab, 0.07), 0, 0.53, -d / 2 + 0.09));
      g.add(at(box(armW, 0.5, d, fab, 0.09, { segments: 4 }), -w / 2 + armW / 2, 0.47, 0));
      g.add(at(box(armW, 0.5, d, fab, 0.09, { segments: 4 }), w / 2 - armW / 2, 0.47, 0));
      if (pillows) {
        const p1 = box(0.46, 0.44, 0.14, M.linen, 0.07, { segments: 4 });
        p1.rotation.set(-0.25, 0.25, 0.08);
        g.add(at(p1, -w / 2 + armW + 0.34, 0.72, -d / 2 + 0.42));
        const p2 = box(0.42, 0.4, 0.13, M.leather, 0.065, { segments: 4 });
        p2.rotation.set(-0.22, -0.1 - r() * 0.1, -0.06);
        g.add(at(p2, w / 2 - armW - 0.34, 0.7, -d / 2 + 0.42));
      }
      return g;
    },

    // Sculptural barrel lounge chair.
    loungeChair(M, { mat } = {}) {
      const fab = mat || M.boucle;
      const g = new THREE.Group();
      g.add(at(cyl(0.4, 0.38, 0.34, fab, 64), 0, 0.17, 0));
      g.add(at(mesh(new THREE.CylinderGeometry(0.37, 0.39, 0.12, 64), fab, { worldUV: false }), 0, 0.4, 0.02));
      const back = mesh(new THREE.TorusGeometry(0.35, 0.11, 20, 64, Math.PI * 1.25), fab, { worldUV: false });
      back.rotation.x = -Math.PI / 2;
      back.rotation.z = Math.PI * 0.875 + Math.PI;
      back.scale.set(1, 1, 1.7);
      back.position.y = 0.55;
      g.add(back);
      return g;
    },

    // Low armchair with walnut frame and leather cushions.
    frameChair(M, { cushion } = {}) {
      const g = new THREE.Group();
      const c = cushion || M.leather;
      const wood = M.walnut;
      [[-0.34, 0.33], [0.34, 0.33], [-0.34, -0.33], [0.34, -0.33]].forEach(([x, z]) => {
        g.add(at(box(0.045, 0.4, 0.045, wood, 0.01), x, 0.2, z));
      });
      g.add(at(box(0.08, 0.05, 0.8, wood, 0.015), -0.34, 0.55, 0));
      g.add(at(box(0.08, 0.05, 0.8, wood, 0.015), 0.34, 0.55, 0));
      [[-0.34], [0.34]].forEach(([x]) => g.add(at(box(0.045, 0.2, 0.045, wood, 0.01), x, 0.47, 0.33)));
      g.add(at(box(0.66, 0.14, 0.7, c, 0.06, { segments: 4 }), 0, 0.37, 0.03));
      const back = box(0.64, 0.5, 0.13, c, 0.06, { segments: 4 });
      back.rotation.x = -0.28;
      g.add(at(back, 0, 0.66, -0.29));
      return g;
    },

    diningChair(M, { seat } = {}) {
      const g = new THREE.Group();
      const wood = M.oak;
      [[-0.2, 0.2], [0.2, 0.2], [-0.2, -0.2], [0.2, -0.2]].forEach(([x, z]) => {
        const leg = cyl(0.016, 0.013, 0.45, wood, 12);
        g.add(at(leg, x, 0.225, z));
      });
      g.add(at(box(0.48, 0.07, 0.46, seat || M.linen, 0.03, { segments: 3 }), 0, 0.48, 0));
      const back = mesh(new THREE.TorusGeometry(0.24, 0.022, 10, 40, Math.PI * 0.9), wood, { worldUV: false });
      back.rotation.x = -Math.PI / 2;
      back.rotation.z = Math.PI * 1.05;
      back.scale.set(1, 1, 3.2);
      back.position.set(0, 0.8, 0.02);
      g.add(back);
      [[-0.2], [0.2]].forEach(([x]) => g.add(at(cyl(0.013, 0.013, 0.34, wood, 10), x, 0.66, -0.2)));
      return g;
    },

    stool(M, { h = 0.66 } = {}) {
      const g = new THREE.Group();
      g.add(at(cyl(0.2, 0.18, 0.06, M.leather, 40), 0, h, 0));
      [0, 1, 2, 3].forEach((i) => {
        const a = (i / 4) * TAU + Math.PI / 4;
        const leg = cyl(0.012, 0.012, h, M.bronze, 8);
        leg.position.set(Math.cos(a) * 0.14, h / 2, Math.sin(a) * 0.14);
        leg.rotation.set(Math.sin(a) * 0.06, 0, -Math.cos(a) * 0.06);
        g.add(leg);
      });
      g.add(at(mesh(new THREE.TorusGeometry(0.15, 0.008, 8, 40), M.bronze, { worldUV: false }), 0, 0.24, 0));
      g.children[g.children.length - 1].rotation.x = Math.PI / 2;
      return g;
    },

    // Pair of offset travertine drum tables.
    coffeeTable(M, { kind = 'drums', mat } = {}) {
      const s = mat || M.travertine;
      const g = new THREE.Group();
      if (kind === 'drums') {
        g.add(at(cyl(0.55, 0.55, 0.32, s, 72), -0.18, 0.16, 0));
        g.add(at(cyl(0.34, 0.34, 0.42, s, 64), 0.52, 0.21, 0.24));
      } else if (kind === 'slab') {
        g.add(at(box(1.4, 0.06, 0.8, s, 0.01), 0, 0.33, 0));
        g.add(at(box(0.18, 0.3, 0.7, s, 0.005), -0.45, 0.15, 0));
        g.add(at(box(0.18, 0.3, 0.7, s, 0.005), 0.45, 0.15, 0));
      } else {
        g.add(at(box(1.3, 0.34, 0.75, s, 0.02), 0, 0.17, 0));
      }
      return g;
    },

    sideTable(M, { mat, h = 0.5 } = {}) {
      return group(at(cyl(0.23, 0.23, h, mat || M.walnut, 48), 0, h / 2, 0));
    },

    rug(M, { w = 3.2, d = 2.3, mat } = {}) {
      return group(at(box(w, 0.016, d, mat || M.rug, 0.008, { worldUV: false, cast: false }), 0, 0.008, 0));
    },

    sideboard(M, { w = 2.4, h = 0.62, d = 0.46, mat } = {}) {
      const wood = mat || M.oak;
      const g = new THREE.Group();
      g.add(at(box(w - 0.1, 0.08, d - 0.08, M.charcoal), 0, 0.04, 0));
      g.add(at(box(w, h - 0.08, d, wood, 0.006), 0, 0.08 + (h - 0.08) / 2, 0));
      const doors = Math.max(2, Math.round(w / 0.6));
      const dw = w / doors;
      for (let i = 0; i < doors; i++) {
        // Thin recessed reveal between fronts reads as crafted joinery.
        if (i > 0) g.add(at(box(0.006, h - 0.14, 0.01, M.charcoal, 0, { cast: false }), -w / 2 + dw * i, 0.08 + (h - 0.08) / 2, d / 2 + 0.001));
      }
      return g;
    },

    // Upholstered platform bed with a tall panel headboard.
    bed(M, { w = 1.9, l = 2.15, headMat, bedding } = {}) {
      const g = new THREE.Group();
      const sheet = bedding || M.linenLight;
      g.add(at(box(w + 0.16, 0.3, l, headMat || M.linen, 0.04), 0, 0.15, 0));
      g.add(at(box(w, 0.22, l - 0.12, sheet, 0.07, { segments: 4 }), 0, 0.41, 0.02));
      g.add(at(box(w + 0.06, 0.07, l * 0.62, sheet, 0.035, { segments: 4 }), 0, 0.53, l * 0.17));
      g.add(at(box(w + 0.1, 0.04, 0.55, M.linen, 0.02), 0, 0.575, l * 0.3));
      const pw = w / 2 - 0.08;
      [-1, 1].forEach((s) => {
        const p = box(pw, 0.16, 0.42, sheet, 0.075, { segments: 4 });
        p.rotation.x = -0.5;
        g.add(at(p, s * (pw / 2 + 0.04), 0.62, -l / 2 + 0.3));
        const p2 = box(pw * 0.8, 0.15, 0.36, M.linen, 0.07, { segments: 4 });
        p2.rotation.x = -0.35;
        g.add(at(p2, s * (pw / 2 + 0.02), 0.62, -l / 2 + 0.48));
      });
      g.add(at(box(w + 0.6, 1.15, 0.12, headMat || M.linen, 0.05, { segments: 4 }), 0, 0.575, -l / 2 - 0.06));
      return g;
    },

    tableLamp(M, { h = 0.55 } = {}) {
      const g = new THREE.Group();
      g.add(lathe([[0, 0], [0.09, 0], [0.11, 0.08], [0.1, 0.2], [0.04, 0.3], [0.02, 0.32], [0.001, 0.32]], M.ceramic));
      g.add(at(cyl(0.006, 0.006, h - 0.32, M.brass, 8), 0, 0.32 + (h - 0.32) / 2, 0));
      g.add(at(mesh(new THREE.SphereGeometry(0.04, 16, 12), M.light, { worldUV: false, cast: false }), 0, h - 0.04, 0));
      g.add(at(cyl(0.15, 0.19, 0.2, M.sheer, 48, { open: true, cast: false }), 0, h - 0.02, 0));
      return g;
    },

    pendant(M, { drop = 1, kind = 'globe', r = 0.2 } = {}) {
      const g = new THREE.Group();
      g.add(at(cyl(0.004, 0.004, drop, M.blackSteel, 6, { cast: false }), 0, -drop / 2, 0));
      if (kind === 'globe') {
        g.add(at(mesh(new THREE.SphereGeometry(r, 48, 32), M.lightSoft, { worldUV: false, cast: false }), 0, -drop - r, 0));
      } else {
        const dome = mesh(new THREE.SphereGeometry(r, 48, 16, 0, TAU, 0, Math.PI / 2), M.bronze, { worldUV: false });
        dome.material = M.bronze;
        g.add(at(dome, 0, -drop - r * 0.2, 0));
        dome.scale.y = 0.7;
        const disc = mesh(new THREE.CircleGeometry(r * 0.9, 32), M.light, { worldUV: false, cast: false });
        disc.rotation.x = Math.PI / 2;
        g.add(at(disc, 0, -drop - r * 0.2 + 0.001, 0));
      }
      g.userData.swing = true;
      return g;
    },

    linearPendant(M, { len = 1.8, drop = 1.1 } = {}) {
      const g = new THREE.Group();
      [-len / 2 + 0.1, len / 2 - 0.1].forEach((x) => g.add(at(cyl(0.003, 0.003, drop, M.blackSteel, 6, { cast: false }), x, -drop / 2, 0)));
      g.add(at(box(len, 0.045, 0.07, M.bronze, 0.01), 0, -drop - 0.022, 0));
      g.add(at(box(len - 0.04, 0.004, 0.05, M.light, 0, { cast: false, worldUV: false }), 0, -drop - 0.046, 0));
      return g;
    },

    arcLamp(M, { reach = 1.6, h = 2.1 } = {}) {
      const g = new THREE.Group();
      g.add(at(cyl(0.2, 0.2, 0.06, M.marble, 48), 0, 0.03, 0));
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0.05, 0),
        new THREE.Vector3(0.05, h * 0.7, 0),
        new THREE.Vector3(reach * 0.5, h, 0),
        new THREE.Vector3(reach, h * 0.92, 0),
      ]);
      g.add(mesh(new THREE.TubeGeometry(curve, 48, 0.012, 8, false), M.brass, { worldUV: false }));
      const shade = mesh(new THREE.SphereGeometry(0.22, 48, 16, 0, TAU, 0, Math.PI / 2), M.brass, { worldUV: false });
      shade.scale.y = 0.6;
      g.add(at(shade, reach, h * 0.92 - 0.12, 0));
      const bulb = mesh(new THREE.CircleGeometry(0.19, 32), M.light, { worldUV: false, cast: false });
      bulb.rotation.x = Math.PI / 2;
      g.add(at(bulb, reach, h * 0.92 - 0.121, 0));
      return g;
    },

    sconce(M) {
      const g = new THREE.Group();
      g.add(at(box(0.1, 0.24, 0.05, M.brass, 0.01), 0, 0, 0.025));
      const glow = mesh(new THREE.SphereGeometry(0.07, 24, 16), M.lightSoft, { worldUV: false, cast: false });
      g.add(at(glow, 0, 0.05, 0.11));
      return g;
    },

    artwork(M, { w = 1.2, h = 1.5, seed = 1, frame = 'oak' } = {}) {
      const g = new THREE.Group();
      const art = TextureFactory.art(Math.round(512 * w / Math.max(w, h)), Math.round(512 * h / Math.max(w, h)), { seed });
      const artMat = new THREE.MeshStandardMaterial({ map: toTexture(art, { repeat: 1 }), roughness: 0.9 });
      artMat.map.wrapS = artMat.map.wrapT = THREE.ClampToEdgeWrapping;
      const frameMat = frame === 'black' ? M.charcoal : M.oak;
      g.add(at(box(w + 0.06, h + 0.06, 0.04, frameMat, 0.004), 0, 0, 0.02));
      const canvas = mesh(new THREE.PlaneGeometry(w, h), artMat, { worldUV: false, cast: false });
      g.add(at(canvas, 0, 0, 0.041));
      return g;
    },

    // Sheer curtain with sinusoidal folds.
    curtain(M, { w = 1.4, h = 3, folds = 7, mat } = {}) {
      const geo = new THREE.PlaneGeometry(w, h, folds * 10, 1);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        p.setZ(i, Math.sin((x / w) * folds * TAU) * 0.045);
      }
      geo.computeVertexNormals();
      const m = mesh(geo, mat || M.sheer, { worldUV: false, cast: false });
      m.position.y = h / 2;
      const g = group(m);
      g.userData.sway = 'curtain';
      return g;
    },

    // Vertical oak slat wall panel (w x h), merged into two draw calls.
    slatWall(M, { w = 3, h = 3, slat = 0.045, gap = 0.022, depth = 0.03, mat } = {}) {
      const g = new THREE.Group();
      g.add(at(box(w, h, 0.02, M.charcoal, 0, { cast: false }), 0, h / 2, 0.01));
      const count = Math.floor(w / (slat + gap));
      const geos = [];
      const start = -((count - 1) * (slat + gap)) / 2;
      const src = mat || M.oakSlat;
      for (let i = 0; i < count; i++) {
        const b = new THREE.BoxGeometry(slat, h, depth);
        b.translate(start + i * (slat + gap), h / 2, 0.02 + depth / 2);
        geos.push(b);
      }
      const merged = THREE.mergeGeometries(geos);
      g.add(mesh(merged, src));
      return g;
    },

    // Open shelving / bookcase grid with styled objects.
    bookcase(M, { w = 2.4, h = 2.6, d = 0.36, cols = 4, rows = 5, seed = 5, mat } = {}) {
      const g = new THREE.Group();
      const wood = mat || M.walnut;
      const r = rng(seed);
      const t = 0.03;
      g.add(at(box(w, h, 0.02, M.charcoal, 0, { cast: false }), 0, h / 2, -d / 2 + 0.01));
      for (let i = 0; i <= rows; i++) g.add(at(box(w, t, d, wood), 0, (h - t) * (i / rows) + t / 2, 0));
      for (let j = 0; j <= cols; j++) g.add(at(box(t, h, d, wood), -w / 2 + t / 2 + (w - t) * (j / cols), h / 2, 0));
      const cw = (w - t) / cols, rh = (h - t) / rows;
      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
          const cx = -w / 2 + t + cw * (j + 0.5) - t / 2;
          const y = rh * i + t;
          const pick = r();
          if (pick < 0.4) {
            const b = Objects.books(M, { count: 3 + Math.floor(r() * 4), seed: i * 10 + j });
            g.add(at(b, cx - cw * 0.15, y, 0));
          } else if (pick < 0.65) {
            g.add(at(Objects.vase(M, { h: 0.18 + r() * 0.12, r: 0.06 + r() * 0.03, variant: Math.floor(r() * 3), mat: r() < 0.5 ? M.ceramic : M.clay }), cx, y, 0));
          } else if (pick < 0.8) {
            g.add(at(Objects.sculpture(M, { kind: r() < 0.5 ? 'pebbles' : 'ring', scale: 0.6 }), cx, y, 0));
          } else if (pick < 0.92) {
            // Upright books leaning together.
            const n = 5 + Math.floor(r() * 5);
            for (let k = 0; k < n; k++) {
              const bh = 0.2 + r() * 0.08;
              const b = box(0.028, bh, 0.2, new THREE.MeshStandardMaterial({ color: ['#e0d7c8', '#8f7c67', '#403a34', '#c2ae93'][k % 4], roughness: 0.85 }), 0.002);
              g.add(at(b, cx - cw * 0.35 + k * 0.032, y + bh / 2, 0.02));
            }
          }
        }
      }
      return g;
    },

    desk(M, { w = 1.8, d = 0.8 } = {}) {
      const g = new THREE.Group();
      g.add(at(box(w, 0.04, d, M.walnut, 0.006), 0, 0.74, 0));
      g.add(at(box(0.04, 0.72, d - 0.1, M.walnut, 0.004), -w / 2 + 0.1, 0.36, 0));
      g.add(at(box(0.45, 0.5, d - 0.1, M.walnut, 0.006), w / 2 - 0.3, 0.47, 0));
      g.add(at(box(0.04, 0.22, d - 0.1, M.walnut, 0.004), w / 2 - 0.1, 0.11, 0));
      // Desk styling: closed laptop, notebook, lamp, ceramic.
      g.add(at(box(0.32, 0.015, 0.22, M.blackSteel, 0.004), -0.2, 0.768, 0.05, 0.1));
      g.add(at(Objects.books(M, { count: 3, seed: 9 }), 0.35, 0.76, -0.15, 0.2));
      g.add(at(Objects.vase(M, { h: 0.22, r: 0.07, variant: 1, mat: M.clay }), -w / 2 + 0.22, 0.76, -0.22));
      g.add(at(Objects.tableLamp(M, { h: 0.5 }), w / 2 - 0.22, 0.76, -0.25));
      return g;
    },

    officeChair(M) {
      const g = new THREE.Group();
      g.add(at(cyl(0.3, 0.3, 0.02, M.bronze, 32), 0, 0.01, 0));
      g.add(at(cyl(0.025, 0.025, 0.4, M.bronze, 12), 0, 0.22, 0));
      g.add(at(box(0.5, 0.09, 0.48, M.leather, 0.04, { segments: 4 }), 0, 0.46, 0));
      const back = mesh(new THREE.TorusGeometry(0.26, 0.05, 16, 48, Math.PI), M.leather, { worldUV: false });
      back.rotation.x = -Math.PI / 2;
      back.rotation.z = Math.PI;
      back.scale.set(1, 1, 2.2);
      back.position.set(0, 0.7, 0.02);
      g.add(back);
      return g;
    },

    diningTable(M, { w = 2.6, d = 1.0, mat } = {}) {
      const g = new THREE.Group();
      const top = mat || M.oak;
      g.add(at(box(w, 0.05, d, top, 0.01), 0, 0.745, 0));
      g.add(at(box(0.08, 0.72, d * 0.65, top, 0.01), -w / 2 + 0.45, 0.36, 0));
      g.add(at(box(0.08, 0.72, d * 0.65, top, 0.01), w / 2 - 0.45, 0.36, 0));
      g.add(at(box(w - 0.9, 0.06, 0.08, top, 0.01), 0, 0.2, 0));
      return g;
    },

    roundTable(M, { r = 0.7, mat } = {}) {
      const g = new THREE.Group();
      const s = mat || M.travertine;
      g.add(at(cyl(r, r, 0.05, s, 72), 0, 0.745, 0));
      g.add(at(cyl(0.2, 0.32, 0.7, s, 48), 0, 0.36, 0));
      return g;
    },

    // Kitchen island with a waterfall marble top.
    island(M, { w = 2.9, d = 1.05, top } = {}) {
      const g = new THREE.Group();
      const t = top || M.marble;
      g.add(at(box(w - 0.1, 0.86, d - 0.1, M.oak, 0.005), 0, 0.43, -0.02));
      g.add(at(box(w, 0.045, d, t, 0.004), 0, 0.905, 0));
      g.add(at(box(0.045, 0.93, d, t, 0.004), -w / 2 + 0.0225, 0.46, 0));
      g.add(at(box(0.045, 0.93, d, t, 0.004), w / 2 - 0.0225, 0.46, 0));
      g.add(at(Objects.bowl(M, { r: 0.2 }), 0.5, 0.93, 0.05));
      g.add(at(Objects.vase(M, { h: 0.34, r: 0.1, variant: 0, mat: M.clay }), -0.7, 0.93, -0.1));
      g.add(at(box(0.45, 0.025, 0.3, M.oak, 0.006), -0.15, 0.94, 0.1, 0.15));
      return g;
    },

    // Full-width kitchen wall: base run, tall pantry columns, marble splash,
    // oak shelf. `w` is the wall length.
    kitchenWall(M, { w = 6, h = 3.2, top } = {}) {
      const g = new THREE.Group();
      const t = top || M.marble;
      const tallW = 1.3;
      const runW = w - tallW * 2;
      // Tall pantry / appliance columns.
      [-1, 1].forEach((s) => {
        const x = s * (w / 2 - tallW / 2);
        g.add(at(box(tallW, h, 0.62, M.oak, 0.004), x, h / 2, 0.31));
        g.add(at(box(0.006, h - 0.1, 0.01, M.charcoal, 0, { cast: false }), x, h / 2, 0.621));
      });
      // Base cabinets + worktop + splash.
      g.add(at(box(runW, 0.1, 0.56, M.charcoal), 0, 0.05, 0.28));
      g.add(at(box(runW, 0.78, 0.62, M.oak, 0.004), 0, 0.49, 0.31));
      const doors = Math.round(runW / 0.6);
      for (let i = 1; i < doors; i++) {
        g.add(at(box(0.006, 0.7, 0.01, M.charcoal, 0, { cast: false }), -runW / 2 + (runW / doors) * i, 0.5, 0.621));
      }
      g.add(at(box(runW, 0.04, 0.64, t), 0, 0.9, 0.32));
      g.add(at(box(runW, h - 0.92, 0.03, t), 0, 0.92 + (h - 0.92) / 2, 0.015));
      // Cooktop and floating shelf with ceramics.
      g.add(at(box(0.8, 0.006, 0.5, M.screen), 0.4, 0.923, 0.33));
      g.add(at(box(runW * 0.7, 0.04, 0.26, M.oak, 0.004), -runW * 0.1, 1.55, 0.16));
      for (let i = 0; i < 5; i++) {
        g.add(at(Objects.vase(M, { h: 0.12 + (i % 3) * 0.06, r: 0.05 + (i % 2) * 0.02, variant: i, mat: i % 2 ? M.ceramic : M.clay }), -runW * 0.4 + i * runW * 0.12, 1.57, 0.14));
      }
      g.add(at(Objects.bowl(M, { r: 0.14, mat: M.ceramic }), -runW * 0.3, 0.92, 0.35));
      g.add(at(box(0.36, 0.03, 0.26, M.walnut, 0.005), -runW * 0.18, 0.935, 0.34, -0.2));
      return g;
    },

    // Freestanding stone bath (for villa/bedroom suites).
    fireplace(M, { w = 2.4, h = 0.5 } = {}) {
      const g = new THREE.Group();
      g.add(at(box(w, h, 0.05, M.charcoal, 0, { cast: false }), 0, 0, 0));
      const fire = box(w - 0.3, 0.06, 0.03, M.light, 0, { cast: false, worldUV: false });
      g.add(at(fire, 0, -h / 2 + 0.08, 0.02));
      return g;
    },
  };

  /* ------------------------------------------------------------------------
     Architecture
     ------------------------------------------------------------------------ */

  // A wall of length `len` along local X, height `h`, thickness `t`, with
  // rectangular openings [{ x0, x1, y0, y1 }] measured from the wall's left.
  function wallWithOpenings(len, h, t, openings, material) {
    const g = new THREE.Group();
    const ops = (openings || []).slice().sort((a, b) => a.x0 - b.x0);
    let cursor = 0;
    const add = (x0, x1, y0, y1) => {
      if (x1 - x0 < 1e-3 || y1 - y0 < 1e-3) return;
      g.add(at(box(x1 - x0, y1 - y0, t, material), -len / 2 + (x0 + x1) / 2, (y0 + y1) / 2, 0));
    };
    ops.forEach((o) => {
      add(cursor, o.x0, 0, h);
      add(o.x0, o.x1, 0, o.y0);
      add(o.x0, o.x1, o.y1, h);
      cursor = o.x1;
    });
    add(cursor, len, 0, h);
    return g;
  }

  // Slim bronze window framing (and optional glass) for an opening.
  function windowFrame(M, o, { mullion = 1.2, glass = false, depth = 0.08 } = {}) {
    const g = new THREE.Group();
    const w = o.x1 - o.x0, h = o.y1 - o.y0;
    const cx = (o.x0 + o.x1) / 2, cy = (o.y0 + o.y1) / 2;
    const f = 0.05;
    g.add(at(box(w, f, depth, M.frame), cx, o.y0 + f / 2, 0));
    g.add(at(box(w, f, depth, M.frame), cx, o.y1 - f / 2, 0));
    g.add(at(box(f, h, depth, M.frame), o.x0 + f / 2, cy, 0));
    g.add(at(box(f, h, depth, M.frame), o.x1 - f / 2, cy, 0));
    const n = Math.max(1, Math.round(w / mullion));
    for (let i = 1; i < n; i++) g.add(at(box(0.035, h, depth, M.frame), o.x0 + (w / n) * i, cy, 0));
    if (glass) {
      const pane = mesh(new THREE.PlaneGeometry(w, h), M.glass, { worldUV: false, cast: false });
      g.add(at(pane, cx, cy, 0));
    }
    return g;
  }

  // Room shell centred on the origin: floor at y=0, spans x∈[-w/2,w/2],
  // z∈[-d/2,d/2]. `openings` per side, measured along each wall from the
  // viewer's left when standing inside facing that wall.
  function roomShell(M, { w = 9, d = 7, h = 3.3, t = 0.25, openings = {}, walls = {}, ceiling = true, glass = false, skirting = true, frontWall = false, mullion = 1.2 }) {
    const g = new THREE.Group();
    g.name = 'shell';
    const floor = box(w + t * 2, 0.1, d + t * 2, M.floor, 0, { cast: false });
    g.add(at(floor, 0, -0.05, 0));
    if (ceiling) g.add(at(box(w + t * 2, 0.12, d + t * 2, M.ceiling, 0, { cast: false }), 0, h + 0.06, 0));

    const sides = {
      back: { len: w, pos: [0, 0, -d / 2 - t / 2], ry: 0 },
      left: { len: d, pos: [-w / 2 - t / 2, 0, 0], ry: Math.PI / 2 },
      right: { len: d, pos: [w / 2 + t / 2, 0, 0], ry: -Math.PI / 2 },
      front: { len: w, pos: [0, 0, d / 2 + t / 2], ry: Math.PI },
    };
    Object.entries(sides).forEach(([name, s]) => {
      if (name === 'front' && !frontWall) return;
      const mat = walls[name] || M.wall;
      const wall = wallWithOpenings(s.len + (name === 'back' || name === 'front' ? t * 2 : 0), h, t, (openings[name] || []).map((o) => {
        const pad = name === 'back' || name === 'front' ? t : 0;
        return { x0: o.x0 + pad, x1: o.x1 + pad, y0: o.y0, y1: o.y1 };
      }), mat);
      wall.position.set(...s.pos);
      wall.rotation.y = s.ry;
      wall.name = 'wall-' + name;
      g.add(wall);
      (openings[name] || []).forEach((o) => {
        const frame = windowFrame(M, o, { glass, mullion });
        frame.position.set(...s.pos);
        frame.rotation.y = s.ry;
        // Shift frame so opening coordinates match the wall's local space.
        frame.translateX(-s.len / 2);
        frame.translateZ(-t / 2 + 0.06);
        g.add(frame);
      });
      if (skirting && name !== 'front') {
        // Shadow-gap skirting: a thin dark reveal at the floor line.
        const sk = box(s.len, 0.012, 0.01, M.charcoal, 0, { cast: false });
        sk.position.set(s.pos[0], 0.006, s.pos[2]);
        sk.rotation.y = s.ry;
        sk.translateZ(t / 2 - 0.004);
        g.add(sk);
      }
    });
    return g;
  }

  // Exterior context seen through the glazing: a travertine terrace, lawn,
  // clipped hedges, specimen trees and a soft distant tree line. `water` adds
  // a pool ('pool') or a sea horizon ('sea').
  function exterior(M, { trees = 6, seed = 21, y = -0.06, water = null, near = 7, terrace = 22, realtime = false } = {}) {
    const g = new THREE.Group();
    const r = rng(seed);
    const sea = water === 'sea';
    g.add(at(box(sea ? 60 : 160, 0.1, sea ? 60 : 160, M.lawn, 0, { cast: false }), 0, y - 0.09, 0));
    g.add(at(box(terrace, 0.1, terrace, M.outside, 0, { cast: false }), 0, y - 0.05, 0));
    if (sea) {
      g.add(at(box(600, 0.02, 600, M.water, 0, { cast: false }), 0, y - 1.2, 0));
    }
    if (water === 'pool') {
      g.add(at(box(9, 0.02, 3.2, M.water, 0, { cast: false }), 1.5, y - 0.02, -terrace / 2 + 4.5));
    }
    // Clipped hedge ring at the terrace edge.
    if (!sea) {
      const hedgeGeos = [];
      const half = terrace / 2 + 1.2;
      [[0, -half, terrace + 2.4, 1], [0, half, terrace + 2.4, 1], [-half, 0, 1, terrace + 2.4], [half, 0, 1, terrace + 2.4]].forEach(([x, z, w, d]) => {
        const hgt = 1.3 + r() * 0.3;
        const b = new THREE.RoundedBoxGeometry(w, hgt, d, 2, 0.25);
        b.translate(x, y + hgt / 2 - 0.1, z);
        hedgeGeos.push(b);
      });
      g.add(mesh(THREE.mergeGeometries(hedgeGeos), M.hedge));
      // Distant tree line: a loose ring of tall trees beyond the hedges.
      const count = realtime ? 6 : 16;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * TAU + r() * 0.3;
        const dist = 20 + r() * 12;
        const t = Objects.plant(M, { height: 6 + r() * 4, spread: 2.6 + r() * 1.4, seed: seed + 100 + i, pot: false, leaves: realtime ? 300 : 1600, leafSize: 3.2 });
        g.add(at(t, Math.cos(a) * dist, y, Math.sin(a) * dist));
      }
    }
    for (let i = 0; i < trees; i++) {
      const a = (i / trees) * TAU + r() * 0.6;
      const dist = near + r() * 5;
      const t = Objects.plant(M, { height: 3.2 + r() * 2.8, spread: 1.4 + r() * 0.9, seed: seed + i, pot: false, leaves: realtime ? 800 : 1100, leafSize: realtime ? 2.8 : 2.2 });
      g.add(at(t, Math.cos(a) * dist, y, Math.sin(a) * dist));
    }
    return g;
  }

  /* ------------------------------------------------------------------------
     Camera helper
     A camera spec is { pos, target, fov, shift } where `shift` is a vertical
     lens shift (as a fraction of frame height) — the architectural
     photographer's tilt-shift that keeps verticals perfectly straight.
     ------------------------------------------------------------------------ */

  function applyCamera(camera, spec, width, height) {
    camera.fov = spec.fov || 50;
    camera.aspect = width / height;
    camera.position.set(...spec.pos);
    camera.up.set(0, 1, 0);
    camera.lookAt(new THREE.Vector3(...spec.target));
    if (spec.shift) {
      camera.setViewOffset(width, height, 0, spec.shift * height, width, height);
    } else {
      camera.clearViewOffset();
    }
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }

  /* ------------------------------------------------------------------------
     Room presets
     Each returns { root, cameras, lighting } where lighting describes a
     daylight setup: sun position/intensity and sky colours. Consumers turn
     it into real-time lights or path-tracing environment.
     ------------------------------------------------------------------------ */

  const DAY = { sun: [9, 7, -12], sunColor: '#fff1dc', sunIntensity: 3.2, skyTop: '#c3d3e2', skyBottom: '#f1efe9', envIntensity: 1, exposure: 1 };

  const Rooms = {
    // Signature living room — used by the hero and several stills.
    living(M, o = {}) {
      const W = 9, D = 7.2, H = 3.4;
      const root = new THREE.Group();
      const win = { x0: 3.4, x1: 8.6, y0: 0, y1: H };
      root.add(roomShell(M, {
        w: W, d: D, h: H, glass: !!o.glass, frontWall: !!o.frontWall,
        openings: { back: [win], right: [{ x0: 0.6, x1: 4.2, y0: 0, y1: H }] },
      }));
      if (!o.noExterior) root.add(exterior(M, { trees: o.realtime ? 4 : 8, seed: 31, realtime: o.realtime }));

      // Left wall: oak slat panelling with a large painting.
      root.add(at(Objects.slatWall(M, { w: 5.2, h: H }), -W / 2, 0, -0.4, Math.PI / 2));
      root.add(at(Objects.artwork(M, { w: 1.5, h: 1.1, seed: 4 }), -W / 2 + 0.06, 1.75, -0.2, Math.PI / 2));

      // Seating group.
      root.add(at(Objects.rug(M, { w: 4.2, d: 3.2 }), -1.35, 0, -0.25));
      root.add(at(Objects.sofa(M, { w: 3.0 }), -3.3, 0, -0.3, Math.PI / 2));
      root.add(at(Objects.coffeeTable(M), -1.4, 0, -0.35));
      root.add(at(Objects.loungeChair(M, { mat: M.linen }), 0.4, 0, -1.2, -Math.PI / 2 - 0.35));
      root.add(at(Objects.frameChair(M), 0.45, 0, 0.85, -Math.PI / 2 + 0.3));
      root.add(at(Objects.sideTable(M, { h: 0.45 }), 0.6, 0, -0.2));
      root.add(at(Objects.sculpture(M, { kind: 'pebbles', scale: 0.8 }), -1.55, 0.32, -0.4));
      root.add(at(Objects.books(M, { count: 3, seed: 3 }), -1.05, 0.32, -0.1, 0.4));
      root.add(at(Objects.vase(M, { h: 0.3, r: 0.1, variant: 2, mat: M.ceramicDark }), 0.6, 0.45, -0.2));
      root.add(at(Objects.arcLamp(M, { reach: 1.7 }), -4.1, 0, 1.45, -0.55));

      // Back wall (solid part): sideboard, art and objects.
      root.add(at(Objects.sideboard(M, { w: 2.6 }), -2.6, 0, -D / 2 + 0.24));
      root.add(at(Objects.artwork(M, { w: 1.05, h: 1.35, seed: 5, frame: 'black' }), -2.6, 1.72, -D / 2 + 0.01));
      root.add(at(Objects.vase(M, { h: 0.46, r: 0.12, variant: 0, mat: M.clay }), -3.45, 0.62, -D / 2 + 0.24));
      root.add(at(Objects.bowl(M, { r: 0.16 }), -2.2, 0.62, -D / 2 + 0.24));
      root.add(at(Objects.sculpture(M, { kind: 'ring', scale: 0.9 }), -1.75, 0.62, -D / 2 + 0.24));

      // Greenery framing the glazing, sheer curtains at the window edge.
      root.add(at(Objects.plant(M, { height: 2.1, spread: 0.85, seed: 5, leaves: o.realtime ? 500 : 1400 }), 3.6, 0, -2.7));
      root.add(at(Objects.bigLeafPlant(M, { height: 1.4, seed: 8 }), -4.0, 0, -2.9));
      root.add(at(Objects.curtain(M, { w: 1.3, h: H - 0.05 }), -0.35, 0, -D / 2 + 0.2));
      root.add(at(Objects.curtain(M, { w: 1.0, h: H - 0.05 }), W / 2 - 0.2, 0, 2.95, -Math.PI / 2));

      if (o.lamps !== false) {
        root.add(at(Objects.pendant(M, { drop: 0.9, kind: 'globe', r: 0.22 }), -1.2, H, -0.4));
      }

      return {
        root,
        lighting: Object.assign({}, DAY, { sun: [11, 6.5, -9] }),
        cameras: {
          hero: { pos: [2.9, 1.35, 3.25], target: [-1.6, 1.3, -1.6], fov: 52, shift: 0.1 },
          wide: { pos: [3.6, 1.3, 3.4], target: [-1.2, 1.25, -1.9], fov: 58, shift: 0.1 },
          window: { pos: [-3.2, 1.35, 2.9], target: [2.8, 1.3, -2.4], fov: 55, shift: 0.08 },
          lounge: { pos: [1.9, 1.05, 1.6], target: [-2.2, 0.9, -0.8], fov: 42, shift: 0.06 },
          chair: { pos: [-0.9, 0.95, 0.8], target: [0.45, 0.6, -1.1], fov: 38, shift: 0.02 },
          detail: { pos: [-1.0, 1.1, -1.4], target: [-2.6, 0.9, -D / 2], fov: 40, shift: 0.04 },
        },
      };
    },

    bedroom(M, o = {}) {
      const W = 6.4, D = 6, H = 3.1;
      const root = new THREE.Group();
      root.add(roomShell(M, {
        w: W, d: D, h: H, glass: !!o.glass, frontWall: !!o.frontWall,
        openings: { right: [{ x0: 0.7, x1: 4.9, y0: 0, y1: H }] },
      }));
      if (!o.noExterior) root.add(exterior(M, { trees: o.coastal ? 2 : 6, seed: 41, water: o.coastal ? 'sea' : null }));

      // Headboard wall in oak slats, bed centred on it.
      root.add(at(Objects.slatWall(M, { w: 4.2, h: H }), -0.4, 0, -D / 2));
      root.add(at(Objects.bed(M, { w: 1.9, headMat: M.linen }), -0.4, 0, -D / 2 + 1.25));
      [-1, 1].forEach((s, i) => {
        root.add(at(box(0.5, 0.42, 0.42, M.walnut, 0.01), -0.4 + s * 1.55, 0.21, -D / 2 + 0.35));
        root.add(at(Objects.tableLamp(M, { h: 0.52 }), -0.4 + s * 1.55, 0.42, -D / 2 + 0.35));
        root.add(at(Objects.books(M, { count: 2, seed: 20 + i }), -0.4 + s * 1.55 + 0.1, 0.42, -D / 2 + 0.42));
      });
      root.add(at(Objects.rug(M, { w: 3.2, d: 2.6 }), -0.4, 0, -D / 2 + 1.7));
      root.add(at(box(1.5, 0.42, 0.45, M.leather, 0.04), -0.4, 0.21, -D / 2 + 2.62));
      root.add(at(Objects.loungeChair(M), 2.2, 0, 1.2, -Math.PI / 2 - 0.6));
      root.add(at(Objects.sideTable(M, { h: 0.42, mat: M.travertine }), 2.3, 0, 0.25));
      root.add(at(Objects.plant(M, { height: 1.9, spread: 0.7, seed: 12, leaves: 1100 }), 2.55, 0, -2.4));
      root.add(at(Objects.artwork(M, { w: 0.9, h: 1.2, seed: 7 }), -W / 2 + 0.01, 1.55, 0.8, Math.PI / 2));
      root.add(at(Objects.sideboard(M, { w: 1.6, h: 0.7 }), -W / 2 + 0.25, 0, 0.8, Math.PI / 2));
      root.add(at(Objects.vase(M, { h: 0.34, r: 0.09, variant: 1, mat: M.ceramic }), -W / 2 + 0.25, 0.7, 0.4));
      root.add(at(Objects.curtain(M, { w: 1.2, h: H - 0.05 }), W / 2 - 0.2, 0, -2.6, -Math.PI / 2));
      root.add(at(Objects.curtain(M, { w: 1.2, h: H - 0.05 }), W / 2 - 0.2, 0, 2.2, -Math.PI / 2));

      return {
        root,
        lighting: Object.assign({}, DAY, { sun: [12, 5.5, 2], skyTop: o.coastal ? '#cfe0ea' : DAY.skyTop }),
        cameras: {
          main: { pos: [1.7, 1.3, 2.7], target: [-1.2, 1.2, -2.2], fov: 56, shift: 0.1 },
          side: { pos: [-2.6, 1.25, 2.5], target: [2.2, 1.1, -1.2], fov: 54, shift: 0.08 },
          detail: { pos: [0.9, 0.9, -0.9], target: [-1.95, 0.6, -2.7], fov: 40, shift: 0.04 },
        },
      };
    },

    kitchen(M, o = {}) {
      const W = 8, D = 6.4, H = 3.2;
      const root = new THREE.Group();
      root.add(roomShell(M, {
        w: W, d: D, h: H, glass: !!o.glass, frontWall: !!o.frontWall,
        openings: { right: [{ x0: 0.5, x1: 5.2, y0: 0, y1: H }], left: [{ x0: 4.2, x1: 5.8, y0: 0.9, y1: 2.6 }] },
        walls: o.stoneWalls ? { back: M.stoneWall } : {},
      }));
      if (!o.noExterior) root.add(exterior(M, { trees: 5, seed: 51 }));
      root.add(at(Objects.kitchenWall(M, { w: 6.2, h: H, top: o.darkStone ? M.marbleDark : M.marble }), -0.5, 0, -D / 2));
      root.add(at(Objects.island(M, { top: o.darkStone ? M.marbleDark : M.marble }), -0.5, 0, -0.35));
      [-0.95, -0.2, 0.55].forEach((x) => root.add(at(Objects.stool(M), x - 0.5, 0, 0.55)));
      [-1.4, -0.5, 0.4].forEach((x) => root.add(at(Objects.pendant(M, { drop: 1.3, kind: 'globe', r: 0.14 }), x, H, -0.35)));
      root.add(at(Objects.plant(M, { height: 2.0, spread: 0.75, seed: 22, leaves: 1100 }), 3.3, 0, 2.2));
      root.add(at(Objects.diningTable(M, { w: 1.6, d: 0.85 }), 2.3, 0, -0.2, Math.PI / 2));

      return {
        root,
        lighting: Object.assign({}, DAY, { sun: [12, 6, 4] }),
        cameras: {
          main: { pos: [2.6, 1.4, 2.8], target: [-1.2, 1.3, -2.2], fov: 56, shift: 0.1 },
          front: { pos: [-0.5, 1.35, 3.0], target: [-0.5, 1.3, -2], fov: 58, shift: 0.1 },
          detail: { pos: [0.9, 1.25, 0.9], target: [-1.2, 0.95, -0.5], fov: 40, shift: 0.02 },
        },
      };
    },

    dining(M, o = {}) {
      const W = 7.6, D = 6.4, H = 3.3;
      const root = new THREE.Group();
      root.add(roomShell(M, {
        w: W, d: D, h: H, glass: !!o.glass, frontWall: !!o.frontWall,
        openings: { back: [{ x0: 1.2, x1: 6.8, y0: 0, y1: H }] },
        walls: o.stoneWalls ? { left: M.stoneWall } : {},
      }));
      if (!o.noExterior) root.add(exterior(M, { trees: 6, seed: 61 }));
      root.add(at(Objects.rug(M, { w: 3.6, d: 2.6, mat: M.rug }), 0, 0, -0.6));
      root.add(at(Objects.diningTable(M, { w: 2.6 }), 0, 0, -0.6));
      const chairs = [[-0.8, -1.2, 0], [0, -1.2, 0], [0.8, -1.2, 0], [-0.8, 0.0, Math.PI], [0, 0.0, Math.PI], [0.8, 0.0, Math.PI]];
      chairs.forEach(([x, z, ry]) => root.add(at(Objects.diningChair(M), x, 0, z, ry)));
      root.add(at(Objects.diningChair(M), -1.62, 0, -0.6, Math.PI / 2));
      root.add(at(Objects.diningChair(M), 1.62, 0, -0.6, -Math.PI / 2));
      root.add(at(Objects.linearPendant(M, { len: 2.0, drop: 1.45 }), 0, H, -0.6));
      root.add(at(Objects.vase(M, { h: 0.36, r: 0.11, variant: 1, mat: M.ceramic }), -0.4, 0.77, -0.6));
      root.add(at(Objects.bowl(M, { r: 0.17, mat: M.clay }), 0.45, 0.77, -0.55));
      root.add(at(Objects.sideboard(M, { w: 2.6, h: 0.72 }), -W / 2 + 0.25, 0, -0.6, Math.PI / 2));
      root.add(at(Objects.artwork(M, { w: 1.6, h: 1.1, seed: 6 }), -W / 2 + 0.01, 1.8, -0.6, Math.PI / 2));
      root.add(at(Objects.vase(M, { h: 0.5, r: 0.13, variant: 0, mat: M.clay }), -W / 2 + 0.25, 0.72, -1.5));
      root.add(at(Objects.plant(M, { height: 2.2, spread: 0.85, seed: 32, leaves: 1300 }), 3.1, 0, -2.4));
      root.add(at(Objects.curtain(M, { w: 1.2, h: H - 0.05 }), 0.6, 0, -D / 2 + 0.2));

      return {
        root,
        lighting: Object.assign({}, DAY, { sun: [4, 7, -12] }),
        cameras: {
          main: { pos: [0.6, 1.35, 3.0], target: [-0.2, 1.2, -2], fov: 54, shift: 0.1 },
          angle: { pos: [2.9, 1.4, 2.5], target: [-1.2, 1.2, -1.6], fov: 54, shift: 0.1 },
          pendant: { pos: [1.6, 1.5, 1.3], target: [-0.3, 1.45, -0.9], fov: 40, shift: 0.02 },
        },
      };
    },

    office(M, o = {}) {
      const W = 6.6, D = 5.6, H = 3.2;
      const root = new THREE.Group();
      root.add(roomShell(M, {
        w: W, d: D, h: H, glass: !!o.glass, frontWall: !!o.frontWall, mullion: o.loft ? 0.8 : 1.2,
        openings: { back: [{ x0: 2.4, x1: 6.2, y0: 0, y1: H }] },
        walls: o.loft ? { left: M.concrete } : {},
      }));
      if (!o.noExterior) root.add(exterior(M, { trees: 5, seed: 71 }));
      root.add(at(Objects.bookcase(M, { w: 3.6, h: H - 0.2, cols: 5, rows: 6, seed: 7 }), -W / 2 + 0.2, 0, 0.0, Math.PI / 2));
      root.add(at(Objects.desk(M), 0.9, 0, -1.3));
      root.add(at(Objects.officeChair(M), 0.9, 0, -0.55, Math.PI));
      root.add(at(Objects.rug(M, { w: 3, d: 2.2 }), 0.6, 0, -0.4));
      root.add(at(Objects.frameChair(M, { cushion: M.linen }), -1.2, 0, 1.4, 0.7));
      root.add(at(Objects.arcLamp(M, { reach: 1.1, h: 1.9 }), -2.2, 0, 2.1, -0.9));
      root.add(at(Objects.plant(M, { height: 1.8, spread: 0.7, seed: 42, leaves: 1000 }), 2.8, 0, -2.1));
      root.add(at(Objects.artwork(M, { w: 1.0, h: 1.3, seed: 8, frame: 'black' }), -0.6, 1.6, -D / 2 + 0.01));

      return {
        root,
        lighting: Object.assign({}, DAY, { sun: [6, 6.5, -12] }),
        cameras: {
          main: { pos: [2.4, 1.35, 2.5], target: [-0.8, 1.2, -1.8], fov: 56, shift: 0.1 },
          shelves: { pos: [1.2, 1.4, 1.9], target: [-3.3, 1.4, 0.2], fov: 52, shift: 0.06 },
          desk: { pos: [2.4, 1.3, 0.2], target: [0.4, 0.95, -1.4], fov: 42, shift: 0.03 },
        },
      };
    },

    // Double-height villa living hall with floating stair and fireplace.
    villa(M, o = {}) {
      const W = 12, D = 9, H = 6.4;
      const root = new THREE.Group();
      root.add(roomShell(M, {
        w: W, d: D, h: H, glass: !!o.glass, frontWall: !!o.frontWall, mullion: 1.5,
        openings: { back: [{ x0: 3, x1: 11.6, y0: 0, y1: H - 0.1 }] },
        walls: { left: M.travertine },
      }));
      if (!o.noExterior) root.add(exterior(M, { trees: 8, seed: 81, water: 'pool', near: 9, terrace: 28 }));

      // Floating stair along the left travertine wall.
      for (let i = 0; i < 16; i++) {
        root.add(at(box(1.1, 0.08, 0.3, M.oak, 0.004), -W / 2 + 0.55, 0.2 + i * 0.19, 3.6 - i * 0.29));
      }
      root.add(at(box(0.02, 1, 4.8, M.glassSmoke, 0, { cast: false }), -W / 2 + 1.12, 2.1, 1.3));
      // Fireplace inset into a monolithic stone plinth.
      root.add(at(box(4.2, 0.4, 0.6, M.travertine, 0.005), -2.6, 0.2, -D / 2 + 0.3));
      root.add(at(Objects.fireplace(M, { w: 2.6, h: 0.5 }), -2.6, 0.9, -D / 2 + 0.01));
      root.add(at(Objects.artwork(M, { w: 1.6, h: 2.1, seed: 9 }), -2.6, 2.9, -D / 2 + 0.01));

      root.add(at(Objects.rug(M, { w: 5.2, d: 3.8 }), 0.2, 0, 0.2));
      root.add(at(Objects.sofa(M, { w: 3.4 }), 0.2, 0, 1.6, Math.PI));
      root.add(at(Objects.sofa(M, { w: 2.4, mat: M.linen }), -2.0, 0, 0.1, Math.PI / 2));
      root.add(at(Objects.coffeeTable(M, { kind: 'slab', mat: M.marble }), 0.2, 0, 0.1));
      root.add(at(Objects.loungeChair(M), 2.3, 0, -0.9, -Math.PI / 2 - 0.4));
      root.add(at(Objects.loungeChair(M), 2.5, 0, 0.6, -Math.PI / 2 + 0.2));
      root.add(at(Objects.sculpture(M, { kind: 'sphere', scale: 0.8 }), 0.5, 0.36, 0.1));
      root.add(at(Objects.plant(M, { height: 3.4, spread: 1.3, seed: 52, potR: 0.45, leaves: 1800 }), 4.9, 0, -3.3));
      root.add(at(Objects.plant(M, { height: 2.4, spread: 0.9, seed: 53, leaves: 1200 }), -4.9, 0, -3.5));
      [-0.6, 0.2, 1.0].forEach((x, i) => root.add(at(Objects.pendant(M, { drop: 2.8 + i * 0.35, kind: 'globe', r: 0.2 }), x, H, 0.2)));

      return {
        root,
        lighting: Object.assign({}, DAY, { sun: [14, 9, -10] }),
        cameras: {
          main: { pos: [4.6, 1.5, 4.2], target: [-1.5, 1.8, -2.8], fov: 60, shift: 0.14 },
          stair: { pos: [0.6, 1.5, 3.9], target: [-5.6, 2.0, 0.4], fov: 54, shift: 0.12 },
          window: { pos: [-4.2, 1.5, 3.6], target: [3.2, 2, -4], fov: 58, shift: 0.14 },
        },
      };
    },

    // Neutral photo studio used for material close-ups.
    materialStudio(M, o = {}) {
      const root = new THREE.Group();
      const matKey = o.material || 'oak';
      const sample = {
        wood: M.oak, stone: M.travertine, marble: M.marble, metal: M.bronze, glass: M.glass, fabric: M.boucle,
      }[matKey] || M.oak;
      // Curved plaster cyclorama.
      root.add(at(box(8, 0.1, 8, M.wall, 0, { cast: false }), 0, -0.05, 0));
      root.add(at(box(8, 6, 0.1, M.wall, 0, { cast: false }), 0, 3, -1.2));
      root.add(at(box(0.1, 6, 8, M.wall, 0, { cast: false }), -2.2, 3, 0));
      // Plinth + sample composition.
      root.add(at(box(1.4, 0.5, 0.9, M.stone, 0.004), 0, 0.25, -0.3));
      if (matKey === 'fabric') {
        root.add(at(box(0.62, 0.2, 0.62, M.boucle, 0.09, { segments: 5 }), -0.15, 0.6, -0.35, 0.25));
        root.add(at(box(0.5, 0.16, 0.5, M.linen, 0.075, { segments: 5 }), -0.05, 0.78, -0.35, -0.15));
        root.add(at(box(0.44, 0.44, 0.13, M.leather, 0.06, { segments: 4 }), 0.42, 0.72, -0.5, -0.3));
      } else if (matKey === 'glass') {
        root.add(at(box(0.5, 0.6, 0.03, M.glass, 0.005), -0.2, 0.8, -0.45, 0.3));
        root.add(at(mesh(new THREE.SphereGeometry(0.16, 64, 48), M.glass, { worldUV: false }), 0.32, 0.66, -0.25));
        root.add(at(Objects.vase(M, { h: 0.38, r: 0.1, variant: 2, mat: M.glassSmoke }), -0.45, 0.5, -0.1));
      } else if (matKey === 'metal') {
        root.add(at(box(0.08, 0.8, 0.5, M.bronze, 0.005), -0.25, 0.9, -0.5, 0.2));
        root.add(at(mesh(new THREE.SphereGeometry(0.17, 64, 48), M.brass, { worldUV: false }), 0.25, 0.67, -0.2));
        root.add(at(cyl(0.1, 0.1, 0.36, M.blackSteel, 48), -0.45, 0.68, -0.1));
      } else {
        root.add(at(box(0.9, 0.08, 0.6, sample, 0.004), -0.05, 0.54, -0.35, 0.18));
        root.add(at(box(0.5, 0.7, 0.07, sample, 0.004), -0.25, 0.93, -0.55, 0.1));
        root.add(at(mesh(new THREE.SphereGeometry(0.15, 64, 48), sample, { worldUV: false }), 0.3, 0.73, -0.25));
      }
      root.add(at(Objects.vase(M, { h: 0.3, r: 0.08, variant: 1, mat: M.ceramic }), 0.52, 0.5, -0.55));
      return {
        root,
        lighting: Object.assign({}, DAY, { sun: [6, 5, 4], sunIntensity: 2.4 }),
        cameras: {
          main: { pos: [0.35, 1.05, 2.2], target: [0, 0.7, -0.35], fov: 32 },
        },
      };
    },
  };

  function createRoom(name, M, options) {
    const fn = Rooms[name];
    if (!fn) throw new Error('FormaKit: unknown room ' + name);
    const out = fn(M, options || {});
    out.root.name = name;
    return out;
  }

  // Generate a gradient sky as an equirectangular DataTexture — used both as
  // the real-time environment and as the path tracer's light source.
  function skyTexture(top, bottom, { size = 256, sunDir = null, ground = '#b9b1a4' } = {}) {
    const w = size * 2, h = size;
    const data = new Float32Array(w * h * 4);
    const t = new THREE.Color(top), b = new THREE.Color(bottom), gr = new THREE.Color(ground);
    const sd = sunDir ? new THREE.Vector3(...sunDir).normalize() : null;
    for (let y = 0; y < h; y++) {
      const lat = (0.5 - y / h) * Math.PI;
      for (let x = 0; x < w; x++) {
        const lon = (x / w) * TAU - Math.PI;
        const i = (y * w + x) * 4;
        let c;
        if (lat >= 0) {
          const k = Math.pow(Math.sin(lat), 0.6);
          c = b.clone().lerp(t, k);
        } else {
          c = gr.clone().lerp(b, Math.max(0, 1 + lat * 4));
        }
        let glow = 0;
        if (sd) {
          const dir = new THREE.Vector3(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon));
          glow = Math.pow(Math.max(0, dir.dot(sd)), 64) * 2.5;
        }
        data[i] = c.r + glow;
        data[i + 1] = c.g + glow * 0.92;
        data[i + 2] = c.b + glow * 0.8;
        data[i + 3] = 1;
      }
    }
    const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.FloatType);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.LinearSRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
  }

  // Recursively dispose geometries, materials and textures in a subtree.
  function dispose(object) {
    const seen = new Set();
    object.traverse((o) => {
      if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      mats.forEach((m) => {
        if (seen.has(m)) return;
        seen.add(m);
        Object.values(m).forEach((v) => { if (v && v.isTexture && !seen.has(v)) { seen.add(v); v.dispose(); } });
        m.dispose();
      });
    });
  }

  root.FormaKit = {
    rng,
    createNoise,
    TextureFactory,
    toTexture,
    buildMaterials,
    generateTextureSet,
    TEXTURE_KEYS: Object.keys(TEXTURES),
    // File names (without extension) of every pre-rendered texture.
    TEXTURE_FILES: Object.keys(TEXTURES).reduce((a, k) => a.concat(TEXTURES[k].normal ? [k, k + '-normal'] : [k]), []),
    Objects,
    roomShell,
    exterior,
    createRoom,
    Rooms,
    applyCamera,
    skyTexture,
    dispose,
  };
})(typeof window !== 'undefined' ? window : globalThis);
