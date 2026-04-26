import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const migrationsDir = join(root, "supabase", "migrations");
const strict = process.argv.includes("--strict");

const riskyPatterns = [
  { id: "drop", pattern: /\bdrop\s+(table|schema|view|function|policy|type|column|constraint)\b/i },
  { id: "truncate", pattern: /\btruncate\b/i },
  { id: "delete", pattern: /\bdelete\s+from\b/i },
  { id: "alter-type", pattern: /\balter\s+type\b/i },
  { id: "rename", pattern: /\brename\s+(column|table|constraint|to)\b/i },
  { id: "force-rls-off", pattern: /\bdisable\s+row\s+level\s+security\b/i },
];

const files = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

const numbered = files
  .map((name) => {
    const match = name.match(/^(\d+)[_-]/);
    return match ? { name, number: Number(match[1]) } : null;
  })
  .filter(Boolean);

const duplicateNumbers = numbered
  .filter((entry, index, all) => all.findIndex((other) => other.number === entry.number) !== index)
  .map((entry) => entry.name);

const findings = [];

for (const file of files) {
  const sql = readFileSync(join(migrationsDir, file), "utf8");
  const lines = sql.split(/\r?\n/);

  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("--")) continue;

    for (const rule of riskyPatterns) {
      if (rule.pattern.test(trimmed)) {
        findings.push({
          file,
          line: index + 1,
          rule: rule.id,
          text: trimmed.slice(0, 180),
        });
      }
    }
  }
}

const report = {
  migrationsDir,
  migrationCount: files.length,
  duplicateNumbers,
  findings,
};

console.log(JSON.stringify(report, null, 2));

if (strict && (duplicateNumbers.length > 0 || findings.length > 0)) {
  process.exitCode = 1;
}
