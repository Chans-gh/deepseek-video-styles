#!/usr/bin/env python3
"""把逐帧 PNG 拼成联系表（contact sheet），带时间戳，用于人工/模型验收。

用法：
  python3 tools/sheet.py out/x/frames --out out/x/sheet.png --cols 4 --rows 3
  python3 tools/sheet.py out/x/stills --out out/x/stills.png --cols 2 --rows 2
"""
import argparse
import pathlib
import sys

from PIL import Image, ImageDraw, ImageFont

FONT_CANDIDATES = [
    "/System/Library/Fonts/PingFang.ttc",
    "/System/Library/Fonts/Hiragino Sans GB.ttc",
    "/Library/Fonts/Arial Unicode.ttf",
]


def load_font(size: int):
    for p in FONT_CANDIDATES:
        if pathlib.Path(p).exists():
            try:
                return ImageFont.truetype(p, size)
            except OSError:
                continue
    return ImageFont.load_default()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("frames")
    ap.add_argument("--out", required=True)
    ap.add_argument("--cols", type=int, default=4)
    ap.add_argument("--rows", type=int, default=3)
    ap.add_argument("--thumb", type=int, default=420, help="单格宽度像素")
    ap.add_argument("--title", default="")
    ap.add_argument("--fps", type=float, default=0, help="有则按帧号标出秒数")
    args = ap.parse_args()

    files = sorted(pathlib.Path(args.frames).glob("*.png"))
    if not files:
        sys.exit(f"没有找到 PNG: {args.frames}")

    need = args.cols * args.rows
    if len(files) > need:
        step = len(files) / need
        files = [files[min(int(i * step), len(files) - 1)] for i in range(need)]
        seen, uniq = set(), []
        for f in files:
            if f not in seen:
                seen.add(f)
                uniq.append(f)
        files = uniq

    with Image.open(files[0]) as probe:
        ratio = probe.height / probe.width
    tw = args.thumb
    th = int(tw * ratio)
    pad, label_h = 8, 26
    title_h = 44 if args.title else 0

    sheet = Image.new(
        "RGB",
        (args.cols * tw + pad * (args.cols + 1), title_h + args.rows * (th + label_h) + pad * (args.rows + 1)),
        (24, 24, 26),
    )
    draw = ImageDraw.Draw(sheet)
    font, tfont = load_font(16), load_font(22)
    if args.title:
        draw.text((pad + 4, 10), args.title, fill=(240, 240, 240), font=tfont)

    for idx, f in enumerate(files):
        r, c = divmod(idx, args.cols)
        x = pad + c * (tw + pad)
        y = title_h + pad + r * (th + label_h + pad)
        with Image.open(f) as im:
            im = im.convert("RGB").resize((tw, th), Image.LANCZOS)
            sheet.paste(im, (x, y))
        if args.fps:
            label = f"{int(f.stem.lstrip('f')) / args.fps:.2f}s"
        else:
            label = f.stem
        draw.text((x + 2, y + th + 4), label, fill=(200, 200, 205), font=font)

    out = pathlib.Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out, quality=92)
    print(f"{out}  ({len(files)} 格, {sheet.width}x{sheet.height})")


if __name__ == "__main__":
    main()
