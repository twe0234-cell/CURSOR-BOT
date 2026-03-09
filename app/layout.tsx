import type { Metadata } from "next";
import { Heebo, Geist_Mono } from "next/font/google";
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

export const metadata: Metadata = {
  title: "Broadcast Buddy",
  description: "מערכת שידור הודעות וואטסאפ",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl">
      <body
        className={`${heebo.variable} ${geistMono.variable} font-sans antialiased`}
      >
        <NavBar />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
