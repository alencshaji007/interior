# Wellfit Designs — Interior Design & Fit-Out, Dubai

The website for **Wellfit Designs** (WELL FIT SPACE DECORATION DESIGN & IMPLEMENTATION L.L.C.): *Designs that fit your vision.*

It is a six-page static site: Home, About Us, Services, Projects, Our Process and Contact. The home page has a real-time Three.js living room in the hero. The site also uses GSAP scroll choreography, a depth-parallax design-visualisation viewer on the Services page, a project dialog, an enquiry form and a custom cursor.

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

Add `?no3d` to any URL to force the still-image experience (useful on slow GPUs or when testing).

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
services.html           Eight services in detail + design-visualisation room viewer
projects.html           Commercial and residential portfolio
process.html            Six-stage process + FAQ
contact.html            Contact details + enquiry form
css/style.css           Design tokens, layout, components, breakpoints, reduced motion
js/main.js              Boot, capability detection, nav, cursor, card tilt, dialog, form
js/animations.js        GSAP + ScrollTrigger: loader, reveals, pinned hero, horizontal services, timelines
js/three-scene.js       Real-time hero room + floating 3D ornaments (loaded on demand)
js/room-kit.js          Procedural interior kit shared by the site and the renderer
js/room-viewer.js       Raw-WebGL depth-parallax room viewer (no Three.js needed)
assets/images/          Project photography, path-traced stills (WebP + JPEG), depth maps, logo
assets/textures/        Pre-generated material textures and normal maps
assets/fonts/           DM Serif Display + Jost (local WOFF2)
assets/vendor/          three.bundle.min.js, gsap.min.js, ScrollTrigger.min.js
tools/render/           Offline tooling: vendor bundle, textures, Cycles renders, tests
```

Pages share the same header, mobile menu and footer markup. When you change one of them, change it in all six files.

### How the 3D fits together

- **`room-kit.js`** is the core.
  - It provides procedural textures (oak planks, Calacatta marble, travertine, limewash, bouclé, linen…), a PBR material library and furniture builders.
  - It has five furnished room presets (`living`, `bedroom`, `kitchen`, `dining`, `office`), plus a double-height `villa` and a `materialStudio`.
  - It is a classic script, so it runs from `file://`.
- **`three-scene.js`** builds the `living` preset in real time.
  - Lighting: sun with soft shadows, sky-based image lighting, AgX tone mapping, and ambient occlusion on large screens.
  - Motion: a scroll-driven camera path, mouse parallax, and subtle movement in the plants, sheers and pendant.
  - Rendering pauses when the hero is off screen or the tab is hidden.
- **`main.js`** loads Three.js and the 3D modules only on capable devices, and only on pages that use them (the home hero, or the ornaments on Home and About). Capable means:
  - WebGL support, a width of at least 768px, no reduced-motion preference and no data saver.
  - At least 4 GB of device memory, where the browser reports it.

  Everyone else gets the path-traced poster of the same room.

## Imagery

| Images | Source |
| --- | --- |
| `project-*` (except `project-atelier`), `intro-office`, `svc-design`, `svc-commercial`, `services-hero`, `process-hero`, `serve-*`, `about-band` | Photographs from the Wellfit Designs company profile |
| `hero-living`, `room-*`, `service-*`, `project-atelier`, `material-stone`, `cta-dusk` | Path-traced design visualisations (see below) |
| `og-image-1200.jpg` | The hero poster composed with the logo |

Each image exists as `assets/images/<name>-<width>.{webp,jpg}`, usually in two widths. To replace one, keep the name and aspect ratio:

| Aspect | Images |
| --- | --- |
| 16:9 | `hero-living` (960/1920), `cta-dusk` (800/1600), `about-band` (1000/1920) |
| 16:10 | `room-*` (800/1600), `project-avery` (800/1360), `project-sanchez` (800/1460) |
| 4:5 | commercial `project-*` (600/1100), `service-*`, `project-atelier` (600/1000), `intro-office`, `svc-*`, `services-hero`, `process-hero` |
| 1:1 | `project-*-detail`, `serve-*`, `material-stone` |
| 1200×630 | `og-image-1200.jpg` |

The room viewer also reads `room-<name>-depth.png`, a grayscale depth map where near is white and far is black. If you replace a room image, either supply a matching depth map or delete `room-<name>-depth.png`. The viewer then falls back to a plain crossfade.

## Regenerating the visualisations (optional)

The path-traced stills are rendered with Blender's Cycles from the exact scenes in `room-kit.js`:

```bash
cd tools/render
npm install
pip install bpy                        # Blender as a Python module (Python 3.11)
npm run textures                       # assets/textures/*.webp
npm run render -- --python "$(which python)"            # all stills
npm run render -- --python "$(which python)" service-   # stills whose name matches
node pipeline.mjs --preview room-living --python "$(which python)"   # quick low-res preview
```

`jobs.mjs` lists every rendered image: which room, camera, palette and lighting it uses.

`npm run build:vendor` rebuilds `assets/vendor/three.bundle.min.js`. It bundles Three.js r186 with RoundedBoxGeometry, BufferGeometryUtils and the GTAO post-processing passes, as a classic script exposing `window.THREE`.

## Testing

With a local server running on port 8080:

```bash
cd tools/render
npm run check:ui     # functional checks on all six pages (nav, dialog, tabs, FAQ, form, mobile menu)
npm run check        # loads every page at 1440/1024/768/390px; reports console errors and overflow
node check-hero.mjs http://127.0.0.1:8080/index.html out   # live 3D hero
node check-viewer.mjs http://127.0.0.1:8080/ out           # WebGL room viewer
```

All four exit with a non-zero status on failure.

## Before launch

- **Enquiry form**: it validates and shows a confirmation, but there is no backend, so enquiries are not sent anywhere yet. Connect it to a form service or endpoint.
- **Project photographs**: the content document asks for approved project photographs and verified descriptions before publication. The project images come from the company profile; confirm each one against the completed scope.
- **Domain**: canonical and Open Graph URLs assume `https://www.wellfitdesigns.com/`.

## Accessibility & performance

- Semantic landmarks, one `h1` per page, ordered headings, alt text, labelled form fields, visible focus states and a skip link.
- Animated headings keep their real text for screen readers.
- Keyboard support:
  - Arrow keys work on the room tabs.
  - Escape closes the menu and the dialog.
  - Focus is managed in the mobile menu and the project dialog.
  - FAQ answers use native `<details>`.
- `prefers-reduced-motion`: no pinned or scrubbed scrolling, no 3D, and content is shown immediately.
- Images:
  - They are lazy-loaded with responsive `srcset` (WebP with JPEG fallback).
  - Width and height are set to prevent layout shift.
  - The hero poster is preloaded.
- WebGL scenes:
  - They render only while visible, using `requestAnimationFrame` through `setAnimationLoop`.
  - They cap the pixel ratio and free their resources on page hide.

## Credits & licences

- [Three.js](https://threejs.org) (MIT) and [GSAP](https://gsap.com) with ScrollTrigger (GSAP standard licence, free for this use).
- Fonts: [DM Serif Display](https://github.com/googlefonts/dm-fonts) and [Jost](https://github.com/indestructible-type/Jost), both under the SIL Open Font License.
- Project photography and the logo belong to Wellfit Designs. Visualisations, textures and 3D content were generated procedurally for this project.
