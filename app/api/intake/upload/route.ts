import { NextResponse } from "next/server";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { resolveContentType, isImageFile } from "@/lib/upload";

const BUCKET = "media";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const DRAFT_ID_RE = /^[a-f0-9-]{10,40}$/i;

export async function POST(req: Request) {
  try {
    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "שירות לא זמין כרגע" }, { status: 503 });
    }

    const fd = await req.formData();
    const file = fd.get("file");
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "לא נבחר קובץ" }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "קובץ ריק" }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "הקובץ חורג ממגבלת 10MB" }, { status: 413 });
    }
    if (!isImageFile(file)) {
      return NextResponse.json({ error: "ניתן להעלות תמונות בלבד" }, { status: 415 });
    }

    // Optional draft bucket per session — groups uploads of a single submission.
    const draftRaw = (fd.get("draft_id") || "").toString().trim();
    const draftId = DRAFT_ID_RE.test(draftRaw) ? draftRaw : crypto.randomUUID();

    const originalName = file instanceof File && file.name ? file.name : "image";
    const ext = (originalName.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
    const path = `torah-intake/${draftId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error: upErr } = await admin.storage.from(BUCKET).upload(path, file, {
      contentType: resolveContentType(file),
      upsert: false,
    });
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    const { data: { publicUrl } } = admin.storage.from(BUCKET).getPublicUrl(path);
    return NextResponse.json({ path, publicUrl, draftId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 }
    );
  }
}
