import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../../../styles.css";
import { App } from "./App.js";

const root = document.querySelector<HTMLDivElement>("#root");

if (!root) throw new Error("Élément #root introuvable");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
