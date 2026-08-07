import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

const nextConfig: NextConfig = {
  // `next build` and `next dev` share a build directory by default, so running
  // a verification build while `pnpm dev:mock` is up overwrites the dev
  // server's route manifest — routes that compile fine start returning 404
  // until it is restarted. Local verification builds set NEXT_DIST_DIR to work
  // somewhere else; production is unset and keeps .next.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  cacheComponents: true,
  // Next 16.3's dev-server external ESM bridge can load pg's CJS default as
  // undefined while compiling a new route. Bundle pg so Prisma's adapter sees
  // the same module shape in every App Router chunk.
  transpilePackages: ["pg"],
  // The EasyParcel export route reads the committed .xlsx template from disk at
  // runtime; trace it into that route's bundle so it survives deployment.
  outputFileTracingIncludes: {
    "/api/admin/welcome-pack/export/easyparcel": [
      "./src/lib/welcome-pack/easyparcel-template.xlsx",
    ],
  },
  // Next 16.3 ships App Router view-transition support through its vendored
  // React runtime. The former experimental.viewTransition switch was removed.
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
