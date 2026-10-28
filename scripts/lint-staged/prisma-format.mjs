// Formats the Prisma schema from the commit hook (spec 0009, AC-9). Starts @aft/db's own Prisma
// binary with node, never through a shell or pnpm (I34).
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const db = path.join(repoRoot, "packages", "db");

const pkgPath = createRequire(path.join(db, "package.json")).resolve("prisma/package.json");
const bin = path.join(path.dirname(pkgPath), JSON.parse(readFileSync(pkgPath, "utf8")).bin.prisma);

const result = spawnSync(process.execPath, [bin, "format"], { cwd: db, stdio: "inherit" });
process.exit(result.error || result.status !== 0 ? 1 : 0);
