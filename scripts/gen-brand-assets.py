#!/usr/bin/env python3
"""Generate the new MMS brand assets from the uploaded logo.

Uploaded mark: deep-green house/dome+crescent+family on transparent, 1254x1254.
Requested design: logo in WHITE on the app's theme green.

Outputs (into the repo):
  public/logo.png      512  white mark, transparent bg  (login / splash / topbar)
  public/icon.png      512  theme-green tile + white mark (favicon + general)
  public/icon-512.png  512  same (legacy name kept fresh)
  resources/icon.png   1024 full-bleed theme-green + white mark (electron-builder: win/mac/linux)
  public/icon.ico      multi-size ICO 16..256 (windows)
Intermediates are kept in scripts/brand-out/ for inspection (gitignored).
"""
from PIL import Image
import os
import sys
from os import path

# Repo root = parent of this script's directory, so the generator works from
# any checkout, not just this sandbox.
REPO = path.abspath(path.join(path.dirname(__file__), ".."))
SRC = path.join(REPO, "resources/brand/logo-source.png")
OUT_SRC = path.join(REPO, "scripts/brand-out")
os.makedirs(OUT_SRC, exist_ok=True)

# App theme green (login hero / topbar brand tile gradient stops)
GREEN_A = (13, 148, 136)   # #0d9488  --em
GREEN_B = (10, 95, 90)     # #0a5f5a  login hero deep stop
# Diagonal gradient direction (135deg) in unit vector
GX, GY = (1 / 2 ** 0.5, 1 / 2 ** 0.5)

img = Image.open(SRC).convert("RGBA")
w, h = img.size

# --- 1) recolor the mark to pure white, keeping the alpha mask (AA edges) ---
white = Image.new("RGBA", (w, h), (0, 0, 0, 0))
spa = img.load()
wp = white.load()
for y in range(h):
    for x in range(w):
        r, g, b, a = spa[x, y]
        if a >= 60:
            # drop the source green tint fully; alpha becomes the shape.
            # alpha < 60 is generation dust around the mark -> discarded
            wp[x, y] = (255, 255, 255, min(255, a + 20))
white.save(f"{OUT_SRC}/mark-white-full.png")

# --- 2) crop to the mark bounding box ---
bbox = white.getbbox()
mark = white.crop(bbox)
mark.save(f"{OUT_SRC}/mark-white-cropped.png")
mw, mh = mark.size
print(f"mark: {mw}x{mh} (aspect {mw/mh:.3f})")


def fit_mark(canvas_px: int, scale: float) -> Image.Image:
    """White mark centered on a transparent square canvas."""
    out = Image.new("RGBA", (canvas_px, canvas_px), (0, 0, 0, 0))
    target_h = int(canvas_px * scale)
    target_w = int(target_h * mw / mh)
    m = mark.resize((target_w, target_h), Image.LANCZOS)
    out.paste(m, ((canvas_px - target_w) // 2, (canvas_px - target_h) // 2), m)
    return out


def green_tile(size: int, mark_scale: float, rounded: int = 0) -> Image.Image:
    """Theme-green 135deg gradient square with the white mark centered."""
    out = Image.new("RGBA", (size, size))
    op = out.load()
    for y in range(size):
        for x in range(size):
            t = min(1.0, max(0.0, (x * GX + y * GY) / (size * (GX + GY)) * 2))
            # interpolate A->B along the diagonal
            r = int(GREEN_A[0] + (GREEN_B[0] - GREEN_A[0]) * t)
            g = int(GREEN_A[1] + (GREEN_B[1] - GREEN_A[1]) * t)
            b = int(GREEN_A[2] + (GREEN_B[2] - GREEN_A[2]) * t)
            op[x, y] = (r, g, b, 255)
    if rounded:
        mask = Image.new("L", (size, size), 0)
        from PIL import ImageDraw
        d = ImageDraw.Draw(mask)
        d.rounded_rectangle([0, 0, size - 1, size - 1], radius=rounded, fill=255)
        out.putalpha(mask)
    target_h = int(size * mark_scale)
    target_w = int(target_h * mw / mh)
    m = mark.resize((target_w, target_h), Image.LANCZOS)
    out.paste(m, ((size - target_w) // 2, (size - target_h) // 2), m)
    return out


# --- 3) in-app white logo (transparent bg) ---
logo = fit_mark(512, 0.84)
logo.save(f"{REPO}/public/logo.png")
print("public/logo.png", logo.size)

# --- 4) app icon tiles (full-bleed green + white mark) ---
for path, size in [
    (f"{REPO}/resources/icon.png", 1024),
    (f"{REPO}/public/icon.png", 512),
    (f"{REPO}/public/icon-512.png", 512),
]:
    tile = green_tile(size, 0.68)
    tile.save(path)
    print(path, tile.size)

# --- 5) multi-size Windows ICO ---
ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
base = green_tile(256, 0.68)
base.save(f"{REPO}/public/icon.ico", sizes=ico_sizes)
print("public/icon.ico", ico_sizes)

# --- 6) favicon PNG (square green tile, mark slightly larger for 16px legibility) ---
fav = green_tile(512, 0.74, rounded=0)
fav.save(f"{REPO}/public/favicon.png")
print("public/favicon.png", fav.size)
print("done")
