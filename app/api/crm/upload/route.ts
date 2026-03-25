/**
 * POST /api/crm/upload
 *
 * General-purpose CRM document upload (scripts, PDFs, images).
 * Accepts multipart/form-data with a `file` field.
 * Returns { url } on success, { error } on failure.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/src/lib/supabase/server";
import { toErrorMessage } from "@/src/lib/errors";

const BUCKET = "media";
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB – generous limit for documents/PDFs

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Size guard – prevents accidental large uploads
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "הקובץ חורג מ-20MB" },
        { status: 400 }
      );
    }

    const ext = file.name.split(".").pop() || "bin";
    const path = `crm/${user.id}/${Date.now()}.${ext}`;

    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: true,
    });

    if (error) {
      // StorageError is not a PostgREST shape — surface message directly
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return NextResponse.json({ url: publicUrl });
  } catch (err) {
    return NextResponse.json({ error: toErrorMessage(err) }, { status: 500 });
  }
}
