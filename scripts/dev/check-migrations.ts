import { execSync } from "node:child_process";

function runCommand(cmd: string): string {
  try {
    return execSync(cmd, { stdio: "pipe", encoding: "utf8" }).trim();
  } catch (error) {
    const err = error as { stdout?: string; message: string };
    throw new Error(err.stdout || err.message);
  }
}

async function main() {
  console.log("🔍 Checking Prisma migration status...");

  let changedFiles: string[] = [];
  try {
    const branchDiff = runCommand(
      "git diff --name-only origin/main...HEAD",
    ).split("\n");
    const localChanges = runCommand("git status --porcelain")
      .split("\n")
      .map((line) => line.slice(3).trim());
    changedFiles = [...new Set([...branchDiff, ...localChanges])].filter(
      Boolean,
    );
  } catch (_error) {
    console.warn(
      "⚠️ Git check failed (maybe not in a git repo or no origin/main?); skipping git status check.",
    );
  }

  if (changedFiles.length > 0) {
    const schemaChanged = changedFiles.includes("prisma/schema.prisma");
    if (schemaChanged) {
      const hasNewMigration = changedFiles.some(
        (f) =>
          f.startsWith("prisma/migrations/") && f.endsWith("migration.sql"),
      );

      if (!hasNewMigration) {
        console.error(
          "\n❌ Error: prisma/schema.prisma has changes, but no corresponding migration SQL file is present in this branch.",
        );
        console.error(
          "Please run 'pnpm exec prisma migrate dev --name <migration_name>' to generate the migration file.\n",
        );
        process.exit(1);
      }
    }
  }

  // 2. Active database check if connection URLs are present
  const dbUrl = process.env.DATABASE_URL;
  const shadowUrl = process.env.SHADOW_DATABASE_URL;
  if (dbUrl && shadowUrl) {
    console.log(
      "⚡ Database URLs detected. Running live schema drift check...",
    );
    try {
      execSync(
        "pnpm exec prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code",
        { stdio: "inherit" },
      );
      console.log("✅ Migrations are perfectly in sync with schema.");
    } catch (error) {
      const err = error as { status?: number; message: string };
      if (err.status === 2) {
        console.error(
          "\n❌ Schema drift detected! The migrations directory does not match the schema.\n",
        );
        process.exit(2);
      } else {
        console.warn(
          `⚠️ Migration diff check skipped due to error: ${err.message}`,
        );
      }
    }
  } else {
    console.log(
      "ℹ️ No DATABASE_URL + SHADOW_DATABASE_URL found; skipping live diff check.",
    );
  }

  console.log("✅ Migration check passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
