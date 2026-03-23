import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "/Inventaire/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "favicon.ico",
        "favicon.svg",
        "icon.png",
        "icon-192.png",
        "icon-512.png",
        "maskable_icon_192.png",
        "maskable_icon_512.png"
      ],
      manifest: {
        name: "Musée du Combattant de Luxeuil-Les-Bains - Inventaire",
        short_name: "Musée",
        description: "Application d'inventaire du musée",
        start_url: "/Inventaire/",
        scope: "/Inventaire/",
        display: "standalone",
        background_color: "#0f172a",
        theme_color: "#0f172a",
        icons: [
          {
            src: "/Inventaire/icon-192.png",
            sizes: "192x192",
            type: "image/png"
          },
          {
            src: "/Inventaire/icon-512.png",
            sizes: "512x512",
            type: "image/png"
          },
          {
            src: "/Inventaire/maskable_icon_192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable"
          },
          {
            src: "/Inventaire/maskable_icon_512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable"
          }
        ]
      }
    })
  ]
});