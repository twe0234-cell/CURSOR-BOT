import { redirect } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ logId: string }> }
) {
  const { logId } = await params;
  if (!logId) return new Response(null, { status: 400 });

  const supabase = await createClient();
  await supabase
    .from("email_logs")
    .update({ status: "open", opened_at: new Date().toISOString() })
    .eq("id", logId)
    .eq("status", "sent");

  const pixel = Buffer.from(
    "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
    "base64"
  );
  return new Response(pixel, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store",
    },
  });
}
