import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import "@fontsource-variable/anek-malayalam/wght.css";
import "./styles/globals.css";
import "./styles/overrides.css";
import "./styles/typography-fix.css";
import "./styles/topbar-fixes.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
