import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

/**
 * Two build-output checks that only fail long after the build otherwise
 * succeeds — one at runtime, one at deploy time.
 *
 * 1. sharp's binding without libvips. `@img/sharp-<platform>/lib/*.node`
 *    reaches libvips through an RPATH, not through an import, so whether it
 *    gets traced depends on the tracer recognising sharp's package layout.
 *    When it does not, the bundle ships the binding alone and the first
 *    request touching an image dies with `ERR_DLOPEN_FAILED:
 *    libvips-cpp.so.<version>: cannot open shared object file`.
 *
 * 2. Files traced from inside a symlinked directory. pnpm's store is a web of
 *    symlinks, and a traced path that runs *through* one makes Vercel reject
 *    the upload with "The framework produced an invalid deployment package for
 *    a Serverless Function" — after a green build, with no route named. Only
 *    real paths and the symlinks themselves may be traced.
 */

const ROOT = process.cwd();
const DIST_DIR = process.env.NEXT_DIST_DIR ?? ".next";
const SERVER_DIR = path.join(ROOT, DIST_DIR, "server");

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

const symlinkCache = new Map<string, boolean>();

function isSymlink(dir: string): boolean {
  const cached = symlinkCache.get(dir);
  if (cached !== undefined) return cached;
  let result = false;
  try {
    result = lstatSync(dir).isSymbolicLink();
  } catch {
    // A path that no longer exists cannot be a symlinked directory we care
    // about; tracing tolerates stale entries, so treat it as clean.
  }
  symlinkCache.set(dir, result);
  return result;
}

/**
 * The nearest ancestor directory of `file` that is a symlink, if any. The
 * symlink itself being traced is fine — Vercel recreates it. What breaks is a
 * file traced at a path that runs *through* one.
 */
function symlinkedAncestor(file: string): string | null {
  let found: string | null = null;
  let dir = path.dirname(file);
  while (dir.startsWith(ROOT) && dir !== ROOT) {
    if (isSymlink(dir)) found = dir;
    dir = path.dirname(dir);
  }
  return found;
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
  const throughSymlinks = new Map<string, string>();

  for (const traceFile of traceFiles) {
    const trace = JSON.parse(readFileSync(traceFile, "utf8")) as {
      files?: string[];
    };
    const traced = (trace.files ?? []).map((file) =>
      path.resolve(path.dirname(traceFile), file),
    );

    for (const file of traced) {
      if (throughSymlinks.has(file)) continue;
      const link = symlinkedAncestor(file);
      if (link) throughSymlinks.set(file, link);
    }

    const binding = traced.find((file) => SHARP_BINDING.test(file));
    if (!binding) continue;

    const required = requiredLibvipsBinary(binding);
    if (!required) continue;

    checked.push(entryName(traceFile));
    if (!traced.some((file) => path.basename(file) === required)) {
      broken.push({ entry: entryName(traceFile), missing: required });
    }
  }

  if (throughSymlinks.size > 0) {
    console.error(
      `\n❌ ${throughSymlinks.size} traced file(s) sit inside a symlinked directory:\n`,
    );
    for (const [file, link] of throughSymlinks) {
      console.error(`   ${path.relative(ROOT, file)}`);
      console.error(`      via symlink ${path.relative(ROOT, link)}`);
    }
    console.error(
      '\nVercel rejects these with "The framework produced an invalid\n' +
        'deployment package for a Serverless Function" — after a green build.\n' +
        "outputFileTracingIncludes is the usual culprit: a glob that names a\n" +
        "file inside pnpm's store gets re-derived through every symlink\n" +
        "pointing at it, and excludes cannot remove those (they are added after\n" +
        "the exclude pass). Let the tracer find the file on its own instead.\n",
    );
  }

  if (broken.length > 0) {
    console.error(
      `\n❌ ${broken.length} bundle(s) ship sharp's native binding without libvips:\n`,
    );
    for (const { entry, missing } of broken) {
      console.error(`   ${entry} — missing ${missing}`);
    }
    console.error(
      "\nEvery request that reaches sharp in these bundles will fail with\n" +
        "ERR_DLOPEN_FAILED. Build tracing only picks libvips up for the sharp\n" +
        "release Next itself depends on — run `pnpm why sharp` and pin the\n" +
        "direct dependency back to that version.\n",
    );
  }

  if (throughSymlinks.size > 0 || broken.length > 0) {
    process.exit(1);
  }

  console.log("✅ No traced file sits inside a symlinked directory.");

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
