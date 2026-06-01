import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Mirrors Handy's known-good wiring: React + Tailwind v4 via the native Vite plugins.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5273,
    open: true,
  },
});
