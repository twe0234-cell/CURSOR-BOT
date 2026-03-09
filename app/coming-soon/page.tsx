import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/src/lib/supabase/server";
import { ConstructionIcon } from "lucide-react";

export default async function ComingSoonPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
      <div className="flex size-20 items-center justify-center rounded-full bg-teal-100 mb-6">
        <ConstructionIcon className="size-10 text-teal-600" />
      </div>
      <h1 className="text-2xl font-bold text-teal-800 mb-2">בקרוב</h1>
      <p className="text-muted-foreground text-center max-w-sm mb-6">
        המודול הזה נמצא בפיתוח ויופעל בגרסה הבאה.
      </p>
      <Link href="/" className="text-teal-600 font-medium hover:underline">
        ← חזרה לדשבורד
      </Link>
    </div>
  );
}
