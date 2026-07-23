import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/shrikhand";
import "@fontsource-variable/manrope";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import "./styles.css";

registerSW({ immediate: true });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
