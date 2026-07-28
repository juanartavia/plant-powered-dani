import { isDev } from "@/clientEnv";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";

// Solo en dev local (`npm run dev`): doGet() es quien normalmente inyecta window.BOOKING_TOKEN/
// BOOKING_ACCION (ver app.ts) — como el dev server no pasa por Apps Script, se leen de la
// query string (?token=...&accion=...) para poder probar la pantalla de gestión de cita (US-31)
// sin necesidad de desplegar. Mismo espíritu que el modo demo de GoogleLib (googlelib.ts).
if (isDev) {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  if (token) {
    window.BOOKING_TOKEN = token;
    window.BOOKING_ACCION = params.get("accion") ?? "";
  }
}

createRoot(document.getElementById("root")!).render(<App />);
