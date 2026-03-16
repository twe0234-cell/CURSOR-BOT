import { redirect } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";
import BroadcastClient from "./BroadcastClient";

type Props = { searchParams: Promise<{ message?: string }> };

export default async function BroadcastPage({ searchParams }: Props) {
  const params = await searchParams;
  const prefilledMessage = params?.message ?? "";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: audience } = await supabase
    .from("audience")
    .select("tags, wa_chat_id, name")
    .eq("user_id", user.id);

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
    .map((a) => ({ wa_chat_id: a.wa_chat_id!, name: a.name ?? null }));

  return (
    <BroadcastClient
      key={prefilledMessage}
      allTags={allTags}
      prefilledMessage={prefilledMessage}
      groups={groups}
    />
  );
}
