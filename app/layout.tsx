import type { Metadata } from "next";
import { Heebo, Geist_Mono } from "next/font/google";
import { createClient } from "@/src/lib/supabase/server";
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
    const supabase = await createClient();
    const { data } = await supabase
      .from("sys_settings")
      .select("logo_url")
      .eq("id", "default")
      .single();

    const logoUrl = data?.logo_url?.trim() || undefined;
    return {
      title: APP_TITLE,
      description: APP_DESCRIPTION,
      icons: logoUrl ? { icon: logoUrl, apple: logoUrl, shortcut: logoUrl } : undefined,
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
    <html lang="he" dir="rtl" className="overflow-x-hidden">
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
