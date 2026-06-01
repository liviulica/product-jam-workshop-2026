import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Mirrors Handy's known-good wiring: React + Tailwind v4 via the native Vite plugins.
// `base` defaults to "/" for local dev/build; CI sets VITE_BASE to the GitHub Pages
// subpath (e.g. "/product-jam-workshop-2026/") so published asset + data URLs resolve.
export default defineConfig({
  base: process.env.VITE_BASE ?? "/",
  plugins: [react(), tailwindcss()],
  server: {
    port: 5273,
    open: true,
  },
});
