import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import "@fontsource-variable/anek-malayalam/wght.css";
import "./styles/globals.css";

// Malayalam typography is intentionally tuned separately from the Latin/Poppins UI.
// Anek Malayalam is bundled locally so the Electron app works fully offline.
const malayalamFontStyle = document.createElement("style");
malayalamFontStyle.textContent = `
  /* Base Malayalam UI: comfortable weight and vertical rhythm */
  html.lang-ml *,
  html.lang-ml body,
  html.lang-ml input,
  html.lang-ml button,
  html.lang-ml select,
  html.lang-ml textarea,
  html.lang-ml [contenteditable="true"] {
    font-family: "Anek Malayalam Variable", Poppins, sans-serif !important;
    font-weight: 450 !important;
    line-height: 1.45;
  }

  /* Strong text / headings */
  html.lang-ml strong,
  html.lang-ml b,
  html.lang-ml .font-semibold,
  html.lang-ml .font-bold,
  html.lang-ml h1,
  html.lang-ml h2,
  html.lang-ml h3,
  html.lang-ml h4,
  html.lang-ml h5,
  html.lang-ml h6 {
    font-weight: 650 !important;
    line-height: 1.35 !important;
  }

  /* Table headers were too light at the base weight.
     Keep the body readable while giving headers clear visual hierarchy. */
  html.lang-ml .tbl th,
  html.lang-ml .tbl thead th,
  html.lang-ml table th,
  html.lang-ml thead th {
    font-family: "Anek Malayalam Variable", Poppins, sans-serif !important;
    font-weight: 650 !important;
    line-height: 1.35 !important;
    letter-spacing: 0.02em !important;
    text-transform: none !important;
    min-height: 42px;
    vertical-align: middle !important;
  }

  /* Table body: slightly stronger than normal UI, without making it heavy. */
  html.lang-ml .tbl td,
  html.lang-ml table td,
  html.lang-ml tbody td {
    font-family: "Anek Malayalam Variable", Poppins, sans-serif !important;
    font-weight: 450 !important;
    line-height: 1.5 !important;
  }

  /* Important table values/names */
  html.lang-ml .tbl .strong,
  html.lang-ml table .strong {
    font-weight: 600 !important;
  }

  /* Section labels, form labels and compact controls need more presence. */
  html.lang-ml .lbl,
  html.lang-ml .navit b,
  html.lang-ml .btn,
  html.lang-ml .fchip,
  html.lang-ml .count-chip,
  html.lang-ml .pill,
  html.lang-ml .tok-board .tb-head b,
  html.lang-ml .rep-sec b {
    font-weight: 550 !important;
    line-height: 1.4 !important;
  }

  /* Small/secondary text remains lighter but gets enough line-height for Malayalam. */
  html.lang-ml .tbl .sub2,
  html.lang-ml .tempty,
  html.lang-ml .det-grid .det .k,
  html.lang-ml .det-grid .det .v {
    line-height: 1.45 !important;
  }

  /* Inputs and placeholders */
  html.lang-ml input::placeholder,
  html.lang-ml textarea::placeholder {
    font-family: "Anek Malayalam Variable", Poppins, sans-serif !important;
    font-weight: 400 !important;
    line-height: 1.45 !important;
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
