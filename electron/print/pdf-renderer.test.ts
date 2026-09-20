/*
 * Offscreen PDF renderer — the warm-window reuse path.
 *
 * Receipts, certificates, statements and registers all render through here.
 * Every render used to CREATE a hidden BrowserWindow (a full renderer-process
 * spawn — the slowest step of a WhatsApp receipt send) and destroy it again.
 * The window is now kept warm and reused, renders are serialized, and a wedged
 * window is rebuilt and the render retried. These tests pin that behaviour
 * with a fake window (vitest has no Electron): a regression here would break
 * or slow down every PDF the app produces.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHtmlToPdf, disposePdfRenderer, resetPdfRendererForTests } from "./pdf-renderer.js";

interface Recorder {
  created: number;
  destroyed: number;
  printed: number;
  active: number;
  maxActive: number;
  loadedUrls: string[];
  pdfOptions: any;
}

function makeRecorder(): Recorder {
  return { created: 0, destroyed: 0, printed: 0, active: 0, maxActive: 0, loadedUrls: [], pdfOptions: null };
}

/** A stand-in for Electron's hidden BrowserWindow. `failLoads` makes the next
 *  N loadURL calls throw, so the rebuild-and-retry path can be exercised. */
function fakeWindowFactory(rec: Recorder, failLoads = 0) {
  return (_width: number, _height: number) => {
    rec.created++;
    const win: any = {
      destroyed: false,
      size: [794, 1123] as [number, number],
      isDestroyed: () => win.destroyed,
      destroy: () => { if (!win.destroyed) { win.destroyed = true; rec.destroyed++; } },
      getContentSize: () => [...win.size] as [number, number],
      setContentSize: (w: number, h: number) => { win.size = [w, h]; },
      loadURL: async (url: string) => {
        rec.active++;
        rec.maxActive = Math.max(rec.maxActive, rec.active);
        await new Promise((resolve) => setTimeout(resolve, 4));
        if (failLoads > 0) { failLoads--; rec.active--; throw new Error("simulated renderer failure"); }
        rec.loadedUrls.push(url);
      },
      webContents: {
        isDestroyed: () => win.destroyed,
        isCrashed: () => false,
        once: () => { /* event wiring is a no-op in the fake */ },
        executeJavaScript: async () => true,
        printToPDF: async (options: any) => {
          rec.pdfOptions = options;
          await new Promise((resolve) => setTimeout(resolve, 2));
          rec.active--;
          rec.printed++;
          return Buffer.from(`PDF-${rec.printed}`);
        },
      },
    };
    return win;
  };
}

let rec: Recorder;

beforeEach(() => { rec = makeRecorder(); });
afterEach(() => { resetPdfRendererForTests(null); });

describe("warm window reuse", () => {
  it("renders repeatedly in ONE window instead of spawning one per receipt", async () => {
    resetPdfRendererForTests(fakeWindowFactory(rec));
    const a = await renderHtmlToPdf("<html>receipt 1</html>", { width: 397, height: 559 });
    const b = await renderHtmlToPdf("<html>receipt 2</html>", { width: 397, height: 559 });
    const c = await renderHtmlToPdf("<html>A4 statement</html>");

    expect(rec.created).toBe(1);           // one window for all three renders
    expect(rec.printed).toBe(3);
    expect(rec.destroyed).toBe(0);         // kept warm for the next receipt
    expect(a.toString()).toBe("PDF-1");
    expect(b.toString()).toBe("PDF-2");
    expect(c.toString()).toBe("PDF-3");
    // Every render still loads its OWN document.
    expect(rec.loadedUrls).toHaveLength(3);
    expect(rec.loadedUrls[0]).toContain("receipt%201");
    expect(rec.loadedUrls[2]).toContain("A4%20statement");
  });

  it("keeps the CSS page-size contract (A6 receipts, A4 statements)", async () => {
    resetPdfRendererForTests(fakeWindowFactory(rec));
    await renderHtmlToPdf("<html>x</html>");
    expect(rec.pdfOptions).toMatchObject({ preferCSSPageSize: true, printBackground: true, pageSize: "A4" });
    expect(rec.pdfOptions.margins).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
  });

  it("serializes concurrent renders (one document per webContents at a time)", async () => {
    resetPdfRendererForTests(fakeWindowFactory(rec));
    const results = await Promise.all([
      renderHtmlToPdf("<html>1</html>"),
      renderHtmlToPdf("<html>2</html>"),
      renderHtmlToPdf("<html>3</html>"),
      renderHtmlToPdf("<html>4</html>"),
    ]);

    expect(results.map((r) => r.toString())).toEqual(["PDF-1", "PDF-2", "PDF-3", "PDF-4"]);
    expect(rec.maxActive).toBe(1);         // never two documents in flight
    expect(rec.created).toBe(1);
  });

  it("rebuilds a wedged window and retries the render once", async () => {
    resetPdfRendererForTests(fakeWindowFactory(rec, 1)); // first load fails
    const pdf = await renderHtmlToPdf("<html>receipt</html>");

    expect(pdf.toString()).toBe("PDF-1");  // the retry produced the document
    expect(rec.created).toBe(2);           // broken window replaced
    expect(rec.destroyed).toBe(1);         // and released
  });

  it("a failed render does not wedge the queue for the next receipt", async () => {
    resetPdfRendererForTests(fakeWindowFactory(rec, 99)); // every load fails
    await expect(renderHtmlToPdf("<html>broken</html>")).rejects.toThrow();
    // The renderer is still usable afterwards (fallback windows, fresh queue).
    resetPdfRendererForTests(fakeWindowFactory(rec));
    const pdf = await renderHtmlToPdf("<html>fine</html>");
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(rec.printed).toBeGreaterThan(0);
  });

  it("a wedged render times out, releases the window and unblocks the queue", async () => {
    // printToPDF that never settles: with a shared queue this would otherwise
    // stall EVERY later receipt, certificate and statement in the app.
    const hanging = (_w: number, _h: number) => {
      rec.created++;
      const win: any = {
        destroyed: false,
        isDestroyed: () => win.destroyed,
        destroy: () => { if (!win.destroyed) { win.destroyed = true; rec.destroyed++; } },
        getContentSize: () => [794, 1123] as [number, number],
        setContentSize: () => {},
        loadURL: async () => {},
        webContents: {
          isDestroyed: () => win.destroyed,
          isCrashed: () => false,
          once: () => {},
          executeJavaScript: async () => true,
          printToPDF: () => new Promise(() => { /* never settles */ }),
        },
      };
      return win;
    };
    resetPdfRendererForTests(hanging, { renderTimeoutMs: 60 });
    await expect(renderHtmlToPdf("<html>hangs</html>")).rejects.toThrow(/timed out/i);
    expect(rec.destroyed).toBe(1);        // the wedged window was released

    // The renderer still works for the next receipt.
    resetPdfRendererForTests(fakeWindowFactory(rec));
    const pdf = await renderHtmlToPdf("<html>next</html>");
    expect(pdf.toString()).toBe("PDF-1");
  });

  it("dispose releases the window; later renders fall back to one-shot windows", async () => {
    resetPdfRendererForTests(fakeWindowFactory(rec));
    await renderHtmlToPdf("<html>1</html>");
    expect(rec.created).toBe(1);

    disposePdfRenderer();
    expect(rec.destroyed).toBe(1);

    await renderHtmlToPdf("<html>2</html>");
    expect(rec.created).toBe(2);           // ephemeral window (quit path already ran)
    expect(rec.destroyed).toBe(2);         // …destroyed again straight away
  });
});
