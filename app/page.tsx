import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/src/lib/supabase/server";
import { Radio, Settings, Users, Package } from "lucide-react";

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const quickLinks = [
    { href: "/broadcast", label: "שידור", icon: Radio, desc: "שלח הודעות לנמענים" },
    { href: "/audience", label: "נמענים", icon: Users, desc: "נהל רשימת נמענים" },
    { href: "/inventory", label: "מלאי", icon: Package, desc: "נהל מלאי מוצרים" },
    { href: "/settings", label: "הגדרות", icon: Settings, desc: "Green API והגדרות" },
  ];

  return (
    <div className="container mx-auto max-w-4xl px-4 py-12">
      <div className="mb-10">
        <h1 className="text-3xl sm:text-4xl font-bold text-teal-800 mb-2">ברוכים הבאים!</h1>
        <p className="text-muted-foreground">
          מחובר כ־<span className="font-semibold text-teal-600">{user.email}</span>
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {quickLinks.map(({ href, label, icon: Icon, desc }) => (
          <Link
            key={href}
            href={href}
            className="group flex items-center gap-4 rounded-2xl border border-teal-100 bg-white p-6 shadow-sm transition-all duration-200 hover:border-teal-200 hover:shadow-md hover:-translate-y-0.5"
          >
            <div className="flex size-14 items-center justify-center rounded-xl bg-teal-100 text-teal-600 transition-colors group-hover:bg-teal-200">
              <Icon className="size-7" />
            </div>
            <div>
              <h2 className="font-semibold text-teal-800 group-hover:text-teal-700">{label}</h2>
              <p className="text-sm text-muted-foreground">{desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
