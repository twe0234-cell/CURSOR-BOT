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
  BookOpen,
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
    { href: "/",            label: "לוח בקרה",        icon: LayoutDashboard },
    { href: "/whatsapp",    label: "WhatsApp",         icon: Radio           },
    { href: "/email",       label: "דיוור",            icon: Mail            },
    { href: "/calculator",  label: "מחשבון",           icon: Calculator      },
    { href: "/crm",         label: "CRM",              icon: HandshakeIcon   },
    { href: "/sales",       label: "מכירות ותזרים",    icon: Wallet          },
    { href: "/investments", label: "תיק השקעות",       icon: TrendingUp      },
    { href: "/soferim",     label: "מאגר סופרים",      icon: PenLine         },
    { href: "/market",      label: "מאגר ספרי תורה",   icon: ScrollText      },
    { href: "/torah",       label: "פרויקטי ס״ת",      icon: BookOpen        },
    { href: "/inventory",   label: "ניהול מלאי סת״ם",  icon: Package         },
    { href: "/settings",    label: "הגדרות",           icon: Settings        },
  ];

  return (
    <header className="sticky top-0 z-50 overflow-x-hidden glass border-b border-[var(--glass-border)] animate-slide-down">
      <div className="w-full max-w-7xl mx-auto flex h-14 sm:h-16 items-center justify-between px-3 sm:px-4 min-w-0">

        {/* Logo */}
        <Link
          href="/"
          className="flex items-center gap-2.5 shrink-0 group/logo"
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm shadow-primary/30 transition-all duration-300 group-hover/logo:shadow-md group-hover/logo:shadow-primary/40 group-hover/logo:-translate-y-px">
            <LayoutDashboard className="size-4" />
          </span>
          <span className="font-bold text-[15px] tracking-tight text-foreground transition-colors duration-200 group-hover/logo:text-gold hidden md:block">
            הידור הסת״ם
          </span>
        </Link>

        {/* Navigation */}
        <nav className="flex items-center gap-0.5 sm:gap-0.5 overflow-x-auto scrollbar-hide">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive =
              pathname === href ||
              (href !== "/" && pathname.startsWith(href + "/"));

            return (
              <Link
                key={href + label}
                href={href}
                className={cn(
                  "relative flex items-center gap-1.5 rounded-lg px-2 sm:px-2.5 py-2 text-xs sm:text-sm font-medium shrink-0",
                  "transition-all duration-250 ease-out",
                  "hover:-translate-y-px",
                  isActive
                    ? [
                        "bg-primary text-primary-foreground",
                        "shadow-sm shadow-primary/25",
                      ]
                    : [
                        "text-muted-foreground",
                        "hover:bg-muted/70 hover:text-foreground",
                      ]
                )}
              >
                <Icon className="size-3.5 sm:size-4 shrink-0" />
                <span className="hidden lg:inline">{label}</span>

                {/* Active gold underline pip */}
                {isActive && (
                  <span className="absolute bottom-1 left-1/2 -translate-x-1/2 size-1 rounded-full bg-accent opacity-80" />
                )}
              </Link>
            );
          })}

          {/* Divider */}
          <span className="mx-1 h-5 w-px bg-border/60 shrink-0 hidden sm:block" />

          {/* Sign out */}
          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 rounded-lg px-2 sm:px-2.5 py-2 text-xs sm:text-sm font-medium text-muted-foreground shrink-0 transition-all duration-250 hover:bg-destructive/8 hover:text-destructive hover:-translate-y-px"
          >
            <LogOut className="size-3.5 sm:size-4 shrink-0" />
            <span className="hidden lg:inline">התנתקות</span>
          </button>
        </nav>
      </div>

      {/* Gold accent line at bottom */}
      <div className="gold-line opacity-40" />
    </header>
  );
}
