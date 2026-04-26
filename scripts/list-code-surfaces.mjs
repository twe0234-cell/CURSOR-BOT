import { readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative, resolve } from "node:path";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const json = process.argv.includes("--json");

const ignoredDirs = new Set([
  ".git",
  ".next",
  ".vercel",
  "node_modules",
  "coverage",
  "build",
  "dist",
]);

function walk(dir) {
  const entries = [];

  for (const name of readdirSync(dir)) {
    if (ignoredDirs.has(name)) continue;

    const path = join(dir, name);
    const stat = statSync(path);

    if (stat.isDirectory()) {
      entries.push(...walk(path));
      continue;
    }

    entries.push(path);
  }

  return entries;
}

function rel(path) {
  return relative(root, path).replaceAll("\\", "/");
}

const files = walk(root);

const appFiles = files.filter((file) => rel(file).startsWith("app/"));
const pages = appFiles.filter((file) => /\/page\.(tsx|ts)$/.test(rel(file)));
const apiRoutes = appFiles.filter((file) => /\/route\.(tsx|ts)$/.test(rel(file)));
const serverActions = files.filter((file) => /(^|\/)actions\.(ts|tsx)$/.test(rel(file)));
const migrations = files.filter((file) => rel(file).startsWith("supabase/migrations/") && file.endsWith(".sql"));
const tests = files.filter((file) => /\.(test|spec)\.(ts|tsx)$/.test(file));

const report = {
  counts: {
    pages: pages.length,
    apiRoutes: apiRoutes.length,
    serverActions: serverActions.length,
    migrations: migrations.length,
    tests: tests.length,
  },
  pages: pages.map(rel).sort(),
  apiRoutes: apiRoutes.map(rel).sort(),
  serverActions: serverActions.map(rel).sort(),
  migrations: migrations.map(rel).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
  tests: tests.map(rel).sort(),
};

if (json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`Pages: ${report.counts.pages}`);
  console.log(`API routes: ${report.counts.apiRoutes}`);
  console.log(`Server actions: ${report.counts.serverActions}`);
  console.log(`Migrations: ${report.counts.migrations}`);
  console.log(`Tests: ${report.counts.tests}`);
  console.log("");
  console.log("Run with --json for full lists.");
}
