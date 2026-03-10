import { NextResponse } from "next/server";
import { createClient } from "@/src/lib/supabase/server";

const BUCKET = "media";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file" }, { status: 400 });
    }

    const validTypes = ["image/png", "image/x-icon", "image/vnd.microsoft.icon"];
    if (!validTypes.includes(file.type)) {
      return NextResponse.json({ error: "PNG or ICO only" }, { status: 400 });
    }

    const ext = file.name.endsWith(".ico") ? "ico" : "png";
    const path = `branding/logo.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);

    const { error: updateError } = await supabase
      .from("sys_settings")
      .upsert(
        { id: "default", logo_url: publicUrl, updated_at: new Date().toISOString() },
        { onConflict: "id" }
      );

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ url: publicUrl });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 }
    );
  }
}
