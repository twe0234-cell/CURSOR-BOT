import { redirect } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";
import BroadcastTab from "@/app/whatsapp/BroadcastTab";
import GroupManagementTab from "@/app/whatsapp/GroupManagementTab";
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

  const groups = (audience ?? [])
    .filter((a) => a?.wa_chat_id && String(a.wa_chat_id).endsWith("@g.us"))
    .map((a) => ({
      id: a.id,
      wa_chat_id: a.wa_chat_id!,
      name: a.name ?? null,
    }));

  const groupOptions = groups.map((g) => ({ wa_chat_id: g.wa_chat_id, name: g.name }));

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50/50">
      <div className="w-full max-w-screen-xl mx-auto px-4 py-6 sm:py-8 min-w-0 overflow-hidden">
        <Tabs defaultValue="broadcast" className="w-full">
          <TabsList className="mb-6 rounded-xl bg-slate-100 p-1">
            <TabsTrigger value="broadcast" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
              שידור הודעות
            </TabsTrigger>
            <TabsTrigger value="groups" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
              ניהול קבוצות
            </TabsTrigger>
          </TabsList>
          <TabsContent value="broadcast" className="mt-0">
            <BroadcastTab
              key={prefilledMessage}
              allTags={allTags}
              prefilledMessage={prefilledMessage}
              groups={groupOptions}
            />
          </TabsContent>
          <TabsContent value="groups" className="mt-0">
            <GroupManagementTab initialGroups={groups} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
