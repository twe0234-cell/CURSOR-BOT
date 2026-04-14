import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";
import BroadcastTab from "@/app/whatsapp/BroadcastTab";
import GroupManagementTab from "@/app/whatsapp/GroupManagementTab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

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
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight">שידור וואטסאפ</h1>
            <p className="mt-1 text-muted-foreground text-[15px]">
              שליחת הודעות לנמענים ולקבוצות
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Link href="/audience">
              <Button variant="outline" className="rounded-xl">ניהול קהל</Button>
            </Link>
          </div>
        </div>
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
              allowedTags={allowedTags}
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
