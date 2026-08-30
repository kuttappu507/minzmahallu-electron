import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import "@fontsource-variable/anek-malayalam/wght.css";
import "./styles/globals.css";

// Dev-only preview bridge so the renderer can run in a plain browser
// (Electron IPC unavailable). Enable with: http://localhost:5174/?preview=1
if (["localhost", "127.0.0.1"].includes(window.location.hostname) && new URLSearchParams(window.location.search).has("preview")) {
  import("@/lib/preview-mock").then(({ installPreviewMock }) => installPreviewMock());
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
