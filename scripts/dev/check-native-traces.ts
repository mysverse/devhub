import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

/**
 * Guards against shipping sharp's prebuilt binding without the libvips shared
 * library it dlopen()s at load time.
 *
 * `@img/sharp-<platform>/lib/*.node` reaches libvips through an RPATH, not
 * through an import, so build tracing happily bundles the binding and drops
 * `libvips-cpp.so.*`. The result only shows up in production, as
 * `ERR_DLOPEN_FAILED: libvips-cpp.so.<version>: cannot open shared object
 * file` on the first request that touches an image. `next.config.ts` pulls the
 * library in via `outputFileTracingIncludes`; this check proves it landed in
 * every bundle that needs it.
 */

const ROOT = process.cwd();
const SERVER_DIR = path.join(ROOT, ".next", "server");

// `@img/sharp-linux-x64/lib/sharp-linux-x64-0.35.3.node` and friends — the
// binding itself, never the libvips package that sits next to it.
const SHARP_BINDING = /[/\\]@img[/\\]sharp-(?!libvips)[^/\\]+[/\\].+\.node$/;

const requireFrom = createRequire(path.join(ROOT, "package.json"));

function collectTraceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...collectTraceFiles(full));
    } else if (entry.name.endsWith(".nft.json")) {
      found.push(full);
    }
  }
  return found;
}

function packageDirOf(file: string): string | null {
  let dir = path.dirname(file);
  while (dir !== path.dirname(dir)) {
    if (existsSync(path.join(dir, "package.json"))) return dir;
    dir = path.dirname(dir);
  }
  return null;
}

/**
 * The exact `libvips-cpp.so.*` filename the given sharp binding was linked
 * against, read from the packages on disk so a sharp upgrade cannot silently
 * invalidate this check. Returns null for builds with no libvips dependency
 * (the wasm binding, for instance).
 */
function requiredLibvipsBinary(bindingFile: string): string | null {
  const bindingDir = packageDirOf(bindingFile);
  if (!bindingDir) return null;

  const bindingPkg = JSON.parse(
    readFileSync(path.join(bindingDir, "package.json"), "utf8"),
  ) as { optionalDependencies?: Record<string, string> };
  const libvipsName = Object.keys(bindingPkg.optionalDependencies ?? {}).find(
    (name) => name.startsWith("@img/sharp-libvips-"),
  );
  if (!libvipsName) return null;

  let libvipsManifest: string;
  try {
    libvipsManifest = requireFrom.resolve(`${libvipsName}/package`, {
      paths: [bindingDir],
    });
  } catch {
    return null;
  }

  // sharp >= 0.35 exposes the library as a `./binary` export purely so tooling
  // can find it; older releases only ship it as a file in `lib/`.
  const manifest = JSON.parse(readFileSync(libvipsManifest, "utf8")) as {
    exports?: Record<string, unknown>;
  };
  const exported = manifest.exports?.["./binary"];
  if (typeof exported === "string") return path.basename(exported);

  const libDir = path.join(path.dirname(libvipsManifest), "lib");
  if (!existsSync(libDir)) return null;
  return readdirSync(libDir).find((file) => file.includes(".so")) ?? null;
}

function entryName(traceFile: string): string {
  return path
    .relative(SERVER_DIR, traceFile)
    .replace(/\.js\.nft\.json$/, "")
    .replace(/\\/g, "/");
}

function main() {
  console.log("🔍 Checking native module traces...");

  if (!existsSync(SERVER_DIR)) {
    console.warn(
      `⚠️ No ${path.relative(ROOT, SERVER_DIR)} directory; run a build first. Skipping.`,
    );
    return;
  }

  const traceFiles = collectTraceFiles(SERVER_DIR);
  if (traceFiles.length === 0) {
    console.warn("⚠️ No .nft.json trace files found; skipping.");
    return;
  }

  const checked: string[] = [];
  const broken: { entry: string; missing: string }[] = [];

  for (const traceFile of traceFiles) {
    const trace = JSON.parse(readFileSync(traceFile, "utf8")) as {
      files?: string[];
    };
    const traced = (trace.files ?? []).map((file) =>
      path.resolve(path.dirname(traceFile), file),
    );

    const binding = traced.find((file) => SHARP_BINDING.test(file));
    if (!binding) continue;

    const required = requiredLibvipsBinary(binding);
    if (!required) continue;

    checked.push(entryName(traceFile));
    if (!traced.some((file) => path.basename(file) === required)) {
      broken.push({ entry: entryName(traceFile), missing: required });
    }
  }

  if (broken.length > 0) {
    console.error(
      `\n❌ ${broken.length} bundle(s) ship sharp's native binding without libvips:\n`,
    );
    for (const { entry, missing } of broken) {
      console.error(`   ${entry} — missing ${missing}`);
    }
    console.error(
      "\nEvery request that reaches sharp in these bundles will fail with " +
        "ERR_DLOPEN_FAILED.\nAdd the route to SHARP_ROUTES in next.config.ts " +
        "so outputFileTracingIncludes pulls the library in.\n",
    );
    process.exit(1);
  }

  if (checked.length === 0) {
    console.log("✅ No bundle loads sharp; nothing to verify.");
    return;
  }

  console.log(
    `✅ libvips is bundled with sharp in all ${checked.length} bundle(s) that need it:`,
  );
  for (const entry of checked) {
    console.log(`   ${entry}`);
  }
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
