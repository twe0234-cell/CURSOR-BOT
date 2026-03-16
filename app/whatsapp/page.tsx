import { redirect } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";
import BroadcastClient from "@/app/broadcast/BroadcastClient";
import AudienceClient from "@/app/audience/AudienceClient";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Props = { searchParams: Promise<{ message?: string }> };

export default async function WhatsAppPage({ searchParams }: Props) {
  const params = await searchParams;
  const prefilledMessage = params?.message ?? "";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: audience } = await supabase
    .from("audience")
    .select("id, name, wa_chat_id, tags, active")
    .eq("user_id", user.id)
    .order("name");

  const { data: settings } = await supabase
    .from("user_settings")
    .select("allowed_tags")
    .eq("user_id", user.id)
    .single();

  const allowedTags = Array.isArray(settings?.allowed_tags)
    ? (settings.allowed_tags as string[])
    : [];
  const audienceTags = [...new Set((audience ?? []).flatMap((a) => (a?.tags ?? []) as string[]))];
  const allTags = [...new Set([...allowedTags, ...audienceTags])].sort();

  const initialAudience = (audience ?? []).map((a) => ({
    id: a.id,
    name: a.name ?? null,
    wa_chat_id: a.wa_chat_id ?? "",
    tags: (a.tags ?? []) as string[],
    active: a.active ?? true,
  }));

  const groups = (audience ?? [])
    .filter((a) => a?.wa_chat_id && String(a.wa_chat_id).endsWith("@g.us"))
    .map((a) => ({ wa_chat_id: a.wa_chat_id!, name: a.name ?? null }));

  return (
    <div className="w-full max-w-screen-xl mx-auto px-4 py-6 sm:py-8 min-w-0 overflow-hidden">
      <Tabs defaultValue="broadcast" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="broadcast">יצירת שידור</TabsTrigger>
          <TabsTrigger value="audience">נמענים וקבוצות</TabsTrigger>
        </TabsList>
        <TabsContent value="broadcast" className="mt-0">
          <BroadcastClient
            key={prefilledMessage}
            allTags={allTags}
            prefilledMessage={prefilledMessage}
            groups={groups}
          />
        </TabsContent>
        <TabsContent value="audience" className="mt-0">
          <AudienceClient
            initialAudience={initialAudience}
            allTags={allTags}
            allowedTags={allowedTags}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
