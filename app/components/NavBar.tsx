"use client";

import { motion } from "framer-motion";
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
  BookOpen,
  Users,
  ArrowLeftRight,
  Home,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function NavBar() {
  const router = useRouter();
  const pathname = usePathname();


  // Public intake routes render their own chrome — no NavBar.
  if (pathname?.startsWith("/intake")) return null;
  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  /** Order: core → תקשורת → ERP */
  const navItems = [
    { href: "/", label: "לוח בקרה", icon: Home },
    { href: "/transactions", label: "תנועות", icon: ArrowLeftRight },
    { href: "/audience", label: "נמענים", icon: Users },
    { href: "/whatsapp", label: "WhatsApp", icon: Radio },
    { href: "/email", label: "אימייל", icon: Mail },
    { href: "/calculator", label: "מחשבון", icon: Calculator },
    { href: "/crm", label: "CRM", icon: HandshakeIcon },
    { href: "/sales", label: "מכירות ותזרים", icon: Wallet },
    { href: "/investments", label: "תיק השקעות", icon: TrendingUp },
    { href: "/soferim", label: "מאגר סופרים", icon: PenLine },
    { href: "/market", label: "מאגר ספרי תורה", icon: ScrollText },
    { href: "/torah", label: "פרויקטי ס״ת", icon: BookOpen },
    { href: "/inventory", label: "ניהול מלאי סת״ם", icon: Package },
    { href: "/settings", label: "הגדרות", icon: Settings },
  ];

  return (
    <header className="sticky top-0 z-50 glass border-b border-[var(--glass-border)] shadow-[0_1px_0_oklch(0.26_0.068_265_/_6%)] animate-slide-down min-w-0">
      <div className="w-full max-w-[min(100%,90rem)] mx-auto flex h-[3.25rem] sm:h-16 items-center justify-between gap-1.5 px-2 sm:px-4 min-w-0">
        <Link
          href="/"
          className="flex items-center gap-2 sm:gap-2.5 shrink-0 group/logo"
          aria-label="לוח בקרה — דף הבית"
        >
          <span className="relative flex size-8 sm:size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/20 ring-1 ring-primary/10 transition-all duration-300 group-hover/logo:shadow-lg group-hover/logo:shadow-primary/30 group-hover/logo:ring-accent/35 group-hover/logo:-translate-y-px">
            <LayoutDashboard className="size-4 sm:size-[1.125rem]" strokeWidth={2.25} />
          </span>
          <span className="font-bold text-[14px] sm:text-[15px] tracking-tight text-foreground transition-colors duration-200 group-hover/logo:text-primary hidden sm:block">
            הידור הסת״ם
          </span>
        </Link>

        <nav
          className={cn(
            "flex min-w-0 flex-1 flex-nowrap overflow-x-auto items-center gap-0 sm:gap-0.5 py-0.5 overscroll-x-contain",
            "scroll-ps-1 scroll-pe-1",
            "[scrollbar-width:thin]",
            "[scrollbar-color:var(--gold-light)_transparent]",
            "[&::-webkit-scrollbar]:h-[3px] [&::-webkit-scrollbar]:w-0",
            "[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gold-light/60"
          )}
          aria-label="ניווט ראשי"
        >
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive =
              pathname === href ||
              (href !== "/" && pathname.startsWith(href + "/"));

            return (
              <Link
                key={href + label}
                href={href}
                title={label}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "group/nav-item relative flex shrink-0 flex-nowrap items-center gap-1 sm:gap-1.5 whitespace-nowrap rounded-lg px-1.5 sm:px-2.5 py-2 text-[11px] sm:text-sm font-semibold",
                  "transition-all duration-200 ease-out",
                  "ring-1 ring-transparent hover:ring-border/50",
                  "hover:-translate-y-px",
                  isActive
                    ? [
                        "bg-primary text-primary-foreground",
                        "shadow-sm shadow-primary/30",
                        "ring-primary/20",
                      ]
                    : [
                        "text-muted-foreground",
                        "hover:bg-muted/80 hover:text-foreground",
                      ]
                )}
              >
                <motion.span
                  className="inline-flex shrink-0"
                  whileHover={{ scale: 1.1 }}
                  transition={{ type: "spring", stiffness: 420, damping: 22 }}
                >
                  <Icon
                    className={cn(
                      "size-3.5 sm:size-4 shrink-0 opacity-90 transition-colors duration-200",
                      isActive
                        ? "text-primary-foreground"
                        : "text-muted-foreground group-hover/nav-item:text-gold"
                    )}
                    strokeWidth={isActive ? 2.25 : 2}
                  />
                </motion.span>
                <span className="hidden min-[420px]:inline sm:inline whitespace-nowrap">
                  {label}
                </span>

                {isActive && (
                  <span
                    className="absolute bottom-0.5 left-1/2 h-0.5 w-[60%] max-w-[3rem] -translate-x-1/2 rounded-full bg-accent opacity-90"
                    aria-hidden
                  />
                )}
              </Link>
            );
          })}

          <span className="mx-0.5 sm:mx-1 h-5 w-px bg-border/70 shrink-0 hidden min-[420px]:block" />

          <button
            type="button"
            onClick={handleSignOut}
            title="התנתקות"
            className="group/nav-out flex shrink-0 flex-nowrap items-center gap-1 sm:gap-1.5 whitespace-nowrap rounded-lg px-1.5 sm:px-2.5 py-2 text-[11px] sm:text-sm font-semibold text-muted-foreground transition-all duration-200 hover:bg-destructive/10 hover:text-destructive hover:ring-1 hover:ring-destructive/15 hover:-translate-y-px"
          >
            <motion.span
              className="inline-flex shrink-0"
              whileHover={{ scale: 1.08 }}
              transition={{ type: "spring", stiffness: 400, damping: 20 }}
            >
              <LogOut className="size-3.5 sm:size-4 shrink-0 transition-colors group-hover/nav-out:text-destructive" />
            </motion.span>
            <span className="hidden min-[420px]:inline sm:inline">התנתקות</span>
          </button>
        </nav>
      </div>

      <div className="gold-line opacity-50" />
    </header>
  );
}
