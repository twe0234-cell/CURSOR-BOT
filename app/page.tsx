import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/src/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm text-center">
        <h1 className="mb-4 text-2xl font-bold text-slate-800">
          ברוכים הבאים!
        </h1>
        <p className="mb-6 text-slate-600">
          מחובר כ־<span className="font-medium text-teal-600">{user.email}</span>
        </p>
        <Link
          href="/settings"
          className="inline-block rounded-lg bg-teal-600 px-6 py-2 font-medium text-white transition-colors hover:bg-teal-700"
        >
          הגדרות
        </Link>
      </div>
    </div>
  );
}
