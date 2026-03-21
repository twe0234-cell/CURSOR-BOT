"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/src/lib/supabase/client";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Radio,
  Mail,
  HandshakeIcon,
  Wallet,
  Package,
  Calculator,
  Settings,
  LogOut,
  TrendingUp,
  PenLine,
  ScrollText,
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
    { href: "/whatsapp", label: "WhatsApp", icon: Radio },
    { href: "/email", label: "דיוור", icon: Mail },
    { href: "/calculator", label: "מחשבון", icon: Calculator },
    { href: "/crm", label: "CRM", icon: HandshakeIcon },
    { href: "/sales", label: "מכירות ותזרים", icon: Wallet },
    { href: "/investments", label: "תיק השקעות", icon: TrendingUp },
    { href: "/soferim", label: "מאגר סופרים", icon: PenLine },
    { href: "/market", label: "שוק ספרי תורה", icon: ScrollText },
    { href: "/inventory", label: "ניהול מלאי סת״ם", icon: Package },
    { href: "/settings", label: "הגדרות", icon: Settings },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-sky-200/60 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 overflow-x-hidden">
      <div className="w-full max-w-7xl mx-auto flex h-14 sm:h-16 items-center justify-between px-3 sm:px-4 min-w-0">
        <Link
          href="/"
          className="flex items-center gap-2 font-bold text-primary transition-colors hover:text-primary/90 shrink-0"
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
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
                pathname === href || (href !== "/" && pathname.startsWith(href + "/"))
                  ? "bg-primary/10 text-primary font-semibold"
                  : "text-muted-foreground hover:bg-muted hover:text-primary"
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
