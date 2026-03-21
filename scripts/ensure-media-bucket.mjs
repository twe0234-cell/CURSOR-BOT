/**
 * בודק/יוצר bucket "media" (ציבורי) ב-Supabase Storage.
 * הרצה: node scripts/ensure-media-bucket.mjs
 * דורש: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY ב-.env.local
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

config({ path: resolve(root, ".env.local") });
config({ path: resolve(root, ".env") });

const BUCKET = "media";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("חסר NEXT_PUBLIC_SUPABASE_URL או SUPABASE_SERVICE_ROLE_KEY");
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
  console.log(`OK: bucket "${BUCKET}" קיים.`);
} else {
  const { error: createErr } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 5242880,
  });
  if (createErr) {
    console.error("createBucket:", createErr.message);
    process.exit(1);
  }
  console.log(`נוצר bucket "${BUCKET}" (public).`);
}
