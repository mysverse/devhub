import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // The EasyParcel export route reads the committed .xlsx template from disk at
  // runtime; trace it into that route's bundle so it survives deployment.
  outputFileTracingIncludes: {
    "/api/admin/welcome-pack/export/easyparcel": [
      "./src/lib/welcome-pack/easyparcel-template.xlsx",
    ],
  },
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

export default function config(phase: string): NextConfig {
  // A non-production NODE_ENV leaking into `next build` (e.g. from an env
  // file loaded by a wrapper such as dotenv-cli) makes the vendored
  // react-dom-server resolve its development build against production react —
  // every static prerender then dies with the cryptic "Cannot read properties
  // of null (reading 'useContext')". Fail fast with the real cause instead.
  if (
    phase === PHASE_PRODUCTION_BUILD &&
    process.env.NODE_ENV !== "production"
  ) {
    throw new Error(
      `next build requires NODE_ENV=production (got "${process.env.NODE_ENV}"). ` +
        "Something injected a non-production NODE_ENV into the build " +
        "environment — check env files and wrappers. Mixed react/react-dom " +
        "dists would crash every prerender with null-hook TypeErrors.",
    );
  }
  return nextConfig;
}
