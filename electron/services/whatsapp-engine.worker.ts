// WhatsApp engine worker entry (v2.6.12).
//
// The ENTIRE Baileys engine (socket, noise-protocol crypto, protobuf decode,
// app-state sync, session-file persistence, QR rendering) runs HERE, on its
// own thread — never on the Electron main process event loop. A pairing or
// reconnect burst can therefore burn CPU for as long as it likes: the main
// process keeps answering IPC instantly and the window stays smooth while
// WhatsApp is "checking and pairing" (user report: the whole window froze
// after login while the engine connected).
//
// This file is the ONLY place in the main-process graph that imports the
// engine module (and through it Baileys). The bridge dispatches protocol
// messages; this entry just wires a real worker_threads port to it.
import { parentPort } from "node:worker_threads";
import { createEngineWorkerSide } from "./whatsapp-engine-bridge.js";

// RESILIENCE NET: Baileys is a huge async codebase; a stray unhandled
// rejection inside it must never take this thread down (a dead worker would
// drop the live WhatsApp session until the next respawn). Log and stay up —
// the same policy the main process has had since v2.5.1.
process.on("unhandledRejection", (reason) => {
  console.warn("[whatsapp-worker] unhandled rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.warn("[whatsapp-worker] uncaught exception:", err);
});

if (!parentPort) {
  // Loaded outside a worker thread — never spawn-work here (this file must
  // only run as the worker entry). No-op loudly instead of exiting: an
  // accidental main-process import must never kill the app.
  console.warn("[whatsapp-worker] loaded outside a worker thread — standing by");
} else {
  createEngineWorkerSide(
    (msg) => { parentPort!.postMessage(msg); },
    (handler) => { parentPort!.on("message", handler); }
  );
}
