/* ============================================================================
 * Generate the Android launcher icons and the launch (splash) screen from the
 * app's own artwork — no external tooling, no cloud service, runs offline.
 *
 *   node scripts/gen-android-icons.mjs
 *
 * Source of truth: public/icon-512.png (the same mark the installed web app
 * uses). Everything it writes lands in android/app/src/main/res, so re-running
 * Checked in, so a fresh clone never has to regenerate them.
 *
 * Generated:
 *   mipmap-{m,h,xh,xxh,xxxh}dpi/ic_launcher.png            48…192 px
 *   mipmap-{…}dpi/ic_launcher_round.png                    same, round mask
 *   mipmap-{…}dpi/ic_launcher_foreground.png               108…432 px adaptive
 *   drawable/splash.png + drawable-{port,land}-*dpi/splash.png
 * ========================================================================== */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const RES = path.join(ROOT, "android", "res");
const SOURCE = path.join(ROOT, "public", "icon-512.png");
const BRAND = { r: 0x0d, g: 0x94, b: 0x88 }; // brand green (#0d9488)

const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

/** High-quality box-filter downscale (the source is a flat logo, so area
 *  averaging is both correct and dependency-free). */
function resize(source, width, height) {
  const out = new PNG({ width, height });
  const scaleX = source.width / width;
  const scaleY = source.height / height;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor(x * scaleX);
      const x1 = Math.min(source.width, Math.max(x0 + 1, Math.ceil((x + 1) * scaleX)));
      const y0 = Math.floor(y * scaleY);
      const y1 = Math.min(source.height, Math.max(y0 + 1, Math.ceil((y + 1) * scaleY)));
      let r = 0, g = 0, b = 0, a = 0, count = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const index = (sy * source.width + sx) << 2;
          const alpha = source.data[index + 3] / 255;
          r += source.data[index] * alpha;
          g += source.data[index + 1] * alpha;
          b += source.data[index + 2] * alpha;
          a += alpha;
          count++;
        }
      }
      const outIndex = (y * width + x) << 2;
      if (!count || a === 0) {
        out.data[outIndex] = 0; out.data[outIndex + 1] = 0; out.data[outIndex + 2] = 0; out.data[outIndex + 3] = 0;
        continue;
      }
      out.data[outIndex] = Math.round(r / a);
      out.data[outIndex + 1] = Math.round(g / a);
      out.data[outIndex + 2] = Math.round(b / a);
      out.data[outIndex + 3] = Math.round((a / count) * 255);
    }
  }
  return out;
}

/** Composite `logo` centred on a solid (or transparent) canvas. */
function compose(width, height, logo, background, logoScale = 0.62) {
  const out = new PNG({ width, height });
  const size = Math.round(Math.min(width, height) * logoScale);
  const scaled = resize(logo, size, size);
  const offsetX = Math.round((width - size) / 2);
  const offsetY = Math.round((height - size) / 2);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) << 2;
      const inside = background !== null;
      out.data[index] = inside ? background.r : 0;
      out.data[index + 1] = inside ? background.g : 0;
      out.data[index + 2] = inside ? background.b : 0;
      out.data[index + 3] = inside ? 255 : 0;
    }
  }
  for (let y = 0; y < scaled.height; y++) {
    for (let x = 0; x < scaled.width; x++) {
      const targetX = offsetX + x;
      const targetY = offsetY + y;
      if (targetX < 0 || targetY < 0 || targetX >= width || targetY >= height) continue;
      const from = (y * scaled.width + x) << 2;
      const to = (targetY * width + targetX) << 2;
      const alpha = scaled.data[from + 3] / 255;
      if (alpha === 0) continue;
      for (let channel = 0; channel < 3; channel++) {
        const base = out.data[to + channel];
        out.data[to + channel] = Math.round(scaled.data[from + channel] * alpha + base * (1 - alpha));
      }
      out.data[to + 3] = 255;
    }
  }
  return out;
}

function write(file, png) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(png));
  console.log(`  ${path.relative(ROOT, file)}  ${png.width}×${png.height}`);
}

const logo = PNG.sync.read(fs.readFileSync(SOURCE));
console.log(`Source: ${path.relative(ROOT, SOURCE)} (${logo.width}×${logo.height})`);

console.log("Launcher icons:");
for (const [density, factor] of Object.entries(DENSITIES)) {
  const size = Math.round(48 * factor);
  const dir = path.join(RES, `mipmap-${density}`);
  write(path.join(dir, "ic_launcher.png"), compose(size, size, logo, BRAND, 0.86));
  write(path.join(dir, "ic_launcher_round.png"), compose(size, size, logo, BRAND, 0.86));
  // Adaptive icons: the foreground carries the mark on a transparent canvas,
  // the background is the brand colour declared in values/ic_launcher_background.xml
  // (the launcher applies the mask, so the artwork stays inside the safe zone).
  write(path.join(dir, "ic_launcher_foreground.png"), compose(Math.round(108 * factor), Math.round(108 * factor), logo, null, 0.58));
}

console.log("Launch screens:");
const SPLASH = {
  "drawable-port-mdpi": [320, 480], "drawable-port-hdpi": [480, 800],
  "drawable-port-xhdpi": [720, 1280], "drawable-port-xxhdpi": [960, 1600],
  "drawable-port-xxxhdpi": [1280, 1920],
  "drawable-land-mdpi": [480, 320], "drawable-land-hdpi": [800, 480],
  "drawable-land-xhdpi": [1280, 720], "drawable-land-xxhdpi": [1600, 960],
  "drawable-land-xxxhdpi": [1920, 1280],
};
for (const [folder, [width, height]] of Object.entries(SPLASH)) {
  write(path.join(RES, folder, "splash.png"), compose(width, height, logo, BRAND, 0.34));
}
// The theme's launch background also references drawable/splash (portrait, mdpi-ish).
write(path.join(RES, "drawable", "splash.png"), compose(480, 800, logo, BRAND, 0.34));

console.log("Launcher background colour resource:");
fs.writeFileSync(
  path.join(RES, "values", "ic_launcher_background.xml"),
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#0d9488</color>\n</resources>\n`
);
console.log("  res/values/ic_launcher_background.xml  #0d9488");
console.log("Done.");
