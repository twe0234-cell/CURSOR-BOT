import { redirect } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";
import SettingsForm from "./SettingsForm";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: settings } = await supabase
    .from("user_settings")
    .select("green_api_id, green_api_token, allowed_tags")
    .eq("user_id", user.id)
    .single();

  const allowedTags = (settings?.allowed_tags ?? []) as string[];

  return (
    <div className="w-full max-w-lg mx-auto px-4 py-6 sm:py-8 min-w-0 overflow-x-hidden">
      <h1 className="mb-6 text-3xl sm:text-4xl font-bold text-teal-800">הגדרות</h1>
      <p className="mb-6 text-slate-600">
        הזן את פרטי Green API לשידור הודעות וואטסאפ
      </p>
      <SettingsForm
        defaultGreenApiId={settings?.green_api_id ?? ""}
        defaultGreenApiToken={settings?.green_api_token ?? ""}
        defaultAllowedTags={allowedTags}
      />
    </div>
  );
}
