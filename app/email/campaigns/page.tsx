import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/src/lib/supabase/server";
import CampaignsClient from "./CampaignsClient";
import { Button } from "@/components/ui/button";

export default async function EmailCampaignsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: contacts } = await supabase
    .from("email_contacts")
    .select("id, email, name, phone, tags, subscribed, source, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const { data: sysSettings } = await supabase
    .from("sys_settings")
    .select("email_signature")
    .eq("id", "default")
    .single();

  const { data: userSettings } = await supabase
    .from("user_settings")
    .select("email_tag_presets")
    .eq("user_id", user.id)
    .single();

  const mapped = (contacts ?? []).map((c) => ({
    id: c.id,
    email: c.email ?? "",
    name: c.name ?? null,
    phone: c.phone ?? null,
    tags: (c.tags ?? []) as string[],
    subscribed: c.subscribed ?? true,
    source: c.source ?? null,
    created_at: c.created_at ?? "",
  }));

  return (
    <div className="min-h-screen bg-slate-50/50" dir="rtl">
      <div className="w-full max-w-6xl mx-auto px-4 py-6 sm:py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-800">קמפיין אימייל</h1>
            <p className="mt-1 text-muted-foreground">
              כתוב ושלוח קמפיינים עם עורך עשיר
            </p>
          </div>
          <Link href="/email">
            <Button variant="outline" className="rounded-xl">חזרה לדיוור</Button>
          </Link>
        </div>
        <Suspense
          fallback={
            <div className="py-16 text-center text-muted-foreground rounded-xl border border-dashed">
              טוען עורך קמפיין…
            </div>
          }
        >
          <CampaignsClient
            initialContacts={mapped}
            signature={sysSettings?.email_signature ?? null}
            initialEmailTagPresets={
              Array.isArray(userSettings?.email_tag_presets)
                ? (userSettings.email_tag_presets as string[])
                : []
            }
          />
        </Suspense>
      </div>
    </div>
  );
}
