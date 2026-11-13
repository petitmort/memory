"""Extract the actual Image-generated sheet; run with shared document-python.

No model call or credentials here. Crops, exterior matte removal and WebP
encoding are deterministic. Enclosed white areas (such as the cat's face) stay.
"""
from collections import deque
from pathlib import Path
import argparse
import hashlib
import json

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "output/imagegen/album-watermarks.png"
DEST = ROOT / "src/editor/watermarks"
CROPS = [
    ("paw", "软软猫爪", (70, 50, 307, 270)),
    ("blossom", "樱粉小花", (307, 23, 442, 156)),
    ("blue-flower", "蓝色小花", (488, 25, 576, 120)),
    ("lilac-shell", "紫色贝壳", (592, 36, 793, 208)),
    ("soft-star", "奶油星星", (813, 22, 913, 117)),
    ("paired-leaves", "一对绿叶", (823, 119, 999, 259)),
    ("leaf", "清新叶片", (299, 197, 395, 336)),
    ("peach-flower", "蜜桃花朵", (427, 145, 609, 315)),
    ("small-heart", "粉色爱心", (618, 242, 708, 329)),
    ("pink-bow", "粉色蝴蝶结", (73, 286, 300, 445)),
    ("stitched-star", "缝线星星", (266, 374, 439, 550)),
    ("gold-star", "金色大星星", (461, 322, 684, 541)),
    ("stitched-paw", "虚线猫爪", (707, 273, 943, 481)),
    ("purple-flower", "紫色小花", (155, 435, 242, 524)),
    ("round-flower", "圆瓣小花", (16, 485, 146, 605)),
    ("pink-flower", "五瓣小花", (288, 588, 434, 728)),
    ("wide-leaves", "嫩绿双叶", (438, 552, 609, 683)),
    ("twig", "轻轻枝叶", (650, 474, 771, 671)),
    ("pink-shell", "粉色贝壳", (793, 494, 1007, 679)),
    ("blue-bow", "格纹蝴蝶结", (86, 625, 263, 758)),
    ("blue-shell", "蓝色贝壳", (702, 661, 815, 760)),
    ("blue-heart", "蓝色爱心", (289, 746, 380, 833)),
    ("cat", "微笑小猫", (44, 780, 333, 992)),
    ("large-heart", "暖暖爱心", (645, 786, 760, 895)),
    ("tall-leaf", "一片新绿", (780, 839, 879, 985)),
    ("sprout", "小小嫩芽", (626, 918, 758, 993)),
    ("little-star", "小金星", (892, 876, 999, 985)),
]


def transparent_crop(source, key, bounds):
    rgb = source.crop(bounds).convert("RGB")
    w, h = rgb.size
    allowed = Image.new("L", (w, h), 255)
    px = list(rgb.get_flattened_data())
    keep = list(allowed.get_flattened_data())
    # Exterior flood-fill avoids deleting white centers enclosed by contours.
    exterior = bytearray(w * h)
    queue = deque()
    def background(i):
        r, g, b = px[i]
        return not keep[i] or (min(r, g, b) > 241 and max(r, g, b) - min(r, g, b) < 15)
    def visit(i):
        if not exterior[i] and background(i):
            exterior[i] = 1
            queue.append(i)
    for x in range(w):
        visit(x)
        visit((h - 1) * w + x)
    for y in range(h):
        visit(y * w)
        visit(y * w + w - 1)
    while queue:
        i = queue.popleft()
        x, y = i % w, i // w
        if x: visit(i - 1)
        if x < w - 1: visit(i + 1)
        if y: visit(i - w)
        if y < h - 1: visit(i + w)
    out = []
    for i, color in enumerate(px):
        alpha = max(0., min(1., (255 - min(color) - 7) / 16)) if exterior[i] else 1.
        if not keep[i]: alpha = 0.
        # Remove white-matte fringes from the partially transparent exterior.
        clean = tuple(round(max(0., min(255., (c - 255 * (1 - alpha)) / alpha))) for c in color) if alpha else (0, 0, 0)
        out.append((*clean, round(alpha * 255)))
    rgba = Image.new("RGBA", (w, h))
    # Neighbouring motifs enter at crop edges. Remove those disconnected
    # fragments, while retaining the separate dashes in the stitched paw.
    seen = bytearray(w * h)
    for start, pixel in enumerate(out):
        if seen[start] or not pixel[3]: continue
        queue = deque([start])
        seen[start] = 1
        component, boundary = [], False
        while queue:
            i = queue.popleft()
            component.append(i)
            x, y = i % w, i // w
            boundary |= x in (0, w - 1) or y in (0, h - 1)
            for ny in range(max(0, y - 1), min(h, y + 2)):
                for nx in range(max(0, x - 1), min(w, x + 2)):
                    j = ny * w + nx
                    if not seen[j] and out[j][3]:
                        seen[j] = 1
                        queue.append(j)
        if boundary or len(component) < 10:
            for i in component: out[i] = (0, 0, 0, 0)
    rgba.putdata(out)
    bbox = rgba.getchannel("A").getbbox()
    assert bbox, f"Empty motif: {key}"
    rgba = rgba.crop(bbox)
    rgba.thumbnail((240, 240), Image.Resampling.LANCZOS)
    padded = Image.new("RGBA", (rgba.width + 12, rgba.height + 12))
    padded.paste(rgba, (6, 6))
    return padded


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sheet", type=Path, help="Optional contact sheet outside the repository")
    args = parser.parse_args()
    source = Image.open(SOURCE)
    assert source.size == (1024, 1024), "Crop positions apply to the recorded source only"
    DEST.mkdir(parents=True, exist_ok=True)
    catalog, images = [], []
    for key, name, bounds in CROPS:
        image = transparent_crop(source, key, bounds)
        target = DEST / f"{key}.webp"
        image.save(target, "WEBP", lossless=True, method=6)
        catalog.append(dict(key=key, name=name, file=target.name,
                            sha256=hashlib.sha256(target.read_bytes()).hexdigest(),
                            width=image.width, height=image.height))
        images.append(image)
    (DEST / "catalog.json").write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n")
    if args.sheet:
        sheet = Image.new("RGB", (6 * 210, 5 * 182), "#fff8eb")
        draw = ImageDraw.Draw(sheet)
        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 14)
        for i, (entry, image) in enumerate(zip(catalog, images)):
            x, y = i % 6 * 210, i // 6 * 182
            image = image.copy()
            image.thumbnail((150, 142), Image.Resampling.LANCZOS)
            sheet.paste(image, (x + (210 - image.width) // 2, y + (146 - image.height) // 2), image)
            draw.text((x + 10, y + 151), f'{i + 1:02d} {entry["key"]}', fill="#596957", font=font)
        args.sheet.parent.mkdir(parents=True, exist_ok=True)
        sheet.save(args.sheet)
    print(json.dumps(dict(count=len(catalog), bytes=sum((DEST / p["file"]).stat().st_size for p in catalog),
                          sourceSha256=hashlib.sha256(SOURCE.read_bytes()).hexdigest())))


if __name__ == "__main__":
    main()
