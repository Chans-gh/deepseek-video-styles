#!/usr/bin/env python3
"""把多条风格的样帧拼成一张总览图（带编号与风格的标签条）。

和 sheet.py 的区别：sheet.py 拼的是**一条片子**的时间轴，
gallery.py 拼的是**一批风格**的横向对比，用来一眼看出批次是否够"分得开"。

用法：
  python3 tools/gallery.py --spec gallery-16x9.txt --cols 5 --thumb 380 --out out/gallery-16x9.png
spec 每行：<编号>|<名称>|<样帧路径>
"""
import argparse
import pathlib

from PIL import Image, ImageDraw, ImageFont

FONT_CANDIDATES = [
    "/System/Library/Fonts/PingFang.ttc",
    "/System/Library/Fonts/Hiragino Sans GB.ttc",
    "/Library/Fonts/Arial Unicode.ttf",
]
BG = (16, 18, 22)
BAR = (26, 29, 35)
INK = (232, 238, 246)
DIM = (140, 152, 168)


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
    ap.add_argument("--spec", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--cols", type=int, default=5)
    ap.add_argument("--thumb", type=int, default=380, help="单格宽度")
    ap.add_argument("--gap", type=int, default=14)
    ap.add_argument("--title", default="")
    args = ap.parse_args()

    rows = []
    for line in pathlib.Path(args.spec).read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split("|")
        if len(parts) != 3:
            print("跳过格式不对的行:", line)
            continue
        num, name, path = parts
        p = pathlib.Path(path)
        if not p.exists():
            print("缺样帧:", path)
            continue
        rows.append((num, name, p))

    if not rows:
        raise SystemExit("没有任何可用样帧")

    cell_w = args.thumb
    # 取第一张的宽高比决定格高
    with Image.open(rows[0][2]) as im:
        ratio = im.height / im.width
    cell_h = int(cell_w * ratio)
    bar_h = 46
    gap = args.gap
    cols = args.cols
    grid_rows = (len(rows) + cols - 1) // cols
    top = 74 if args.title else gap

    W = gap + cols * (cell_w + gap)
    H = top + grid_rows * (cell_h + bar_h + gap)
    canvas = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(canvas)

    if args.title:
        draw.text((gap + 2, 22), args.title, font=load_font(26), fill=INK)

    for i, (num, name, p) in enumerate(rows):
        c, r = i % cols, i // cols
        x = gap + c * (cell_w + gap)
        y = top + r * (cell_h + bar_h + gap)
        with Image.open(p) as im:
            im = im.convert("RGB")
            # 等比裁切填满格子
            s = max(cell_w / im.width, cell_h / im.height)
            im2 = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.LANCZOS)
            left = (im2.width - cell_w) // 2
            topc = (im2.height - cell_h) // 2
            im2 = im2.crop((left, topc, left + cell_w, topc + cell_h))
            canvas.paste(im2, (x, y))
        draw.rectangle([x, y + cell_h, x + cell_w, y + cell_h + bar_h], fill=BAR)
        draw.text((x + 12, y + cell_h + 8), num, font=load_font(20), fill=INK)
        draw.text((x + 52, y + cell_h + 10), name, font=load_font(17), fill=DIM)

    pathlib.Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    canvas.save(args.out)
    print(f"{args.out}  {canvas.width}x{canvas.height}  {len(rows)} 条")


if __name__ == "__main__":
    main()
