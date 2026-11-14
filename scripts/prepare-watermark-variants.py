"""Rebuild the recorded Image variants using shared document-python, no network.

Original 27 files are never rewritten. Input hashes, crop coordinates and visual
tags are recorded beside this script; catalog metadata is for authoring only.
"""
from collections import deque
from pathlib import Path
import argparse
import hashlib
import importlib.util
import json
import sys

from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'src/editor/watermarks'
SPEC = ROOT / 'scripts/watermark-variant-crops.json'
sys.dont_write_bytecode = True
module = importlib.util.spec_from_file_location('original_watermarks', ROOT / 'scripts/prepare-watermarks.py')
original = importlib.util.module_from_spec(module)
module.loader.exec_module(original)


def principal_motif(image, keep_parts=False):
    """Remove unrelated little decorations outside the principal silhouette.

    Exterior white has already been removed, while enclosed white fur / fabric
    remains opaque. Keep small disconnected strokes inside the main bounds.
    """
    w, h = image.size
    pixels = list(image.get_flattened_data())
    seen, components = bytearray(w * h), []
    for start, pixel in enumerate(pixels):
        if seen[start] or not pixel[3]:
            continue
        seen[start] = 1
        queue, component = deque([start]), []
        while queue:
            i = queue.popleft()
            component.append(i)
            x, y = i % w, i // w
            for ny in range(max(0, y - 1), min(h, y + 2)):
                for nx in range(max(0, x - 1), min(w, x + 2)):
                    j = ny * w + nx
                    if not seen[j] and pixels[j][3]:
                        seen[j] = 1
                        queue.append(j)
        components.append(component)
    main = max(components, key=len)
    xs, ys = [i % w for i in main], [i // w for i in main]
    left, right, top, bottom = min(xs) - 2, max(xs) + 2, min(ys) - 2, max(ys) + 2
    for component in components:
        if component is main:
            continue
        if not keep_parts or not all(left <= i % w <= right and top <= i // w <= bottom for i in component):
            for i in component:
                pixels[i] = (0, 0, 0, 0)
    image.putdata(pixels)
    image = image.crop(image.getchannel('A').getbbox())
    padded = Image.new('RGBA', (image.width + 12, image.height + 12))
    padded.paste(image, (6, 6))
    return padded


def retain_white_fur(image):
    # Faint watercolor outlines can have tiny breaks connecting white fur to
    # the sheet background. Close only that contour for an interior matte;
    # preserve the original colored pixels and the exterior transparency.
    mask = image.getchannel('A').point(lambda a: 255 if a > 12 else 0)
    mask = mask.filter(ImageFilter.MaxFilter(7)).filter(ImageFilter.MinFilter(7))
    ImageDraw.floodfill(mask, (0, 0), 128)
    pixels = list(image.get_flattened_data())
    for i, value in enumerate(mask.get_flattened_data()):
        if value == 0 and pixels[i][3] < 255:
            pixels[i] = (255, 253, 250, 255)
    image.putdata(pixels)
    return image


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sheet', type=Path)
    args = parser.parse_args()
    spec = json.loads(SPEC.read_text())
    sources = {}
    for key, source in spec['sources'].items():
        path = ROOT / source['file']
        assert hashlib.sha256(path.read_bytes()).hexdigest() == source['sha256'], f'Changed source: {key}'
        sources[key] = Image.open(path)
        assert sources[key].size == (1024, 1024)
    catalog = [p for p in json.loads((DEST / 'catalog.json').read_text()) if not p['key'].startswith('variant-')]
    for entry in catalog:
        if entry['key'] in spec['legacy']:
            entry.update(spec['legacy'][entry['key']])
        assert hashlib.sha256((DEST / entry['file']).read_bytes()).hexdigest() == entry['sha256']
    images = []
    for item in spec['crops']:
        crop = sources[item['sheet']].crop(item['bounds']).convert('RGB')
        # White padding lets the original matte routine retain a principal
        # silhouette close to a sheet edge; unrelated fragments are removed below.
        padded = Image.new('RGB', (crop.width + 24, crop.height + 24), 'white')
        padded.paste(crop, (12, 12))
        image = original.transparent_crop(padded, item['key'], (0, 0, padded.width, padded.height))
        if item['sheet'] == 'paws':
            image = retain_white_fur(image)
        image = principal_motif(image, keep_parts=item['sheet'] in ('leaves', 'paws') or item['key'] == 'variant-heart-wings')
        path = DEST / (item['key'] + '.webp')
        image.save(path, 'WEBP', lossless=True, method=6)
        entry = {k: item[k] for k in ['key', 'name', 'category', 'kind', 'color', 'details']}
        entry.update(file=path.name, sha256=hashlib.sha256(path.read_bytes()).hexdigest(), width=image.width, height=image.height)
        catalog.append(entry)
        images.append(image)
    (DEST / 'catalog.json').write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n')
    if args.sheet:
        columns, cell = 8, (164, 172)
        sheet = Image.new('RGB', (columns * cell[0], ((len(images) + columns - 1) // columns) * cell[1]), '#f7efdf')
        draw = ImageDraw.Draw(sheet)
        font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 12)
        for i, (image, entry) in enumerate(zip(images, spec['crops'])):
            thumb = image.copy()
            thumb.thumbnail((150, 140), Image.Resampling.LANCZOS)
            x, y = i % columns * cell[0], i // columns * cell[1]
            sheet.paste(thumb, (x + (cell[0] - thumb.width) // 2, y + (140 - thumb.height) // 2), thumb)
            draw.text((x + 4, y + 144), f'{i + 1:02d} ' + entry['key'].replace('variant-', ''), fill='#475347', font=font)
        args.sheet.parent.mkdir(parents=True, exist_ok=True)
        sheet.save(args.sheet)
    print(json.dumps(dict(new=len(images), total=len(catalog), bytes=sum((DEST / p['file']).stat().st_size for p in catalog))))


if __name__ == '__main__':
    main()
