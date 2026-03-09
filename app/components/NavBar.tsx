"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/src/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Radio, Users, Package, Settings, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

export default function NavBar() {
  const router = useRouter();
  const pathname = usePathname();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const navItems = [
    { href: "/broadcast", label: "שידור", icon: Radio },
    { href: "/audience", label: "נמענים", icon: Users },
    { href: "/inventory", label: "מלאי", icon: Package },
    { href: "/settings", label: "הגדרות", icon: Settings },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-teal-100/80 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link
          href="/"
          className="flex items-center gap-2 font-bold text-teal-700 transition-colors hover:text-teal-800"
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-teal-100 text-teal-600">
            <Radio className="size-4" />
          </span>
          Broadcast Buddy
        </Link>
        <nav className="flex items-center gap-1">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200",
                pathname === href
                  ? "bg-teal-50 text-teal-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-teal-600"
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
          <button
            onClick={handleSignOut}
            className="mr-2 flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition-all hover:bg-red-50 hover:text-red-600"
          >
            <LogOut className="size-4" />
            התנתקות
          </button>
        </nav>
      </div>
    </header>
  );
}
