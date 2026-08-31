import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import "@fontsource-variable/anek-malayalam/wght.css";
import "./styles/globals.css";
import "./styles/overrides.css";
import "./styles/typography-fix.css";
import "./styles/topbar-fixes.css";
/* Emerald Noir skin — MUST be the last CSS import so it wins the cascade
   (globals.css & co. are imported after the App subtree evaluates). */
import "./styles/modern-refresh.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
