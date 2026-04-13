import type { Metadata } from "next";
import { Heebo, Geist_Mono } from "next/font/google";
import { createAdminClient } from "@/src/lib/supabase/admin";
import "./globals.css";
import NavBar from "./components/NavBar";
import { Toaster } from "@/components/ui/sonner";

const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["latin", "hebrew"],
  weight: ["300", "400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const APP_TITLE = "הידור הסת״ם";
const APP_DESCRIPTION = "מערכת ניהול חכמה לסת״ם";

export async function generateMetadata(): Promise<Metadata> {
  try {
    const admin = createAdminClient();
    const { data } = admin
      ? await admin
          .from("sys_settings")
          .select("logo_url, updated_at")
          .eq("id", "default")
          .single()
      : { data: null };

    const logoUrl = data?.logo_url?.trim() || undefined;
    const cacheVersion = data?.updated_at
      ? encodeURIComponent(new Date(data.updated_at).toISOString())
      : undefined;
    const iconUrl =
      logoUrl && cacheVersion
        ? `${logoUrl}${logoUrl.includes("?") ? "&" : "?"}v=${cacheVersion}`
        : logoUrl;
    return {
      title: APP_TITLE,
      description: APP_DESCRIPTION,
      icons: iconUrl ? { icon: iconUrl, apple: iconUrl, shortcut: iconUrl } : undefined,
    };
  } catch {
    return {
      title: APP_TITLE,
      description: APP_DESCRIPTION,
    };
  }
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl">
      <body
        className={`${heebo.variable} ${geistMono.variable} font-sans antialiased overflow-x-hidden min-w-0 bg-background`}
      >
        <NavBar />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
