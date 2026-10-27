"""Redraws the shop's built-in tab and home-screen icons in public/ from the logo (logo-source.png).

Run by hand after replacing the logo: `python3 scripts/favicon/build_favicons.py` (needs Pillow).
Not part of the build: the PNG/ICO files are committed.
It keeps only the lyre and swirl (the shapes connected to them; the separate letters of the
wordmark are left out), squares it up and thickens the lines a little at 16-48px so they survive.
"""
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

here = Path(__file__).parent
public = here.parent.parent / "public"
gray = Image.open(here / "logo-source.png").convert("L")
binary = gray.point(lambda v: 255 if v > 110 else 0)
pixels = np.array(binary)
# Seed rows run through the lyre and swirl, above the wordmark.
for y in (100, 180, 200, 240, 280, 300, 340, 400, 460, 520):
    for x in np.where(pixels[y] > 0)[0][::6]:
        if binary.getpixel((int(x), y)) == 255:
            ImageDraw.floodfill(binary, (int(x), y), 128)
mask = np.array(binary) == 128
ys, xs = np.where(mask)
mark = Image.fromarray(np.where(mask, np.array(gray), 0).astype("uint8")).crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))

def square(margin):
    side = int(max(mark.size) * (1 + 2 * margin))
    sq = Image.new("L", (side, side), 0)
    sq.paste(mark, ((side - mark.width) // 2, (side - mark.height) // 2))
    return sq

def icon(sq, size, grow=0):
    m = sq.filter(ImageFilter.MaxFilter(grow)) if grow else sq
    m = m.resize((size, size), Image.LANCZOS)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 255))
    out.paste(Image.new("RGBA", (size, size), (255, 255, 255, 255)), (0, 0), m)
    return out

tab = square(0.04)
small = {16: icon(tab, 16, 13), 32: icon(tab, 32, 7), 48: icon(tab, 48, 5)}
small[16].save(public / "favicon-16.png")
small[32].save(public / "favicon-32.png")
small[48].save(public / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)], append_images=[small[16], small[32]])
home = square(0.14)  # phones crop home-screen icons, so keep the mark inside the safe area
icon(home, 180).save(public / "apple-touch-icon.png")
icon(home, 192).save(public / "icon-192.png")
icon(home, 512).save(public / "icon-512.png")
print("Icons written to public/.")
