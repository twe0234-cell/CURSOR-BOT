import { createAdminClient } from "@/src/lib/supabase/admin";

function parseDeviceType(ua: string): "mobile" | "tablet" | "desktop" | "unknown" {
  if (!ua) return "unknown";
  const u = ua.toLowerCase();
  if (/ipad|tablet|kindle|playbook|silk|(android(?!.*mobile))/i.test(u)) return "tablet";
  if (/mobile|android|iphone|ipod|blackberry|phone|windows phone/i.test(u)) return "mobile";
  if (/mozilla|chrome|safari|firefox|edge|opera|msie|trident/i.test(u)) return "desktop";
  return "unknown";
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ logId: string }> }
) {
  const { logId } = await params;
  if (!logId) return new Response(null, { status: 400 });

  const ua = req.headers.get("user-agent") ?? "";
  const deviceType = parseDeviceType(ua);

  const supabase = createAdminClient();
  if (supabase) {
    await supabase
      .from("email_logs")
      .update({
        status: "open",
        opened_at: new Date().toISOString(),
        user_agent: ua.slice(0, 512), // cap length
        device_type: deviceType,
      })
      .eq("id", logId)
      .eq("status", "sent");
  }

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
