/* ============================================================================
 * HTML → PDF for Android.
 *
 * The desktop build rendered print HTML in a hidden Electron BrowserWindow and
 * called printToPDF(). Android's WebView has no such API, so this module does
 * the equivalent entirely inside the page:
 *
 *   1. the template HTML is loaded into an isolated off-screen <iframe>
 *      (isolated because every template ships its own `html/body/*` rules,
 *      which must never leak into the running app);
 *   2. the framed document is converted to a canvas per printed page;
 *   3. the pages are written into a PDF with jsPDF.
 *
 * Page sizes follow the template's own `@page{size:…}` rule (A6 receipts,
 * A4 statements, A4-landscape register books), so output matches the desktop
 * PDFs. Every document the app produces is a PDF file that leaves through the
 * Android share sheet — there is no direct-to-printer path anywhere.
 * ========================================================================== */

export interface PdfOptions {
  /** Page box in CSS pixels; used when the HTML declares no @page size. */
  width?: number;
  height?: number;
  /** Rasterisation scale — 2 renders at ~192 dpi, sharp for A4 print. */
  scale?: number;
  /** JPEG quality for the embedded images (0.92 keeps text crisp). */
  quality?: number;
}

const MM_PER_INCH = 25.4;
const CSS_PX_PER_INCH = 96;

/** Page formats, in millimetres. */
export const PAGE_FORMATS = {
  A4: { width: 210, height: 297 },
  A4_LANDSCAPE: { width: 297, height: 210 },
  A5: { width: 148, height: 210 },
  A6: { width: 105, height: 148 },
};

const pxFromMm = (mm: number) => Math.round((mm / MM_PER_INCH) * CSS_PX_PER_INCH);

/** Read `@page{size:…}` out of the template so the PDF page box matches. */
export function detectPageFormat(html: string): { width: number; height: number; orientation: "p" | "l" } {
  const match = /@page\s*\{[^}]*?size\s*:\s*([^;}]+)/i.exec(html);
  const raw = (match?.[1] || "A4 portrait").trim();
  const explicit = /^([\d.]+)mm\s+([\d.]+)mm/i.exec(raw);
  if (explicit) {
    const width = Number(explicit[1]);
    const height = Number(explicit[2]);
    return { width, height, orientation: height >= width ? "p" : "l" };
  }
  const landscape = /landscape/i.test(raw);
  const known = /A4/i.test(raw) ? PAGE_FORMATS.A4 : /A5/i.test(raw) ? PAGE_FORMATS.A5 : /A6/i.test(raw) ? PAGE_FORMATS.A6 : PAGE_FORMATS.A4;
  return landscape
    ? { width: known.height, height: known.width, orientation: "l" }
    : { width: known.width, height: known.height, orientation: "p" };
}

/** Load HTML into a detached, fully isolated iframe and wait for it to settle. */
async function withIsolatedFrame<T>(html: string, widthPx: number, heightPx: number, run: (doc: Document, frame: HTMLIFrameElement) => Promise<T>): Promise<T> {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("sandbox", "allow-same-origin");
  frame.style.cssText = `position:fixed;left:-20000px;top:0;width:${widthPx}px;height:${heightPx}px;border:0;visibility:hidden;`;
  document.body.appendChild(frame);
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("The print document took too long to load")), 15000);
      frame.onload = () => { clearTimeout(timer); resolve(); };
      frame.srcdoc = html;
    });
    const doc = frame.contentDocument;
    if (!doc) throw new Error("Could not access the print document");
    // Web fonts must be loaded before rasterising or Malayalam glyphs come out
    // as empty boxes; the templates embed the font as a data URI, so this is
    // usually instant.
    const fonts = (doc as any).fonts as FontFaceSet | undefined;
    if (fonts?.ready) await fonts.ready.catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 60));
    return await run(doc, frame);
  } finally {
    frame.remove();
  }
}

/** Rasterise one element of the framed document into a canvas. */
async function elementToCanvas(doc: Document, element: Element, widthPx: number, heightPx: number, scale: number): Promise<HTMLCanvasElement> {
  const width = Math.max(1, Math.ceil(widthPx));
  const height = Math.max(1, Math.ceil(heightPx));
  const serialized = new XMLSerializer().serializeToString(element);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<foreignObject x="0" y="0" width="${width}" height="${height}">${serialized}</foreignObject></svg>`;
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const image = new Image();
  image.decoding = "sync";
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Print rendering failed — the page could not be rasterised"));
    image.src = url;
  });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable on this device");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.drawImage(image, 0, 0, width, height);
  return canvas;
}

export interface RasterPage {
  dataUrl: string;
  widthPx: number;
  heightPx: number;
}

/**
 * Render HTML into page images (one per printed page). Used by the PDF writer
 * and by the on-screen certificate preview.
 */
export async function renderHtmlToPageImages(html: string, options: PdfOptions = {}): Promise<RasterPage[]> {
  const format = detectPageFormat(html);
  const widthPx = options.width ?? pxFromMm(format.width);
  const heightPx = options.height ?? pxFromMm(format.height);
  const scale = options.scale ?? 2;
  const quality = options.quality ?? 0.92;

  return withIsolatedFrame(html, widthPx, heightPx + 40, async (doc) => {
    const pages: RasterPage[] = [];
    const sections = Array.from(doc.querySelectorAll(".page, section.page"));
    if (sections.length > 0) {
      for (const section of sections) {
        const box = section.getBoundingClientRect();
        const canvas = await elementToCanvas(doc, section, box.width || widthPx, box.height || heightPx, scale);
        pages.push({ dataUrl: canvas.toDataURL("image/jpeg", quality), widthPx: canvas.width / scale, heightPx: canvas.height / scale });
      }
      return pages;
    }
    // No explicit page breaks: render the whole document tall, then slice it
    // into page-height bands (long statements, audit packs, register books).
    const body = doc.body;
    const totalHeight = Math.max(heightPx, body.scrollHeight);
    const full = await elementToCanvas(doc, body, widthPx, totalHeight, scale);
    const bandHeight = Math.round(heightPx * scale);
    for (let y = 0; y < full.height; y += bandHeight) {
      const band = document.createElement("canvas");
      band.width = full.width;
      band.height = Math.min(bandHeight, full.height - y);
      const ctx = band.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, band.width, band.height);
      ctx.drawImage(full, 0, y, full.width, band.height, 0, 0, band.width, band.height);
      pages.push({ dataUrl: band.toDataURL("image/jpeg", quality), widthPx: band.width / scale, heightPx: band.height / scale });
    }
    return pages;
  });
}

/** Render HTML to a PDF as a byte array — the Android replacement for
 *  Electron's printToPDF. */
export async function renderHtmlToPdf(html: string, options: PdfOptions = {}): Promise<Uint8Array> {
  const pages = await renderHtmlToPageImages(html, options);
  if (!pages.length) throw new Error("Nothing to render");
  const { jsPDF } = await import("jspdf");
  const first = pages[0];
  const doc = new jsPDF({
    unit: "mm",
    format: [toMm(first.widthPx), toMm(first.heightPx)],
    orientation: first.widthPx > first.heightPx ? "landscape" : "portrait",
    compress: true,
  });
  pages.forEach((page, index) => {
    const width = toMm(page.widthPx);
    const height = toMm(page.heightPx);
    if (index > 0) doc.addPage([width, height], width > height ? "landscape" : "portrait");
    doc.addImage(page.dataUrl, "JPEG", 0, 0, width, height, undefined, "FAST");
  });
  const buffer = doc.output("arraybuffer");
  return new Uint8Array(buffer);
}

const toMm = (px: number) => (px / CSS_PX_PER_INCH) * MM_PER_INCH;
