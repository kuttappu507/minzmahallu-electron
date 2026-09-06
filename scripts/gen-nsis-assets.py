#!/usr/bin/env python3
"""
NSIS installer art for MMS — crisp, exactly-sized MUI2 bitmaps.

Why: electron-builder's generic installer art is a low-resolution default,
and the NSIS window is not DPI-aware, so on Windows display scaling above
100% the whole installer gets bitmap-stretched and looks pixelated. Two
mitigations ship together:
  1. This script replaces the default art with brand assets rendered at the
     EXACT native MUI2 control sizes (no scaling at 100%):
       build/installerSidebar.bmp  164 x 314  (assisted installer left rail,
                                               welcome + finish pages)
       build/installerHeader.bmp   150 x  57  (top strip on inner pages)
  2. build/installer.nsh sets "ManifestDPIAware true" so the installer
     renders text natively instead of being DWM-upscaled.

Design: full-bleed brand-green gradient (matches the splash screen family:
#12a396 -> #0d9488 -> #0a5f5a, 165deg) with the white squircle mark from
public/logo.png. Everything is drawn 4x and LANCZOS-downsampled for clean
anti-aliasing (same technique as scripts/gen-brand-assets.py).

Run from repo root:  python3 scripts/gen-nsis-assets.py
Outputs are committed to build/ (electron-builder picks them up by file
name convention — no package.json config needed).
"""
from PIL import Image
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "build")
MARK_SRC = os.path.join(ROOT, "public", "logo.png")  # white mark, transparent bg

SS = 4  # supersampling factor

# Splash-screen gradient stops (165deg), kept in sync with globals.css.
TOP = (18, 163, 150)      # #12a396
MID = (13, 148, 136)      # #0d9488
BOT = (10, 95, 90)        # #0a5f5a


def gradient(w: int, h: int, diagonal: bool = True) -> Image.Image:
    """Brand gradient, drawn supersampled and downscaled (anti-aliased)."""
    W, H = w * SS, h * SS
    im = Image.new("RGB", (W, H))
    px = im.load()
    # Interpolation parameter: pure vertical (t = y/H) or diagonal
    # (mix of x and y) to echo the 165deg splash gradient.
    for y in range(H):
        for x in range(W):
            t = (y / H) if not diagonal else (0.55 * (y / H) + 0.45 * (x / W))
            if t < 0.52:
                k = t / 0.52
                c = tuple(TOP[i] + (MID[i] - TOP[i]) * k for i in range(3))
            else:
                k = (t - 0.52) / 0.48
                c = tuple(MID[i] + (BOT[i] - MID[i]) * k for i in range(3))
            px[x, y] = tuple(int(round(v)) for v in c)
    return im.resize((w, h), Image.LANCZOS)


def white_mark(target: int) -> Image.Image:
    """White squircle mark from public/logo.png, fitted to `target` px square
    (in FINAL resolution), preserving alpha; drawn supersampled."""
    src = Image.open(MARK_SRC).convert("RGBA")
    W = target * SS
    im = src.resize((W, W), Image.LANCZOS)
    return im.resize((target, target), Image.LANCZOS)


def make_sidebar() -> str:
    """164 x 314 left rail: gradient + centered white mark + subtle top band."""
    w, h = 164, 314
    base = gradient(w, h, diagonal=True).convert("RGBA")
    mark = white_mark(108)
    mx = (w - mark.width) // 2
    my = (h - mark.height) // 2 - 6
    base.alpha_composite(mark, (mx, my))
    out = base.convert("RGB")  # MUI2 bitmaps: no alpha channel
    path = os.path.join(OUT_DIR, "installerSidebar.bmp")
    out.save(path, "BMP")
    return path


def make_header() -> str:
    """150 x 57 top strip: gradient + white mark right-aligned (MUI layout)."""
    w, h = 150, 57
    base = gradient(w, h, diagonal=False).convert("RGBA")
    mark = white_mark(36)
    base.alpha_composite(mark, (w - mark.width - 10, (h - mark.height) // 2))
    out = base.convert("RGB")
    path = os.path.join(OUT_DIR, "installerHeader.bmp")
    out.save(path, "BMP")
    return path


if __name__ == "__main__":
    os.makedirs(OUT_DIR, exist_ok=True)
    for p in (make_sidebar(), make_header()):
        im = Image.open(p)
        kb = os.path.getsize(p) / 1024
        print(f"[nsis-assets] {p}  {im.size[0]}x{im.size[1]}  {im.mode}  {kb:.1f} KB")
