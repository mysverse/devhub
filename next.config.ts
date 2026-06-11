import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    // Switches App Router to the vendored experimental React channel, which
    // exports ViewTransition/addTransitionType — required by
    // motion-plus/animate-view (dashboard route transitions in template.tsx).
    // Revert this flag together with that template if it causes trouble.
    viewTransition: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
      },
    ],
  },
};

export default nextConfig;
