/**
 * Ensures `media` bucket (public) + applies Storage RLS policies via Postgres.
 * Run: node scripts/apply-storage-rls.mjs
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (non-empty)
 * Plus: DATABASE_URL | DIRECT_URL | POSTGRES_URL | SUPABASE_DB_PASSWORD (for db.*.supabase.co)
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import pg from "pg";

const { Client } = pg;

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

config({ path: resolve(root, ".env.local") });
config({ path: resolve(root, ".env") });

const BUCKET = "media";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function extractProjectRefFromSupabaseUrl(supabaseUrl) {
  try {
    const u = new URL(supabaseUrl);
    const host = u.hostname;
    const m = host.match(/^([^.]+)\.supabase\.co$/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

function resolveDatabaseUrl() {
  const direct =
    process.env.DATABASE_URL ||
    process.env.DIRECT_URL ||
    process.env.POSTGRES_URL ||
    process.env.SUPABASE_DB_URL ||
    null;
  if (direct) return direct;

  const password =
    process.env.SUPABASE_DB_PASSWORD ||
    process.env.POSTGRES_PASSWORD ||
    process.env.DATABASE_PASSWORD ||
    null;
  const ref = url ? extractProjectRefFromSupabaseUrl(url) : null;
  if (password && ref) {
    const enc = encodeURIComponent(password);
    return `postgresql://postgres:${enc}@db.${ref}.supabase.co:5432/postgres`;
  }
  return null;
}

if (!url || !serviceKey || !String(serviceKey).trim()) {
  console.error(
    "Missing or empty SUPABASE_SERVICE_ROLE_KEY (and/or NEXT_PUBLIC_SUPABASE_URL). Paste the service_role key from Supabase Dashboard → Project Settings → API."
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
if (listErr) {
  console.error("listBuckets:", listErr.message);
  process.exit(1);
}

const exists = buckets?.some((b) => b.name === BUCKET);
if (exists) {
  console.log(`OK: bucket "${BUCKET}" exists.`);
  const { error: updateErr } = await supabase.storage.updateBucket(BUCKET, {
    public: true,
  });
  if (updateErr) {
    console.warn("updateBucket (public):", updateErr.message);
  }
} else {
  const { error: createErr } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 5242880,
  });
  if (createErr) {
    console.error("createBucket:", createErr.message);
    process.exit(1);
  }
  console.log(`Created bucket "${BUCKET}" (public).`);
}

const databaseUrl = resolveDatabaseUrl();
if (!databaseUrl) {
  console.error(
    "Missing Postgres connection. Set DATABASE_URL (Supabase → Database → URI) or SUPABASE_DB_PASSWORD in .env.local to apply RLS SQL."
  );
  process.exit(1);
}

const sqlPath = resolve(root, "supabase/migrations/033_storage_media_rls_policies.sql");
let sql;
try {
  sql = readFileSync(sqlPath, "utf8");
} catch (e) {
  console.error("Cannot read migration file:", sqlPath, e);
  process.exit(1);
}

const client = new Client({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  await client.query(sql);
  console.log("OK: applied 033_storage_media_rls_policies.sql");
} catch (e) {
  console.error("Postgres error:", e);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}

console.log("apply-storage-rls: success.");
