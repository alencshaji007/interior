# Wellfit Designs — Interior Design & Fit-Out, Dubai

The website for **Wellfit Designs** (WELL FIT SPACE DECORATION DESIGN & IMPLEMENTATION L.L.C.): *Designs that fit your vision.*

It is a six-page static site: Home, About Us, Services, Projects, Our Process and Contact. The home page opens on a full-bleed interior photo with a slow push-in, and small real-time Three.js ornaments accent Home and About. The site also uses GSAP scroll choreography, tabbed room photos on the Services page, a project dialog, an enquiry form and a custom cursor.

Every still is a photorealistic image generated with FLUX.1 Krea [dev]; see *Imagery*.

No framework, no backend and no build step are needed to run it.

## Running locally

Any static server works:

```bash
npx http-server . -p 8080
# or
python3 -m http.server 8080
```

Then open <http://localhost:8080>.

Opening `index.html` directly from disk (`file://`) also works. Browsers block local images from WebGL, so in that case the ornaments build their textures procedurally in the browser instead of loading `assets/textures`.

Add `?no3d` to any URL to turn the 3D ornaments off (useful on slow GPUs or when testing).

## Content and brand

- **Copy** comes from *Wellfit Designs – Final Website Content*, which describes the six-page structure. Editor notes in that document are not published, for example the reminder to verify project photographs and the bracketed placeholders.
- **Design**: colours and type follow the Wellfit Designs home-page design.
  - Colours: sand `#EAE6DB` and panel `#F6F3EA` backgrounds, ink `#14181F`, primary blue `#1B4F7C`, accent orange `#D9622B` (with `#B8481A` for small text on sand and `#F4A26B` on dark backgrounds).
  - Type: DM Serif Display for headings and Jost for text.
  - Shapes: pill buttons, 24px cards and arched image frames.
- **Logo**: the manta-ray mark and "WELLFIT DESIGNS" wordmark, cut from the supplied logo onto a transparent background.
  - `logo-mark`, `logo-wordmark` and `logo-wordmark-light` for the header and footer.
  - `logo` (full lockup) for the loader and structured data.
  - `favicon-*` and `apple-touch-icon`.

## Structure

```
index.html              Home: hero, quick facts, intro, services, who we serve, why Wellfit, featured projects, process, CTA
about.html              Who we are, story, mission & vision, values, strength
services.html           Eight services in detail + tabbed room photos
projects.html           Commercial and residential portfolio
process.html            Six-stage process + FAQ
contact.html            Contact details + enquiry form
css/style.css           Design tokens, layout, components, breakpoints, reduced motion
js/main.js              Boot, capability detection, nav, cursor, card tilt, dialog, form
js/animations.js        GSAP + ScrollTrigger: loader, reveals, pinned hero, horizontal services, timelines
js/three-scene.js       Floating 3D ornaments (loaded on demand)
js/room-kit.js          Procedural interior kit shared by the site and the renderer
js/room-viewer.js       Tabbed room photos on the services page
assets/images/          Photorealistic stills (WebP + JPEG), logo
assets/textures/        Pre-generated material textures and normal maps
assets/fonts/           DM Serif Display + Jost (local WOFF2)
assets/vendor/          three.bundle.min.js, gsap.min.js, ScrollTrigger.min.js
tools/render/           Offline tooling: vendor bundle, textures, Cycles renders, tests
tools/photoreal/        Photorealistic stills: prompts, generation, retouching, publishing
```

Pages share the same header, mobile menu and footer markup. When you change one of them, change it in all six files.

### How the 3D fits together

- **`room-kit.js`** is the core.
  - It provides procedural textures (oak planks, Calacatta marble, travertine, limewash, bouclé, linen…), a PBR material library and furniture builders.
  - It has five furnished room presets (`living`, `bedroom`, `kitchen`, `dining`, `office`), plus a double-height `villa` and a `materialStudio`.
  - Five commercial presets rendered the earlier project visualisations: `workspace`, `lounge`, `reception`, `meeting` and `studio`. They use high-floor city views (`cityscape`) and furniture such as bench desks, task chairs, banquettes, glass partitions, acoustic panels and a photo backdrop.
  - It is a classic script, so it runs from `file://`.
- **`three-scene.js`** draws the small floating ornaments (an architectural wireframe, material spheres, stone and oak blocks) with the kit's materials. Rendering pauses when they are off screen or the tab is hidden.
- **`main.js`** loads Three.js and the 3D modules only on capable devices, and only on pages with ornaments (Home and About). Capable means:
  - WebGL support, a width of at least 768px, no reduced-motion preference and no data saver.
  - At least 4 GB of device memory, where the browser reports it.

  Everyone else simply goes without the ornaments.

## Imagery

Every still on the site is a photorealistic image generated with FLUX.1 Krea [dev] (see *Photorealistic stills* below). They are design visualisations, not photographs of completed projects. The Blender pipeline that rendered the earlier path-traced versions (see *Regenerating the visualisations*) is kept for reference only, so `tools/render/jobs.mjs` is empty. `og-image-1200.jpg` is the hero image composed with the logo; `photoreal.py publish` rebuilds it whenever it publishes the hero.

Each project close-up (`project-*-detail`) is a square crop of its main photo (`photoreal.py crop`, boxes in `DETAIL_CROPS`), so the pair always shows the same space.

When approved project photography is available, it can replace these images.

Each image exists as `assets/images/<name>-<width>.{webp,jpg}`, usually in two widths. To replace one, keep the name and aspect ratio:

| Aspect | Images |
| --- | --- |
| 16:9 | `hero-living` (960/1920), `cta-dusk` (800/1600), `about-band` (1000/1920) |
| 16:10 | `room-*`, `project-avery`, `project-sanchez` (800/1600) |
| 4:5 | commercial `project-*`, `service-*`, `project-atelier`, `intro-dining`, `about-lounge`, `svc-*`, `services-hero`, `process-hero` (600/1000) |
| 1:1 | `project-*-detail` (700), `serve-*` (600/900), `material-stone` (600/1100) |
| 1200×630 | `og-image-1200.jpg` |

## Regenerating the visualisations (optional)

The site no longer uses any path-traced still; this pipeline is kept for reference. It renders stills with Blender's Cycles from the exact scenes in `room-kit.js`:

```bash
cd tools/render
npm install
pip install bpy                        # Blender as a Python module (Python 3.11)
npm run textures                       # assets/textures/*.webp
npm run render -- --python "$(which python)"            # all stills
npm run render -- --python "$(which python)" service-   # stills whose name matches
node pipeline.mjs --preview room-living --python "$(which python)"   # quick low-res preview
```

`jobs.mjs` lists the images to render (currently none): which room, camera, palette and lighting each uses. The commercial scenes use a few offline-only textures (herringbone oak, carpet tiles, tower facades for the city views); they live in `EXTRA_TEXTURES`, so the live site never generates or requests them.

The pipeline was last run with `bpy` 5.0 on Python 3.11. `--samples 24 --preview` gives a quick low-resolution check before a full render.

`npm run build:vendor` rebuilds `assets/vendor/three.bundle.min.js`. It bundles Three.js r186 with RoundedBoxGeometry, BufferGeometryUtils and the GTAO post-processing passes, as a classic script exposing `window.THREE`.

## Photorealistic stills (Hugging Face)

`tools/photoreal/photoreal.py` replaces the rendered stills with photorealistic images generated by [FLUX.1 Krea [dev]](https://huggingface.co/black-forest-labs/FLUX.1-Krea-dev) on a Hugging Face Space. The model card allows commercial use of its outputs. It covers every still on the site, including the home hero (`hero-living`) and the room photos (`room-*`). Each job's prompt describes what the image's alt text says, so the alt text stays accurate.

```bash
cd tools/photoreal
pip install -r requirements.txt
export HF_TOKEN=...                                  # a Hugging Face token; generation uses its Spaces GPU quota
python photoreal.py generate                         # every job; skips ones already generated
python photoreal.py generate --only cta-dusk --variants 3
python photoreal.py sheet                            # out/sheet.jpg to review the picked images
python photoreal.py publish --pick cta-dusk=2        # writes assets/images/<name>-<width>.{jpg,webp}
python photoreal.py crop                             # project close-ups cut from their main photos
python photoreal.py retouch serve-offices --box 298,552,362,584   # paint out stray lettering (--dark, --patch, --rows, --clone DX,DY)
```

It needs network access to `huggingface.co` and `*.hf.space`. `publish` writes the same file names and pixel sizes the pages already use, so no HTML changes are needed. Running the Blender pipeline for the same names would overwrite these images, which is why `jobs.mjs` is empty.

## Testing

With a local server running on port 8080:

```bash
cd tools/render
npm run check:ui     # functional checks on all six pages (nav, dialog, tabs, FAQ, form, mobile menu)
npm run check        # loads every page at 1440/1024/768/390px; reports console errors and overflow
node check-hero.mjs http://127.0.0.1:8080/index.html out   # hero photo and 3D ornaments
node check-viewer.mjs http://127.0.0.1:8080/ out           # room photo tabs
```

All four exit with a non-zero status on failure.

## Before launch

- **Enquiry form**: it validates and shows a confirmation, but there is no backend, so enquiries are not sent anywhere yet. Connect it to a form service or endpoint.
- **Project photographs**: the content document asks for approved project photographs and verified descriptions before publication. The project images are currently AI-generated visualisations; swap in approved photography when available.
- **Domain**: canonical and Open Graph URLs assume `https://www.wellfitdesigns.com/`.

## Accessibility & performance

- Semantic landmarks, one `h1` per page, ordered headings, alt text, labelled form fields, visible focus states and a skip link.
- Animated headings keep their real text for screen readers.
- Keyboard support:
  - Arrow keys work on the room tabs.
  - Escape closes the menu and the dialog.
  - Focus is managed in the mobile menu and the project dialog.
  - FAQ answers use native `<details>`.
- `prefers-reduced-motion`: no pinned or scrubbed scrolling, no slow zooms, no 3D, and content is shown immediately.
- Images:
  - They are lazy-loaded with responsive `srcset` (WebP with JPEG fallback).
  - Width and height are set to prevent layout shift.
  - The hero image is preloaded.
- WebGL ornaments:
  - They render only while visible, using `requestAnimationFrame` through `setAnimationLoop`.
  - They cap the pixel ratio and free their resources on page hide.

## Credits & licences

- [Three.js](https://threejs.org) (MIT) and [GSAP](https://gsap.com) with ScrollTrigger (GSAP standard licence, free for this use).
- Fonts: [DM Serif Display](https://github.com/googlefonts/dm-fonts) and [Jost](https://github.com/indestructible-type/Jost), both under the SIL Open Font License.
- The logo belongs to Wellfit Designs. Textures and the 3D ornaments were generated procedurally for this project.
- Photorealistic stills were generated with [FLUX.1 Krea [dev]](https://huggingface.co/black-forest-labs/FLUX.1-Krea-dev); its model card permits commercial use of generated outputs.
