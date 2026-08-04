import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

// sharp's prebuilt binding (`@img/sharp-<platform>/sharp.node`) dlopen()s
// libvips from its sibling `@img/sharp-libvips-<platform>` package via an
// RPATH. Nothing in the JS graph imports that `.so`, so build tracing ships
// `sharp.node` without it and every route that touches sharp dies at runtime
// with `ERR_DLOPEN_FAILED: libvips-cpp.so.<version>: cannot open shared object
// file`. It only bites on Vercel — a local `node_modules` still has the file
// next to the binding. Force the library into the bundles that need it.
const SHARP_LIBVIPS_FILES = [
  // pnpm's default isolated layout, where the real files live.
  "./node_modules/.pnpm/@img+sharp-libvips-*/node_modules/@img/sharp-libvips-*/lib/*.so*",
  // Hoisted / npm-style layout, in case the linker strategy ever changes.
  "./node_modules/@img/sharp-libvips-*/lib/*.so*",
];

// Route keys are matched as substrings, so "/api/ppt-requests" also covers
// "/api/ppt-requests/attachments/[attachmentId]" (a literal key would not —
// the brackets parse as a glob character class). Keep this list in sync with
// the routes that reach `sharp`; `pnpm check-traces` fails the build when a
// route bundles sharp.node without libvips beside it.
const SHARP_ROUTES = [
  "/api/ppt-requests",
  "/api/kyc/submit",
  "/api/welcome-pack/upload",
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  outputFileTracingIncludes: {
    // The EasyParcel export route reads the committed .xlsx template from disk
    // at runtime; trace it into that route's bundle so it survives deployment.
    "/api/admin/welcome-pack/export/easyparcel": [
      "./src/lib/welcome-pack/easyparcel-template.xlsx",
    ],
    ...Object.fromEntries(
      SHARP_ROUTES.map((route) => [route, SHARP_LIBVIPS_FILES]),
    ),
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
