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

    const ext = file.name.split(".").pop() || "bin";
    const path = `investments/${user.id}/${Date.now()}.${ext}`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, {
        contentType: file.type || "application/octet-stream",
        upsert: true,
      });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return NextResponse.json({ url: publicUrl });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 }
    );
  }
}
