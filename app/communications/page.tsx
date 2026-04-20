import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";
import CommunicationsHubClient from "./CommunicationsHubClient";

type Search = { ch?: string; emailTab?: string; message?: string };

export default async function CommunicationsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: contacts } = await supabase
    .from("email_contacts")
    .select("id, email, name, phone, tags, subscribed, source, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

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

  const { data: sysSettings } = await supabase
    .from("sys_settings")
    .select("email_signature")
    .eq("id", "default")
    .single();

  const { data: userSettings } = await supabase
    .from("user_settings")
    .select("email_tag_presets, allowed_tags")
    .eq("user_id", user.id)
    .single();

  const { data: audience } = await supabase
    .from("audience")
    .select("id, name, wa_chat_id, tags, active")
    .eq("user_id", user.id)
    .order("name");

  const allowedTags = Array.isArray(userSettings?.allowed_tags)
    ? (userSettings.allowed_tags as string[])
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

  const prefilledWaMessage = typeof params.message === "string" ? params.message : "";

  return (
    <Suspense fallback={<div className="min-h-screen bg-background animate-pulse" />}>
      <CommunicationsHubClient
        initialContacts={mapped}
        emailSignature={sysSettings?.email_signature ?? null}
        emailTagPresets={
          Array.isArray(userSettings?.email_tag_presets)
            ? (userSettings.email_tag_presets as string[])
            : []
        }
        waAllowedTags={allowedTags}
        waAllTags={allTags}
        waGroups={groups}
        waGroupOptions={groupOptions}
        prefilledWaMessage={prefilledWaMessage}
      />
    </Suspense>
  );
}
