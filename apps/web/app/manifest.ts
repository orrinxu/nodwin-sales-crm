import type { MetadataRoute } from "next"
import { PWA_THEME_COLOR } from "@/lib/pwa/brand-color"

// Web App Manifest (ORR-705). Served at /manifest.webmanifest via Next's metadata
// route. This route reads no request data or env, so force it static — otherwise
// the root layout's `force-dynamic` would drag it into per-request evaluation.
export const dynamic = "force-static"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Nodwin Sales CRM",
    short_name: "Nodwin CRM",
    description: "Sales CRM for Nodwin — pipeline, accounts, and deals on the go.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: PWA_THEME_COLOR,
    categories: ["business", "productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  }
}
