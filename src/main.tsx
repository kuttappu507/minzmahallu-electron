import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import "@fontsource-variable/anek-malayalam/wght.css";
import "./styles/globals.css";

// The existing global stylesheet historically forced Malayalam to Gayathri.
// Keep the migration isolated here so all Malayalam UI text uses the bundled
// Anek Malayalam variable font without changing the Latin/Poppins UI.
const malayalamFontStyle = document.createElement("style");
malayalamFontStyle.textContent = `
  html.lang-ml *,
  html.lang-ml body,
  html.lang-ml input,
  html.lang-ml button,
  html.lang-ml select,
  html.lang-ml textarea,
  html.lang-ml [contenteditable="true"] {
    font-family: "Anek Malayalam Variable", Poppins, sans-serif !important;
    font-weight: 450 !important;
  }
  html.lang-ml strong,
  html.lang-ml b,
  html.lang-ml .font-semibold,
  html.lang-ml .font-bold {
    font-weight: 650 !important;
  }
  html.lang-ml input::placeholder,
  html.lang-ml textarea::placeholder {
    font-family: "Anek Malayalam Variable", Poppins, sans-serif !important;
    font-weight: 400 !important;
  }
`;
document.head.appendChild(malayalamFontStyle);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
