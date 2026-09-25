/* ==========================================================================
   FORMA — room-viewer.js
   "Explore Our Spaces": an interactive room viewer.

   Each room is a path-traced still plus a depth map rendered from the same
   camera (tools/render). A tiny raw-WebGL shader turns them into a 2.5D
   space: the pointer moves the camera, and switching rooms plays a
   depth-ordered "camera push" transition — near surfaces of the new room
   resolve first.

   No Three.js dependency, so it also runs on phones. Falls back to a CSS
   crossfade when WebGL is unavailable, motion is reduced, or the page is
   opened from file:// (browsers block local images in WebGL).
   ========================================================================== */
(function () {
  'use strict';

  const FORMA = (window.FORMA = window.FORMA || {});

  const ROOMS = {
    living: {
      name: 'Living',
      project: 'The Oak Residence',
      desc: 'A low, generous living room turned towards the garden. Vertical oak slats warm the long wall while floor-to-ceiling glazing draws the landscape inside.',
      area: '64 m²',
      palette: 'White oak, bouclé, travertine',
      light: 'West-facing garden glazing',
    },
    bedroom: {
      name: 'Bedroom',
      project: 'Private suite, Kochi',
      desc: 'A quiet suite wrapped in timber and linen. The bed faces the morning light; everything else steps back.',
      area: '38 m²',
      palette: 'Oak slats, washed linen, walnut',
      light: 'East morning light, sheer curtains',
    },
    kitchen: {
      name: 'Kitchen',
      project: 'The Oak Residence',
      desc: 'A kitchen built like furniture: full-height oak joinery, a waterfall marble island and a single uninterrupted worktop.',
      area: '46 m²',
      palette: 'Oak, Calacatta marble, bronze',
      light: 'Garden glazing and globe pendants',
    },
    dining: {
      name: 'Dining',
      project: 'Casa Terra',
      desc: 'A table for long evenings — solid oak beneath a linear bronze pendant, framed by a wall of glass onto the garden.',
      area: '42 m²',
      palette: 'Oak, linen, clay ceramics',
      light: 'North garden wall, linear pendant',
    },
    office: {
      name: 'Office',
      project: 'Urban Atelier',
      desc: 'A library-study with a full-height walnut bookcase, a desk that faces the trees and a reading chair for slower hours.',
      area: '30 m²',
      palette: 'Walnut, leather, lime plaster',
      light: 'Diffuse north light',
    },
  };
  const ORDER = Object.keys(ROOMS);

  const VERT = `
    attribute vec2 aPos;
    varying vec2 vUv;
    void main() {
      vUv = aPos * 0.5 + 0.5;
      gl_Position = vec4(aPos, 0.0, 1.0);
    }`;

  const FRAG = `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D uImage0, uDepth0, uImage1, uDepth1;
    uniform float uProgress, uCanvasAspect, uImageAspect;
    uniform vec2 uMouse;

    // object-fit: cover
    vec2 cover(vec2 uv) {
      vec2 s = vec2(1.0);
      if (uCanvasAspect > uImageAspect) s.y = uImageAspect / uCanvasAspect;
      else s.x = uCanvasAspect / uImageAspect;
      return (uv - 0.5) * s + 0.5;
    }

    // Sample an image displaced by its depth; two refinement steps keep
    // edges tidy without a full occlusion search.
    vec4 view(sampler2D img, sampler2D dep, vec2 uv, vec2 offset, float zoom) {
      vec2 c = (cover(uv) - 0.5) / zoom + 0.5;
      float d = texture2D(dep, c).r;
      vec2 p = c + offset * (d - 0.4);
      d = texture2D(dep, p).r;
      p = c + offset * (d - 0.4);
      return texture2D(img, clamp(p, vec2(0.002), vec2(0.998)));
    }

    void main() {
      float e = uProgress * uProgress * (3.0 - 2.0 * uProgress);
      vec2 off = uMouse * vec2(0.03, 0.02);
      vec4 a = view(uImage0, uDepth0, vUv, off * (1.0 + e * 2.5), 1.03 + e * 0.14);
      vec4 b = view(uImage1, uDepth1, vUv, off * (1.0 + (1.0 - e) * 2.5), 1.03 + (1.0 - e) * 0.08);
      float dn = texture2D(uDepth1, cover(vUv)).r;
      float m = smoothstep(0.0, 1.0, clamp(e * 1.7 - (1.0 - dn) * 0.7, 0.0, 1.0));
      vec4 col = mix(a, b, m);
      // Gentle vignette, like a lens.
      vec2 q = vUv - 0.5;
      col.rgb *= 1.0 - dot(q, q) * 0.35;
      gl_FragColor = col;
    }`;

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load ' + src));
      img.src = src;
    });
  }

  class DepthRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      const gl = (this.gl = canvas.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: false }));
      if (!gl) throw new Error('WebGL unavailable');
      const prog = (this.program = gl.createProgram());
      [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, FRAG]].forEach(([type, src]) => {
        const sh = gl.createShader(type);
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
        gl.attachShader(prog, sh);
      });
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);

      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'aPos');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

      this.u = {};
      ['uImage0', 'uDepth0', 'uImage1', 'uDepth1', 'uProgress', 'uCanvasAspect', 'uImageAspect', 'uMouse']
        .forEach((n) => (this.u[n] = gl.getUniformLocation(prog, n)));
      gl.uniform1i(this.u.uImage0, 0);
      gl.uniform1i(this.u.uDepth0, 1);
      gl.uniform1i(this.u.uImage1, 2);
      gl.uniform1i(this.u.uDepth1, 3);
      this.textures = new Map();
    }

    texture(img) {
      if (this.textures.has(img)) return this.textures.get(img);
      const gl = this.gl;
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.textures.set(img, tex);
      return tex;
    }

    bind(unit, img) {
      const gl = this.gl;
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, this.texture(img));
    }

    draw(from, to, progress, mouse) {
      const gl = this.gl;
      const w = this.canvas.width, h = this.canvas.height;
      gl.viewport(0, 0, w, h);
      this.bind(0, from.image);
      this.bind(1, from.depth);
      this.bind(2, to.image);
      this.bind(3, to.depth);
      gl.uniform1f(this.u.uProgress, progress);
      gl.uniform1f(this.u.uCanvasAspect, w / h);
      gl.uniform1f(this.u.uImageAspect, from.image.naturalWidth / from.image.naturalHeight);
      gl.uniform2f(this.u.uMouse, mouse.x, mouse.y);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    dispose() {
      const gl = this.gl;
      this.textures.forEach((t) => gl.deleteTexture(t));
      this.textures.clear();
      gl.deleteProgram(this.program);
    }
  }

  const RoomViewer = {
    init(root, env) {
      if (!root) return null;
      const viewer = Object.create(RoomViewer.prototype);
      viewer.setup(root, env || {});
      return viewer;
    },
    prototype: {
      setup(root, env) {
        this.root = root;
        this.env = env;
        this.tabs = Array.from(root.querySelectorAll('[role="tab"]'));
        this.panel = root.querySelector('[data-viewer-panel]');
        this.frame = root.querySelector('[data-viewer-frame]');
        this.canvas = root.querySelector('[data-viewer-canvas]');
        this.fallback = Array.from(root.querySelectorAll('[data-fallback-room]'));
        this.current = 'living';
        this.pointer = { x: 0, y: 0 };
        this.mouse = { x: 0, y: 0 };
        this.cache = new Map();
        this.progress = 1;
        this.visible = false;
        this.frameId = 0;

        this.tabs.forEach((tab) => {
          tab.addEventListener('click', () => this.select(tab.dataset.room, true));
          tab.addEventListener('keydown', (e) => this.onTabKey(e, tab));
        });

        const useWebGL = env.webgl && !env.reducedMotion && location.protocol !== 'file:';
        if (useWebGL) this.initWebGL();
      },

      onTabKey(e, tab) {
        const i = this.tabs.indexOf(tab);
        let next = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % this.tabs.length;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + this.tabs.length) % this.tabs.length;
        if (e.key === 'Home') next = 0;
        if (e.key === 'End') next = this.tabs.length - 1;
        if (next === null) return;
        e.preventDefault();
        this.tabs[next].focus();
        this.select(this.tabs[next].dataset.room, true);
      },

      initWebGL() {
        try {
          this.renderer = new DepthRenderer(this.canvas);
        } catch (err) {
          console.warn('[FORMA] room viewer: WebGL fallback', err);
          return;
        }
        this.onPointerMove = (e) => {
          const r = this.frame.getBoundingClientRect();
          this.pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
          this.pointer.y = -(((e.clientY - r.top) / r.height) * 2 - 1);
          this.pointerActive = true;
        };
        this.frame.addEventListener('pointermove', this.onPointerMove);
        this.frame.addEventListener('pointerleave', () => { this.pointerActive = false; });

        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(this.frame);
        this.io = new IntersectionObserver((entries) => {
          this.visible = entries[0].isIntersecting;
          if (this.visible) {
            this.ensureLoaded(this.current).then(() => this.loop()).catch(() => {});
            // Warm the cache with the other rooms once the viewer is near.
            ORDER.forEach((r) => this.ensureLoaded(r).catch(() => {}));
          }
        }, { rootMargin: '200px' });
        this.io.observe(this.frame);
        document.addEventListener('visibilitychange', () => { if (!document.hidden) this.loop(); });
      },

      resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.round(this.frame.clientWidth * dpr);
        const h = Math.round(this.frame.clientHeight * dpr);
        if (w && h && (this.canvas.width !== w || this.canvas.height !== h)) {
          this.canvas.width = w;
          this.canvas.height = h;
        }
      },

      ensureLoaded(room) {
        if (this.cache.has(room)) return this.cache.get(room);
        const size = this.frame.clientWidth * (window.devicePixelRatio || 1) > 900 ? 1600 : 800;
        const base = 'assets/images/room-' + room;
        const image = loadImage(`${base}-${size}.webp`).catch(() => loadImage(`${base}-${size}.jpg`));
        const promise = Promise.all([image, loadImage(base + '-depth.png')]).then(([img, depth]) => ({ image: img, depth }));
        this.cache.set(room, promise);
        promise.catch(() => this.cache.delete(room));
        return promise;
      },

      loop() {
        if (!this.renderer || this.frameId) return;
        const step = (time) => {
          this.frameId = 0;
          if (!this.visible || document.hidden) return;
          // Idle drift keeps the space alive; the pointer takes over on hover.
          const tx = this.pointerActive ? this.pointer.x : Math.sin(time * 0.00025) * 0.45;
          const ty = this.pointerActive ? this.pointer.y : Math.cos(time * 0.0002) * 0.25;
          this.mouse.x += (tx - this.mouse.x) * 0.06;
          this.mouse.y += (ty - this.mouse.y) * 0.06;
          if (this.transition) {
            this.progress = Math.min(1, (time - this.transition.start) / this.transition.duration);
            if (this.progress >= 1) {
              this.from = this.to;
              this.transition = null;
            }
          }
          if (this.from) {
            this.renderer.draw(this.from, this.transition ? this.to : this.from, this.transition ? this.progress : 0, this.mouse);
            if (!this.frame.classList.contains('is-webgl')) this.frame.classList.add('is-webgl');
          } else {
            this.ensureLoaded(this.current).then((data) => { if (!this.from) this.from = data; }).catch(() => {});
          }
          this.frameId = requestAnimationFrame(step);
        };
        this.frameId = requestAnimationFrame(step);
      },

      select(room, userInitiated) {
        if (!ROOMS[room] || room === this.current) return;
        const previous = this.current;
        this.current = room;
        const index = ORDER.indexOf(room);

        this.tabs.forEach((t) => {
          const on = t.dataset.room === room;
          t.setAttribute('aria-selected', on ? 'true' : 'false');
          t.tabIndex = on ? 0 : -1;
        });
        this.panel.setAttribute('aria-labelledby', 'tab-' + room);
        this.updatePanel(ROOMS[room], index);
        this.fallback.forEach((img) => img.classList.toggle('is-active', img.dataset.fallbackRoom === room));

        if (this.renderer) {
          this.ensureLoaded(room).then((data) => {
            if (this.current !== room) return;
            if (!this.from) { this.from = data; return; }
            this.to = data;
            this.progress = 0;
            this.transition = { start: performance.now(), duration: 1500 };
            this.loop();
          }).catch(() => {
            // Image failed: keep the CSS fallback visible for this room.
            this.frame.classList.remove('is-webgl');
          });
        }
        if (userInitiated && FORMA.Animations && FORMA.Animations.pulse) FORMA.Animations.pulse(this.frame, previous);
      },

      updatePanel(data, index) {
        const p = this.panel;
        p.classList.add('is-changing');
        window.setTimeout(() => {
          p.querySelector('[data-room-index]').textContent = String(index + 1).padStart(2, '0');
          p.querySelector('[data-room-name]').textContent = data.name;
          p.querySelector('[data-room-project]').textContent = data.project;
          p.querySelector('[data-room-desc]').textContent = data.desc;
          p.querySelector('[data-room-area]').textContent = data.area;
          p.querySelector('[data-room-palette]').textContent = data.palette;
          p.querySelector('[data-room-light]').textContent = data.light;
          p.classList.remove('is-changing');
        }, this.env.reducedMotion ? 0 : 320);
      },
    },
  };

  FORMA.RoomViewer = RoomViewer;
})();
