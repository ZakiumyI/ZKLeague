import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // En desarrollo, /api va al backend: así frontend y API comparten origen
    // (igual que en producción) y la cookie de sesión funciona sin CORS.
    proxy: {
      "/api": "http://127.0.0.1:3100"
    }
  },
  build: {
    sourcemap: false
  }
});
