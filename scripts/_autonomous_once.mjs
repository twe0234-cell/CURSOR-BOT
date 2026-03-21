/**
 * מריץ את מיגרציית ה-DB ואז מוחק את הקובץ הזה (רק אם ההרצה הצליחה).
 */
import { spawnSync } from "child_process";
import { unlinkSync } from "fs";
import { fileURLToPath } from "url";
import { resolve, dirname } from "path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const self = fileURLToPath(import.meta.url);
const target = resolve(root, "scripts/apply-sale-profit-view.mjs");

const r = spawnSync(process.execPath, [target], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});

if (r.status === 0) {
  try {
    unlinkSync(self);
  } catch {
    /* לא קריטי */
  }
}

process.exit(r.status ?? 1);
