import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "/Inventaire/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      devOptions: {
        enabled: true
      },
      includeAssets: ["favicon.ico", "icon.png"],
      manifest: {
        name: "Inventaire musée",
        short_name: "Musée",
        description: "Application d’inventaire du musée",
        theme_color: "#0f172a",
        background_color: "#020617",
        display: "standalone",
        start_url: "/Inventaire/",
        scope: "/Inventaire/",
        icons: [
          {
            src: "/icon.png",
            sizes: "512x512",
            type: "image/png"
          }
        ]
      }
    })
  ]
});