"use client";

import Link from "next/link";
import { createClient } from "@/src/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function NavBar() {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <Link href="/" className="font-bold text-teal-600">
          Broadcast Buddy
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href="/broadcast"
            className="text-sm font-medium text-slate-600 hover:text-teal-600"
          >
            שידור
          </Link>
          <Link
            href="/audience"
            className="text-sm font-medium text-slate-600 hover:text-teal-600"
          >
            נמענים
          </Link>
          <Link
            href="/inventory"
            className="text-sm font-medium text-slate-600 hover:text-teal-600"
          >
            מלאי
          </Link>
          <Link
            href="/settings"
            className="text-sm font-medium text-slate-600 hover:text-teal-600"
          >
            הגדרות
          </Link>
          <button
            onClick={handleSignOut}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            התנתקות
          </button>
        </div>
      </div>
    </header>
  );
}
