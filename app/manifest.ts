import type { MetadataRoute } from "next";
import { createAdminClient } from "@/src/lib/supabase/admin";

const APP_NAME = "הידור הסת״ם";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  let logoUrl = "";
  try {
    const admin = createAdminClient();
    if (admin) {
      const { data } = await admin
        .from("sys_settings")
        .select("logo_url, updated_at")
        .eq("id", "default")
        .single();
      const raw = (data?.logo_url ?? "").trim();
      const version = data?.updated_at
        ? encodeURIComponent(new Date(data.updated_at).toISOString())
        : "";
      logoUrl = raw
        ? `${raw}${raw.includes("?") ? "&" : "?"}v=${version}`
        : "";
    }
  } catch {
    // fallback to default manifest without custom icon
  }

  return {
    name: APP_NAME,
    short_name: APP_NAME,
    description: "מערכת ניהול חכמה לסת״ם",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0ea5e9",
    lang: "he",
    dir: "rtl",
    icons: logoUrl
      ? [
          { src: logoUrl, sizes: "192x192", type: "image/png", purpose: "any" },
          { src: logoUrl, sizes: "512x512", type: "image/png", purpose: "maskable" },
        ]
      : [],
  };
}
