# FORMA — Luxury Interior Design

A static website for **FORMA**, a fictional interior architecture studio: *Spaces Designed Around You.*

It's a single editorial page with a real-time Three.js living room in the hero, a depth-parallax room viewer, GSAP scroll choreography and a custom cursor. All interior imagery is **path-traced from the same procedural 3D rooms** the hero renders live, so the 3D and the photography match.

No framework, no backend and no build step are needed to run it.

## Running locally

Any static server works:

```bash
npx http-server . -p 8080
# or
python3 -m http.server 8080
```

Then open <http://localhost:8080>.

Opening `index.html` directly from disk (`file://`) also works. Browsers block local images from WebGL, so in that case the site:

- builds the hero's textures procedurally in the browser instead of loading `assets/textures`
- shows the room viewer as crossfading stills instead of depth parallax

For the full experience, use a server.

Add `?no3d` to the URL to force the still-image experience (useful on slow GPUs or when testing).

## Structure

```
index.html              Semantic single-page markup, SEO + Open Graph
css/style.css           Design tokens, layout, components, breakpoints, reduced motion
js/main.js              Boot, capability detection, nav, cursor, dialog, carousel, form
js/animations.js        GSAP + ScrollTrigger: loader, reveals, pinned hero, horizontal services
js/three-scene.js       Real-time hero room + floating 3D ornaments (loaded on demand)
js/room-kit.js          Procedural interior kit shared by the site and the renderer
js/room-viewer.js       Raw-WebGL depth-parallax room viewer (no Three.js needed)
assets/images/          Path-traced stills (WebP + JPEG, two sizes each) + depth maps
assets/textures/        Pre-generated material textures and normal maps
assets/fonts/           Cormorant Garamond + Manrope (local WOFF2)
assets/vendor/          three.bundle.min.js, gsap.min.js, ScrollTrigger.min.js
assets/models/          Reserved for GLB/GLTF models (the rooms are procedural)
assets/videos/          Reserved for video content
tools/render/           Offline tooling: vendor bundle, textures, Cycles renders, smoke test
```

### How the 3D fits together

- **`room-kit.js`** is the core: procedural textures (oak planks, Calacatta marble, travertine, limewash, bouclé, linen…), a PBR material library, furniture builders and five furnished room presets (`living`, `bedroom`, `kitchen`, `dining`, `office`), plus a double-height `villa` and a `materialStudio`. It is a classic script, so it runs from `file://`.
- **`three-scene.js`** builds the `living` preset in real time: sun with soft shadows, sky-based image lighting, AgX tone mapping, ambient occlusion on large screens, a scroll-driven camera path, mouse parallax, and subtle movement in the plants, sheers and pendant. Rendering pauses when the hero is off screen or the tab is hidden.
- **`main.js`** loads Three.js and the 3D modules only on capable devices: WebGL, width ≥ 768px, no reduced motion, no data saver, and at least 4 GB of device memory where the browser reports it. Everyone else gets the path-traced poster of the same room.

## Replacing the imagery

Every `<picture>` in `index.html` has a comment naming its files. Each image exists as:

```
assets/images/<name>-<small>.{webp,jpg}   e.g. project-oak-800.webp
assets/images/<name>-<large>.{webp,jpg}   e.g. project-oak-1600.webp
```

To use real photography, replace the files and keep the names and aspect ratios:

| Aspect | Images |
| --- | --- |
| 16:9 | `hero-living` (960/1920), `cta-dusk` (800/1600) |
| 16:10 | `room-*`, `project-oak`, `project-glass`, `project-coastal` (800/1600) |
| 4:5 | `intro-stair`, `about-studio`, `service-*`, `project-terra`, `project-atelier`, `project-stone` (600/1000) |
| 1:1 | `material-*` (600/1100) |
| 1200×630 | `og-image-1200.jpg` |

The room viewer also reads `room-<name>-depth.png`, a grayscale depth map where near is white and far is black. If you replace a room photo, either supply a matching depth map or delete `room-<name>-depth.png`. The viewer then falls back to a plain crossfade.

## Regenerating the imagery (optional)

The stills are rendered with Blender's Cycles from the exact scenes in `room-kit.js`:

```bash
cd tools/render
npm install
pip install bpy                        # Blender as a Python module (Python 3.11)
npm run textures                       # assets/textures/*.webp
npm run render -- --python "$(which python)"            # all stills
npm run render -- --python "$(which python)" project-   # stills whose name matches
node pipeline.mjs --preview room-living --python "$(which python)"   # quick low-res preview
```

`jobs.mjs` lists every image: which room, camera, palette and lighting it uses. The pipeline:

1. Headless Chromium builds each room with `room-kit.js`, exports it as GLB and rasterises a depth map.
2. `cycles_render.py` renders it in Cycles with the sun, sky, AgX view transform and OpenImageDenoise, then writes WebP and JPEG sizes.

`npm run build:vendor` rebuilds `assets/vendor/three.bundle.min.js`: Three.js r186 plus RoundedBoxGeometry, BufferGeometryUtils and the GTAO post-processing passes, as a classic script exposing `window.THREE`.

`npm run check` runs a Playwright smoke test against a local server at several widths and reports console errors.

## Accessibility & performance

- Semantic landmarks, one `h1`, ordered headings, alt text, labelled form fields, visible focus states and a skip link.
- Keyboard support: arrow keys work on the room tabs and the testimonial carousel, Escape closes the menu and dialog, and focus is managed in the mobile menu and project dialog.
- `prefers-reduced-motion`: no pinned or scrubbed scrolling, no 3D hero, no autoplay, and content is shown immediately.
- Images are lazy-loaded with responsive `srcset` (WebP with JPEG fallback), width and height are set to prevent layout shift, and the hero poster is preloaded.
- WebGL scenes render only while visible, use `requestAnimationFrame` through `setAnimationLoop`, cap the pixel ratio, and free their resources on page hide.

## Credits & licences

- [Three.js](https://threejs.org) (MIT) and [GSAP](https://gsap.com) with ScrollTrigger (GSAP standard licence, free for this use).
- Fonts: [Cormorant Garamond](https://github.com/CatharsisFonts/Cormorant) and [Manrope](https://github.com/sharanda/manrope), both under the SIL Open Font License, via Fontsource.
- All imagery, textures and 3D content are original and generated procedurally for this project.

FORMA, its projects, clients and testimonials are fictional.
