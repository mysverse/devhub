import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/config";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${siteConfig.name} ${siteConfig.appName}`,
    short_name: siteConfig.appName,
    description:
      "Developer operations, PPT tracking, payouts, onboarding, and compliance for MYSverse.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#101113",
    theme_color: "#228be6",
    icons: [
      {
        src: "/icons/devhub-icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/devhub-icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/devhub-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/devhub-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
