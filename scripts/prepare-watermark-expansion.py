"""Append recorded Image motifs without rewriting previously delivered art.

Run with shared document-python. No network, image-provider config or credentials.
--check verifies deterministic output without modifying images or the catalog.
"""
import argparse
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sys

from PIL import Image, ImageDraw, ImageFont

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'src/editor/watermarks'
SPEC = ROOT / 'scripts/watermark-expansion-crops.json'
module = importlib.util.spec_from_file_location('variant_helpers', ROOT / 'scripts/prepare-watermark-variants.py')
helpers = importlib.util.module_from_spec(module)
module.loader.exec_module(helpers)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--spec', type=Path, default=SPEC, help='Recorded batch to rebuild; defaults to the delivered 60 motifs')
    parser.add_argument('--sheet', type=Path)
    args = parser.parse_args()
    spec = json.loads(args.spec.read_text())
    catalog = json.loads((DEST / 'catalog.json').read_text())
    old = [p for p in catalog if p['key'] not in {c['key'] for c in spec['crops']}]
    # Preserve metadata, file bytes and order for all previously delivered art.
    baseline = json.dumps(old[:spec['preservedCount']], ensure_ascii=False, sort_keys=True)
    assert hashlib.sha256(baseline.encode()).hexdigest() == spec['preservedCatalogSha256'], 'Changed delivered catalog'
    for p in old:
        assert hashlib.sha256((DEST / p['file']).read_bytes()).hexdigest() == p['sha256'], p['key']
    sources = {}
    for key, source in spec['sources'].items():
        path = ROOT / source['file']
        assert hashlib.sha256(path.read_bytes()).hexdigest() == source['sha256'], f'Changed source: {key}'
        sources[key] = Image.open(path)
        assert sources[key].size == (1024, 1024)
    new, images = [], []
    for item in spec['crops']:
        source = sources[item['sheet']]
        native_alpha = 'A' in source.getbands() and source.getchannel('A').getextrema()[0] < 255
        crop = source.crop(item['bounds']).convert('RGBA' if native_alpha else 'RGB')
        # Explicit source-space masks only remove neighbouring decorations.
        for bounds in item.get('exclude', []):
            x, y = item['bounds'][:2]
            ImageDraw.Draw(crop).rectangle([bounds[0] - x, bounds[1] - y, bounds[2] - x, bounds[3] - y], fill=(0, 0, 0, 0) if native_alpha else 'white')
        if native_alpha:
            # A real alpha channel already distinguishes white fur from the
            # exterior. Keep its opacity and colors; discard near-zero noise.
            crop.putalpha(crop.getchannel('A').point(lambda a: 0 if a < 8 else a))
            crop = crop.crop(crop.getchannel('A').getbbox())
            crop.thumbnail((240, 240), Image.Resampling.LANCZOS)
            image = Image.new('RGBA', (crop.width + 12, crop.height + 12))
            image.paste(crop, (6, 6))
        else:
            padded = Image.new('RGB', (crop.width + 24, crop.height + 24), 'white')
            padded.paste(crop, (12, 12))
            image = helpers.original.transparent_crop(padded, item['key'], (0, 0, padded.width, padded.height))
        if item.get('whiteInterior') and not native_alpha:
            image = helpers.retain_white_fur(image)
        if item.get('parts') != 'all':
            image = helpers.principal_motif(image, keep_parts=item.get('parts') == 'inner')
        buffer = io.BytesIO()
        image.save(buffer, 'WEBP', lossless=True, method=6)
        data = buffer.getvalue()
        path = DEST / (item['key'] + '.webp')
        entry = {k: item[k] for k in ['key', 'name', 'category', 'kind', 'color', 'details']}
        entry.update(file=path.name, sha256=hashlib.sha256(data).hexdigest(), width=image.width, height=image.height)
        if args.check:
            assert path.read_bytes() == data, f'Non-reproducible image: {path.name}'
        else:
            path.write_bytes(data)
        new.append(entry)
        images.append(image)
    replacements = {entry['key']: entry for entry in new}
    expected = [replacements.pop(entry['key'], entry) for entry in catalog]
    expected.extend(replacements.values())
    assert len({p['key'] for p in expected}) == len(expected)
    assert len({p['sha256'] for p in expected}) == len(expected), 'Duplicate image bytes'
    if args.check:
        assert catalog == expected, 'Non-reproducible catalog'
    else:
        (DEST / 'catalog.json').write_text(json.dumps(expected, ensure_ascii=False, indent=2) + '\n')
    if args.sheet:
        cell, columns = (168, 175), 8
        sheet = Image.new('RGB', (columns * cell[0], ((len(images) + columns - 1) // columns) * cell[1]), '#f4eadb')
        draw = ImageDraw.Draw(sheet)
        font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 12)
        for i, (im, entry) in enumerate(zip(images, new)):
            thumb = im.copy()
            thumb.thumbnail((156, 142), Image.Resampling.LANCZOS)
            x, y = i % columns * cell[0], i // columns * cell[1]
            sheet.paste(thumb, (x + (cell[0] - thumb.width) // 2, y + (142 - thumb.height) // 2), thumb)
            draw.text((x + 3, y + 147), f'{i + 1:02d} ' + entry['key'].replace('extra-', ''), fill='#475347', font=font)
        args.sheet.parent.mkdir(parents=True, exist_ok=True)
        sheet.save(args.sheet)
    print(json.dumps(dict(checked=args.check, added=len(new), total=len(expected), bytes=sum((DEST / p['file']).stat().st_size for p in expected))))


if __name__ == '__main__':
    main()
