"""Photorealistic stills for the site, generated with FLUX.1 Krea [dev] on Hugging Face.

Every still on the site comes from here, including the home hero and the
room photos on the services page. Each job writes the same file names and
pixel sizes that the pages already reference, so publishing needs no HTML
changes. Publishing the hero also rebuilds the Open Graph card.

  pip install -r requirements.txt
  export HF_TOKEN=...            # your Hugging Face token (uses your Spaces GPU quota)

  python photoreal.py generate                  # every job, skipping ones already generated
  python photoreal.py generate --only hero-living,cta-dusk --variants 3   # in this order
  python photoreal.py sheet                     # out/sheet.jpg: the picked image for each job
  python photoreal.py publish                   # write assets/images/<name>-<width>.{jpg,webp}
  python photoreal.py publish --pick project-hoc=2
  python photoreal.py crop                      # close-ups cut from their main photos
  python photoreal.py retouch serve-offices --box 300,555,360,580   # paint out stray lettering
  python photoreal.py publish --only project-hoc-detail --pick project-hoc-detail=crop

Raw images and their settings are kept in out/<name>/ (git-ignored). A job's
picked variant defaults to 1, its fixed seed; --pick name=N chooses another.
Generated outputs may be used commercially under the FLUX.1 [dev] licence.
"""
import argparse
import html
import json
import os
import re
import sys
import time
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
IMAGES = ROOT / 'assets' / 'images'
OUT = HERE / 'out'
SPACE = 'black-forest-labs/FLUX.1-Krea-dev'   # 75 s GPU window per image; mcp-tools/FLUX.1-Krea-dev allows 25 s

# Generation sizes are multiples of 32, at or above the largest output so nothing
# is upscaled; publish centre-crops and downsizes them to each output file.
GEN = {
    'portrait': (1024, 1280),   # 4:5 -> 1000x1250, 600x750
    'landscape': (1792, 1120),  # 16:10 -> 1600x1000, 800x500
    'wide': (1920, 1088),       # 16:9 -> 1920x1080, 1600x900, 1000x562
    'square': (1120, 1120),     # 1:1 -> 1100, 900, 700, 600
}
STEPS, GUIDANCE = 28, 4.5
CAMERA = 'Canon EOS R5, 24mm tilt-shift lens, f/8'

JOBS = [
    # ---- Projects (main + detail) ------------------------------------
    ('project-oriana', 'portrait',
     'Editorial interior photograph of an open-plan office on a high floor of a modern tower: long white bench desks on slim black legs, '
     'black mesh task chairs and open laptops, low terracotta planter troughs full of leafy plants running between the desks, '
     'a full-height oak shelving wall styled with books, binders and ceramics at the back, floor-to-ceiling windows with soft morning daylight and generic modern glass towers in the haze, '
     f'grey carpet tiles, slim linear ceiling lights. Empty and tidy. {CAMERA}.'),
    ('project-oriana-detail', 'square',
     'Close-up interior photograph of a white bench desk in a bright office: an open silver laptop seen from the front with its screen switched off, a notebook and a ceramic cup, '
     'a terracotta planter trough with glossy green plants along the desk edge, floor-to-ceiling glazing behind with soft daylight '
     'and blurred generic glass towers outside. Shallow depth of field, Sony A7R IV, 50mm, f/2.8, true-to-life textures.'),
    ('project-inva', 'portrait',
     'Editorial interior photograph of a corporate breakout lounge: a warm limewashed wall with three tall arched alcoves, each holding '
     'a terracotta velvet banquette, round white marble cafe tables and cream boucle chairs in front, black dome pendants hanging in the '
     f'arches, large potted plants, warm oak plank floor, soft side daylight. Empty room. {CAMERA}.'),
    ('project-inva-detail', 'square',
     'Close-up interior photograph of an arched alcove in a smooth, freshly finished limewash wall holding a terracotta velvet banquette, a small round white '
     'marble cafe table with a ceramic vase, a cream boucle chair in the foreground, warm side daylight and soft shadows, oak floor. '
     'Hasselblad X2D, 45mm, f/4, shallow depth of field, tactile fabric and stone textures.'),
    ('project-smartleave', 'portrait',
     'Editorial interior photograph of a modern office reception: a reception counter clad in dark veined stone, in front of a backlit '
     'oak-panelled feature wall with a single round brushed-brass sculptural disc as its only ornament, warm cove lighting in the ceiling, '
     f'oak plank floor, a tall plant in the corner, calm daylight. Empty and polished. {CAMERA}.'),
    ('project-smartleave-detail', 'square',
     'Interior photograph of a glass-walled meeting room in a modern high-rise office: black steel-framed glass partitions, a long white '
     'meeting table with black task chairs, a switched-off black wall-mounted screen, floor-to-ceiling windows with generic modern glass towers and soft daylight, '
     'oak floor reflecting the light. Empty room. Sony A7R IV, 35mm, f/5.6, true-to-life reflections.'),
    ('project-hoc', 'portrait',
     'Editorial interior photograph of a creative photo studio: a burnt-orange paper backdrop sweeping down onto a polished concrete '
     'floor, two large softboxes on black light stands, exposed black ducts under a dark painted ceiling, smooth freshly finished warm plaster walls, daylight '
     f'falling across the floor from a side window. Empty studio. {CAMERA}, realistic textures.'),
    ('project-hoc-detail', 'square',
     'Interior photograph of a studio worktable: a long light oak table with laptops and sketchbooks, black task chairs, three black '
     'dome pendant lights overhead, a grey acoustic felt panel wall and an orange paper backdrop softly blurred behind, polished '
     'concrete floor, soft daylight. Sony A7R IV, 35mm, f/4, natural textures.'),
    ('project-strada', 'portrait',
     'Editorial interior photograph of an executive meeting room: a long matte black table with black wooden chairs, a vertical oak '
     'slat feature wall, a slim linear black pendant light above the table, a switched-off black wall-mounted screen, herringbone oak parquet floor, '
     f'soft daylight from tall windows. Empty room, warm and refined. {CAMERA}.'),
    ('project-strada-detail', 'square',
     'Close-up interior photograph of black wooden chairs around a matte black table on a herringbone oak parquet floor, a vertical '
     'oak slat wall softly out of focus behind, warm afternoon light casting long shadows across the parquet. Hasselblad X2D, 65mm, '
     'f/4, shallow depth of field, rich wood grain.'),
    ('project-avery', 'landscape',
     'Editorial interior photograph of a minimalist villa living room: pale oak floor, a low linen sofa and a leather lounge chair, '
     'a round travertine coffee table, a pale oak sideboard, sheer linen curtains, floor-to-ceiling glazing onto a green garden with '
     f'olive trees, a white globe pendant, soft afternoon sunlight. Empty and calm. {CAMERA}.'),
    ('project-avery-detail', 'square',
     'Close-up interior photograph of a kitchen island with a white Calacatta marble worktop and pale oak joinery fronts, a terracotta '
     'ceramic vase and a wooden chopping board on the counter, a window with garden greenery softly blurred behind, warm natural '
     'light. Hasselblad X2D, 65mm, f/4, shallow depth of field, crisp marble veining.'),
    ('project-sanchez', 'landscape',
     'Editorial interior photograph of a double-height villa entrance hall: a full-height honed travertine feature wall, a floating '
     'oak cantilevered staircase rising along it, a cream sofa, three white globe pendant lights on long cords, tall steel-framed '
     'glazing onto a garden with trees, warm sunlight raking across the stone. Empty. Canon EOS R5, 17mm tilt-shift lens, f/8.'),
    # ---- Page heroes, bands and tiles --------------------------------
    ('intro-dining', 'portrait',
     'Editorial interior photograph of a villa dining room: a solid oak dining table with linen upholstered chairs, a slim linear '
     'black pendant above, a low oak sideboard with ceramics, abstract artwork on a warm plaster wall, floor-to-ceiling glazing to a '
     f'garden with olive trees, soft afternoon light and shadows on a wool rug. Empty. {CAMERA}.'),
    ('about-lounge', 'portrait',
     'Editorial interior photograph of an office lounge on a high floor of a modern tower: cream boucle armchairs and a curved sofa around low round '
     'tables, white globe pendant lights, terracotta planter boxes with small olive trees, light oak plank floor, floor-to-ceiling '
     f'windows with a bright view of generic modern glass towers, soft diffused daylight. Empty and serene. {CAMERA}.'),
    ('about-band', 'wide',
     'Wide editorial interior photograph of a large open-plan office floor high in a modern tower: rows of white bench desks with black task '
     'chairs and planted troughs, a long oak collaboration table with cream chairs in the foreground, linear ceiling lights, grey '
     'carpet, floor-to-ceiling glazing onto a hazy skyline of mixed modern buildings far below, soft morning light. Empty. Canon EOS R5, 17mm tilt-shift lens, f/8.'),
    ('services-hero', 'portrait',
     'Editorial interior photograph of an office reception waiting area: a linen sofa and a cream boucle armchair around a low oak '
     'coffee table, a framed abstract ochre-and-black artwork on a warm plaster wall, the end of a dark stone reception counter at the '
     f'side, linear cove lighting, oak plank floor, soft daylight. Empty. {CAMERA}.'),
    ('process-hero', 'portrait',
     'Editorial interior photograph of a meeting room: a long matte black table with a few closed notebooks, black chairs on both '
     'sides, a large switched-off black wall-mounted screen on a warm plaster wall at the far end, a slim linear pendant light above, soft daylight '
     f'from the side, refined and calm. Empty room. {CAMERA}.'),
    ('svc-design', 'portrait',
     'Top-down photograph of an interior designer\'s desk: printed office floor plans drawn in fine black lines, material samples of oak, '
     'travertine and terracotta fabric swatches, a scale ruler, pencils and a laptop edge, soft window daylight with gentle shadows, '
     'natural paper texture. Flat lay, Sony A7R IV, 35mm, f/8, editorial still-life photography.'),
    ('svc-commercial', 'portrait',
     'Editorial interior photograph looking down the aisle of an open-plan office: white bench desks with black task chairs and '
     'laptops on both sides, terracotta planter troughs with plants between the desks, an oak shelving wall styled with books and ceramics at the far end, '
     f'acoustic ceiling rafts and linear lights, grey carpet tiles, daylight from tall windows. Empty. {CAMERA}.'),
    ('serve-offices', 'square',
     'Editorial interior photograph of a modern office reception: a dark stone reception counter in front of warm backlit oak '
     'panelling, beside a glass-walled meeting room with black steel frames, black chairs and a white table, oak plank floor, linear '
     f'cove lighting, soft daylight. Empty. {CAMERA}.'),
    ('serve-villas', 'square',
     'Editorial interior photograph of a double-height villa living room: two cream modular sofas facing each other on a wool rug, '
     'white opal glass globe pendants on long cords, floor-to-ceiling glazing opening to a lush garden with trees, pale oak floor, warm '
     'late-afternoon sunlight. Empty and serene. Canon EOS R5, 17mm tilt-shift lens, f/8.'),
    ('serve-apartments', 'square',
     'Editorial interior photograph of a high-rise apartment bedroom: a low bed with crisp linen, a vertical oak slat '
     'headboard wall, a leather bench at the foot, a boucle lounge chair and a potted olive tree, floor-to-ceiling window with a view '
     f'of a hazy skyline of mixed modern buildings, soft morning light. Empty. {CAMERA}.'),
    ('serve-commercial', 'square',
     'Editorial interior photograph of a creative studio office: exposed black ducts on a dark ceiling with large black dome pendant '
     'lights, a long light oak worktable with laptops and black task chairs, a grey acoustic felt panel wall, an orange paper photo '
     'backdrop in the corner, polished concrete floor, soft daylight. Empty. Sony A7R IV, 24mm, f/8.'),
    ('cta-dusk', 'wide',
     'Editorial interior photograph of a villa living room at dusk: two warm table lamps and a frosted opal glass sphere pendant glowing, a low linen sofa, '
     'leather lounge chairs and a round oak coffee table, floor-to-ceiling glazing showing a deep blue twilight sky and garden trees, '
     'warm interior light against the cool evening outside. Empty and calm. Canon EOS R5, 24mm tilt-shift lens, f/5.6, blue hour.'),
    # ---- Services (residential, lighting, turnkey, villas) and materials
    ('service-residential', 'portrait',
     'Editorial interior photograph of a villa living room: a cream boucle sofa, a cognac leather armchair with a walnut frame, a '
     'vertical oak slat feature wall, a round travertine coffee table, a large potted plant, a white globe pendant, soft daylight from '
     f'tall windows, pale oak floor. Empty. {CAMERA}.'),
    ('service-lighting', 'portrait',
     'Editorial interior photograph of a dining room at golden hour: a slim linear black pendant light glowing above a long oak dining '
     'table with linen chairs, floor-to-ceiling garden glazing beyond with olive trees, warm sunlight and soft shadows on a plaster '
     f'wall, oak floor. Empty. {CAMERA}.'),
    ('service-turnkey', 'portrait',
     'Editorial interior photograph of a villa kitchen: full-height pale oak joinery cabinetry with integrated appliances, a large '
     'island with a white Calacatta marble worktop and waterfall edge, oak bar stools, a marble splashback with a floating shelf, '
     f'white opal glass globe pendants, soft daylight from a garden window, oak floor. Empty and pristine. {CAMERA}.'),
    ('service-villa', 'portrait',
     'Editorial interior photograph of a double-height villa living hall: three white opal glass globe pendants on long cords, full-height '
     'steel-framed glazing to a garden with olive trees, a cream sofa and a travertine coffee table, a tall plaster wall, pale oak '
     'floor, warm sunlight streaming in. Empty. Canon EOS R5, 17mm tilt-shift lens, f/8.'),
    ('project-atelier', 'portrait',
     'Editorial interior photograph of a home study: a solid walnut desk by a tall window with architectural drawings, documents and '
     'a brass desk lamp, a dark leather chair, framed abstract art on a plaster wall, oak floor, soft morning daylight and shadows, '
     'calm and refined. Canon EOS R5, 35mm, f/4, rich wood grain.'),
    ('material-stone', 'square',
     'Studio still-life photograph of honed travertine wall finish samples: rectangular beige travertine slabs leaning against a pale '
     'plaster wall on a stone plinth, a smooth travertine sphere and a small white ceramic vase beside them, soft directional '
     'daylight with gentle shadows, visible natural pores and veining. Hasselblad X2D, 90mm macro, f/8, minimal warm neutral palette.'),
    # ---- Home hero (text sits on the left) and the services room photos
    ('hero-living', 'wide',
     'Wide editorial interior photograph of a sunlit villa living room: a vertical oak slat feature wall, a low cream boucle sofa with '
     'linen cushions, a cognac leather lounge chair, a round travertine coffee table on a wool rug, floor-to-ceiling steel-framed glazing '
     'onto a garden with olive trees, a white globe pendant, warm late-afternoon sunlight raking across a pale oak floor. Calm open '
     f'space on the left of the frame. Empty. {CAMERA}.'),
    ('room-living', 'landscape',
     'Editorial interior photograph of a villa living room: a cream boucle sofa facing a vertical oak slat wall with a low oak media '
     'console, a round travertine coffee table, a wool rug, floor-to-ceiling glazing onto a green garden, soft afternoon daylight, '
     f'pale oak floor. Empty and calm. {CAMERA}.'),
    ('room-bedroom', 'landscape',
     'Editorial interior photograph of a villa master bedroom: a full-width warm oak timber-panelled headboard wall, a low bed dressed '
     'in crisp oatmeal linen, slim oak bedside tables with ceramic lamps, sheer linen curtains softening a tall window, a wool rug on '
     f'a pale oak floor, gentle morning light. Empty and serene. {CAMERA}.'),
    ('room-kitchen', 'landscape',
     'Editorial interior photograph of a villa kitchen: full-height pale oak joinery cabinetry, a book-matched white Calacatta marble '
     'splashback with a slim floating shelf, a large island with a marble worktop and oak stools, white globe pendants, soft daylight '
     f'from a garden window, oak floor. Empty and pristine. {CAMERA}.'),
    ('room-dining', 'landscape',
     'Editorial interior photograph of a villa dining room: a long solid oak dining table with linen upholstered chairs, a slim linear '
     'black pendant light above, a limewashed plaster wall with a single abstract artwork, a low oak sideboard with ceramics, tall '
     f'glazing to a garden, soft evening light. Empty. {CAMERA}.'),
    ('room-office', 'landscape',
     'Editorial interior photograph of a home study: a full-height walnut bookcase wall styled with linen-bound books and ceramics, a '
     'walnut desk facing a large window onto a garden, a leather task chair, a boucle reading chair with a floor lamp in the corner, '
     f'a wool rug on an oak floor, soft daylight. Empty. {CAMERA}.'),
]
SEEDS = {name: 7000 + i * 17 for i, (name, _, _) in enumerate(JOBS)}

# New alt text for images whose subject changes from the render they replace;
# publish writes it into every page that shows the image.
ALT = {
    'room-office': 'Visualisation of a study: walnut bookcase wall, a desk, a reading chair and a window onto the garden.',
    'svc-design': 'Interior design desk with printed office floor plans and oak, travertine and fabric samples.',
    'project-smartleave-detail': 'Brass disc on the oak-panelled wall above the veined stone reception counter.',
    'project-hoc-detail': 'Softbox on a light stand beside the orange paper backdrop.',
    'project-avery-detail': 'Leather lounge chair and stone coffee table by the garden glazing.',
}

# Project close-ups are square crops of their published main photo, so each pair
# always shows the same space: name -> (main job, main variant, crop box).
# `python photoreal.py crop` writes them as out/<name>/crop.png.
DETAIL_CROPS = {
    'project-oriana-detail': ('project-oriana', '2', (120, 470, 680, 1030)),
    'project-inva-detail': ('project-inva', '3', (60, 420, 620, 980)),
    'project-smartleave-detail': ('project-smartleave', '1', (200, 380, 760, 940)),
    'project-hoc-detail': ('project-hoc', '3', (440, 380, 1000, 940)),
    'project-strada-detail': ('project-strada', '1', (470, 640, 990, 1160)),
    'project-avery-detail': ('project-avery', '1', (600, 420, 1240, 1060)),
}


def selected(names):
    """The named jobs in the order given (so --only sets priority), or all of them."""
    if not names:
        return list(JOBS)
    by_name = {j[0]: j for j in JOBS}
    missing = [n for n in names if n not in by_name]
    if missing:
        sys.exit(f'unknown job(s): {", ".join(missing)}')
    return [by_name[n] for n in dict.fromkeys(names)]


def parse_list(value):
    return [v.strip() for v in value.split(',') if v.strip()] if value else []


def find_endpoint(client):
    """The Space's text-to-image endpoint: the one taking prompt, width and height."""
    api = client.view_api(print_info=False, return_format='dict')
    for name, info in api.get('named_endpoints', {}).items():
        params = {p.get('parameter_name') for p in info.get('parameters', [])}
        if {'prompt', 'width', 'height'} <= params:
            return name
    sys.exit('no text-to-image endpoint (prompt, width, height) found on ' + SPACE)


def image_path(result):
    first = result[0] if isinstance(result, (list, tuple)) else result
    if isinstance(first, dict):
        first = first.get('path') or first.get('url')
    return first


def generate(args):
    jobs = selected(parse_list(args.only))
    try:
        from gradio_client import Client
    except ImportError:
        sys.exit('gradio_client is missing: pip install -r requirements.txt')
    token = os.environ.get('HF_TOKEN')
    if not token:
        print('note: HF_TOKEN is not set, so the Space runs on the small anonymous GPU quota')
    try:
        client = Client(args.space, token=token, verbose=False)
    except Exception as e:  # network policy, DNS or a Space that is asleep
        sys.exit(f'could not reach {args.space}: {e}\n(is huggingface.co and *.hf.space allowed by the network policy?)')
    endpoint = find_endpoint(client)
    for name, aspect, prompt in jobs:
        width, height = GEN[aspect]
        for variant in range(1, args.variants + 1):
            seed = SEEDS[name] + (variant - 1) * 1000
            dest = OUT / name / f'{variant}.png'
            if dest.exists() and not args.force:
                continue
            dest.parent.mkdir(parents=True, exist_ok=True)
            started = time.time()
            try:
                result = client.predict(prompt=prompt, seed=seed, randomize_seed=False, width=width, height=height,
                                        guidance_scale=GUIDANCE, num_inference_steps=args.steps, api_name=endpoint)
            except Exception as e:
                message = str(e)
                if 'quota' in message.lower():
                    sys.exit(f'{name}: GPU quota reached; generated images so far are kept, rerun later.\n{message}')
                print(f'{name} #{variant}: failed: {message}')
                continue
            Image.open(image_path(result)).convert('RGB').save(dest)
            meta = {'space': args.space, 'prompt': prompt, 'seed': seed, 'width': width, 'height': height,
                    'steps': args.steps, 'guidance': GUIDANCE}
            dest.with_suffix('.json').write_text(json.dumps(meta, indent=2) + '\n')
            print(f'{name} #{variant}: {width}x{height} seed {seed} ({time.time() - started:.0f}s)')


def picks(args):
    chosen = {}
    for item in parse_list(args.pick):
        name, _, variant = item.partition('=')
        chosen[name] = variant          # a variant number, or 'crop'
    return chosen


def retouch(args):
    """Paint out small lettering (fake brand names, labels) inside the given boxes.

    Pixels that stand out from the box's median brightness (lighter by default,
    darker with --dark) are filled from their surroundings; the result is saved
    as the next variant with a note of what was changed.
    """
    try:
        import cv2
        import numpy as np
    except ImportError:
        sys.exit('retouch needs opencv-python-headless and numpy: pip install -r requirements.txt')
    folder = OUT / args.name
    src = folder / f'{args.source}.png'
    if not src.exists():
        sys.exit(f'{src.relative_to(HERE)} does not exist')
    img = np.array(Image.open(src).convert('RGB'))
    lum = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY).astype(int)
    mask = np.zeros(lum.shape, np.uint8)
    boxes = [tuple(int(v) for v in b.split(',')) for b in args.box]
    if args.rows:
        # Bridge each row of the box from the pixels either side, e.g. to replace
        # an unwanted building with the sky around it.
        out = img.astype(np.float32)
        for x0, y0, x1, y1 in boxes:
            t = ((np.arange(x1 - x0) + 1) / (x1 - x0 + 1))[:, None]
            for y in range(y0, y1):
                left, right = out[y, x0 - 3:x0].mean(axis=0), out[y, x1:x1 + 3].mean(axis=0)
                out[y, x0:x1] = left[None, :] * (1 - t) + right[None, :] * t
            mask[y0:y1, x0:x1] = 255
        fixed = np.clip(out, 0, 255).astype(np.uint8)
        return save_retouch(args, folder, src, fixed, boxes, 'rows', int((mask > 0).sum()))
    if args.patch:
        # Coons patch: fill each box from all four of its edges, so gradients and
        # edges running through it (brushed metal, tread lines) carry on smoothly.
        out = img.astype(np.float32)
        for x0, y0, x1, y1 in boxes:
            w, h = x1 - x0, y1 - y0
            left = out[y0:y1, x0 - 3:x0].mean(axis=1)            # (h, 3)
            right = out[y0:y1, x1:x1 + 3].mean(axis=1)
            top = out[y0 - 3:y0, x0:x1].mean(axis=0)             # (w, 3)
            bottom = out[y1:y1 + 3, x0:x1].mean(axis=0)
            c00, c10 = out[y0 - 3:y0, x0 - 3:x0].mean(axis=(0, 1)), out[y0 - 3:y0, x1:x1 + 3].mean(axis=(0, 1))
            c01, c11 = out[y1:y1 + 3, x0 - 3:x0].mean(axis=(0, 1)), out[y1:y1 + 3, x1:x1 + 3].mean(axis=(0, 1))
            u = ((np.arange(w) + 1) / (w + 1))[None, :, None]
            v = ((np.arange(h) + 1) / (h + 1))[:, None, None]
            out[y0:y1, x0:x1] = ((1 - u) * left[:, None] + u * right[:, None] + (1 - v) * top[None] + v * bottom[None]
                                 - ((1 - u) * (1 - v) * c00 + u * (1 - v) * c10 + (1 - u) * v * c01 + u * v * c11))
            mask[y0:y1, x0:x1] = 255
        fixed = np.clip(out, 0, 255).astype(np.uint8)
        return save_retouch(args, folder, src, fixed, boxes, 'patch', int((mask > 0).sum()))
    for x0, y0, x1, y1 in boxes:
        win = lum[y0:y1, x0:x1]
        med = np.median(win)
        hit = win < med - args.threshold if args.dark else win > med + args.threshold
        mask[y0:y1, x0:x1][hit] = 255
    mask = cv2.dilate(mask, np.ones((5, 5), np.uint8))
    fixed = cv2.inpaint(img, mask, 4, cv2.INPAINT_TELEA)
    smooth = cv2.medianBlur(fixed, 5)
    fixed[mask > 0] = smooth[mask > 0]
    save_retouch(args, folder, src, fixed, boxes, 'dark' if args.dark else 'light', int((mask > 0).sum()))


def save_retouch(args, folder, src, fixed, boxes, mode, pixels):
    variant = 1 + max(int(p.stem) for p in folder.glob('*.png') if p.stem.isdigit())
    dest = folder / f'{variant}.png'
    Image.fromarray(fixed).save(dest)
    note = {'retouched_from': src.name, 'boxes': boxes, 'mode': mode, 'threshold': args.threshold, 'pixels': pixels}
    dest.with_suffix('.json').write_text(json.dumps(note, indent=2) + '\n')
    print(f'{args.name}: {dest.relative_to(HERE)} ({pixels} px filled, {mode})')


def crop(args):
    for name in parse_list(args.only) or list(DETAIL_CROPS):
        if name not in DETAIL_CROPS:
            sys.exit(f'no crop defined for {name}')
        main, variant, box = DETAIL_CROPS[name]
        src = OUT / main / f'{variant}.png'
        if not src.exists():
            print(f'{name}: {src.relative_to(HERE)} is missing, skipped')
            continue
        dest = OUT / name / 'crop.png'
        dest.parent.mkdir(parents=True, exist_ok=True)
        Image.open(src).convert('RGB').crop(box).save(dest)
        dest.with_suffix('.json').write_text(json.dumps({'cropped_from': f'{main}/{variant}.png', 'box': box}, indent=2) + '\n')
        print(f'{name}: {dest.relative_to(HERE)} from {main}/{variant}.png')


def cover(img, width, height):
    """Centre-crop to the target aspect ratio, then resample to the exact size."""
    scale = max(width / img.width, height / img.height)
    w, h = round(width / scale), round(height / scale)
    left, top = (img.width - w) // 2, (img.height - h) // 2
    return img.crop((left, top, left + w, top + h)).resize((width, height), Image.LANCZOS)


def publish(args):
    chosen = picks(args)
    for name, _, _ in selected(parse_list(args.only)):
        src = OUT / name / f'{chosen.get(name, 1)}.png'
        if not src.exists():
            print(f'{name}: no generated image ({src.relative_to(HERE)}), skipped')
            continue
        # Exactly <name>-<width>: project-avery must not pick up project-avery-detail-700.
        targets = sorted(p for p in IMAGES.glob(f'{name}-*') if p.stem[len(name) + 1:].isdigit()
                         and p.suffix in ('.jpg', '.webp'))
        if not targets:
            print(f'{name}: the pages reference no {name}-<width> files, skipped')
            continue
        img = Image.open(src).convert('RGB')
        for target in targets:
            with Image.open(target) as current:
                size = current.size
            out = cover(img, *size)
            if target.suffix == '.webp':
                out.save(target, 'WEBP', quality=80, method=6)
            else:
                out.save(target, 'JPEG', quality=82, optimize=True, progressive=True)
        print(f'{name}: ' + ', '.join(t.name for t in targets))
        if name in ALT:
            update_alt(name, ALT[name])
        if name == 'hero-living':
            compose_og(img)


def compose_og(hero):
    """og-image-1200.jpg: the logo on a sand panel beside a crop of the hero photo."""
    card = Image.new('RGB', (1200, 630), (234, 230, 219))
    card.paste(cover(hero, 720, 630), (480, 0))
    logo = Image.open(IMAGES / 'logo.png').convert('RGBA')
    logo = logo.resize((384, round(logo.height * 384 / logo.width)), Image.LANCZOS)
    card.paste(logo, ((480 - logo.width) // 2, (630 - logo.height) // 2), logo)
    card.save(IMAGES / 'og-image-1200.jpg', 'JPEG', quality=85, optimize=True, progressive=True)
    print('  og-image-1200.jpg rebuilt')


def update_alt(name, alt):
    """Rewrite the alt text of every <img> showing <name>, on every page."""
    pattern = re.compile(r'(<img\b[^>]*\bsrc="assets/images/' + re.escape(name) + r'-\d+\.\w+"[^>]*\balt=")[^"]*(")')
    for page in sorted(ROOT.glob('*.html')):
        text = page.read_text()
        new, count = pattern.subn(lambda m: m.group(1) + html.escape(alt, quote=True) + m.group(2), text)
        if count:
            page.write_text(new)
            print(f'  alt text updated in {page.name} ({count})')


def sheet(args):
    chosen = picks(args)
    font = ImageFont.load_default(size=22)
    tiles = []
    for name, _, _ in selected(parse_list(args.only)):
        src = OUT / name / f'{chosen.get(name, 1)}.png'
        if src.exists():
            img = Image.open(src).convert('RGB')
            img.thumbnail((420, 420))
            tiles.append((name, img))
    if not tiles:
        sys.exit('nothing generated yet')
    cols, cell = 6, (440, 480)
    rows = (len(tiles) + cols - 1) // cols
    board = Image.new('RGB', (cols * cell[0], rows * cell[1]), (234, 230, 219))
    draw = ImageDraw.Draw(board)
    for i, (name, img) in enumerate(tiles):
        x, y = (i % cols) * cell[0] + 10, (i // cols) * cell[1] + 10
        board.paste(img, (x, y))
        draw.text((x, y + 428), name, font=font, fill=(20, 24, 31))
    OUT.mkdir(exist_ok=True)
    board.save(OUT / 'sheet.jpg', quality=85)
    print(OUT / 'sheet.jpg')


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest='command', required=True)
    g = sub.add_parser('generate', help='generate raw images on Hugging Face')
    g.add_argument('--only', help='comma-separated job names')
    g.add_argument('--variants', type=int, default=1, help='seeds per job (default 1)')
    g.add_argument('--force', action='store_true', help='regenerate images that already exist')
    g.add_argument('--space', default=SPACE)
    g.add_argument('--steps', type=int, default=STEPS)
    for name, fn in (('publish', publish), ('sheet', sheet)):
        p = sub.add_parser(name, help=f'{name} the picked images')
        p.add_argument('--only', help='comma-separated job names')
        p.add_argument('--pick', help="name=variant pairs, comma-separated (variant may be 'crop')")
        p.set_defaults(fn=fn)
    r = sub.add_parser('retouch', help='paint out small lettering inside boxes, saving a new variant')
    r.add_argument('name')
    r.add_argument('--from', dest='source', default='1', help='variant to start from (default 1)')
    r.add_argument('--box', action='append', required=True, help='x0,y0,x1,y1 in raw pixels; repeatable')
    r.add_argument('--dark', action='store_true', help='the lettering is darker than its surroundings')
    r.add_argument('--threshold', type=int, default=40, help='brightness difference that counts as lettering')
    r.add_argument('--patch', action='store_true', help='fill whole boxes smoothly from their four edges (metal, plain surfaces)')
    r.add_argument('--rows', action='store_true', help='fill whole boxes row by row from their left and right edges (sky, plain walls)')
    r.set_defaults(fn=retouch)
    c = sub.add_parser('crop', help='build project close-ups from their main photos')
    c.add_argument('--only', help='comma-separated close-up names')
    c.set_defaults(fn=crop)
    g.set_defaults(fn=generate)
    args = parser.parse_args()
    args.fn(args)


if __name__ == '__main__':
    main()
