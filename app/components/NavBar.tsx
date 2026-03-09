"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/src/lib/supabase/client";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Radio,
  Users,
  Mail,
  HandshakeIcon,
  Wallet,
  UserCog,
  Package,
  Settings,
  LogOut,
} from "lucide-react";
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
    { href: "/", label: "לוח בקרה", icon: LayoutDashboard },
    { href: "/broadcast", label: "מנוע שידור", icon: Radio },
    { href: "/audience", label: "ניהול נמענים", icon: Users },
    { href: "/email", label: "דיוור", icon: Mail },
    { href: "/coming-soon", label: "עסקאות ותיווך", icon: HandshakeIcon },
    { href: "/coming-soon", label: "תזרים כספים", icon: Wallet },
    { href: "/coming-soon", label: "סופרים וספקים", icon: UserCog },
    { href: "/inventory", label: "ניהול מלאי סת״ם", icon: Package },
    { href: "/settings", label: "הגדרות", icon: Settings },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-teal-100/80 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 overflow-x-hidden">
      <div className="w-full max-w-7xl mx-auto flex h-14 sm:h-16 items-center justify-between px-3 sm:px-4 min-w-0">
        <Link
          href="/"
          className="flex items-center gap-2 font-bold text-teal-700 transition-colors hover:text-teal-800 shrink-0"
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-teal-100 text-teal-600">
            <LayoutDashboard className="size-4" />
          </span>
          Broadcast Buddy
        </Link>
        <nav className="flex items-center gap-0.5 sm:gap-1 overflow-x-auto scrollbar-hide">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href + label}
              href={href}
              className={cn(
                "flex items-center gap-1 sm:gap-2 rounded-lg px-2 sm:px-3 py-2 text-xs sm:text-sm font-medium transition-all duration-200 shrink-0",
                pathname === href
                  ? "bg-teal-50 text-teal-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-teal-600"
              )}
            >
              <Icon className="size-4" />
              <span className="hidden sm:inline">{label}</span>
            </Link>
          ))}
          <button
            onClick={handleSignOut}
            className="mr-2 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-all hover:bg-red-50 hover:text-red-600 shrink-0"
          >
            <LogOut className="size-4" />
            <span className="hidden sm:inline">התנתקות</span>
          </button>
        </nav>
      </div>
    </header>
  );
}
