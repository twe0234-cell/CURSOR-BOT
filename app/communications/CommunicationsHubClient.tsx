"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ContactsTab from "@/app/email/ContactsTab";
import CampaignsClient from "@/app/email/campaigns/CampaignsClient";
import BroadcastTab from "@/app/whatsapp/BroadcastTab";
import GroupManagementTab from "@/app/whatsapp/GroupManagementTab";

export type EmailContactRow = {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  tags: string[];
  subscribed: boolean;
  source: string | null;
  created_at: string;
};

type WaGroup = { id: string; wa_chat_id: string; name: string | null };

type Props = {
  initialContacts: EmailContactRow[];
  emailSignature: string | null;
  emailTagPresets: string[];
  waAllowedTags: string[];
  waAllTags: string[];
  waGroups: WaGroup[];
  waGroupOptions: { wa_chat_id: string; name: string | null }[];
  prefilledWaMessage: string;
};

export default function CommunicationsHubClient({
  initialContacts,
  emailSignature,
  emailTagPresets,
  waAllowedTags,
  waAllTags,
  waGroups,
  waGroupOptions,
  prefilledWaMessage,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ch = searchParams.get("ch") === "wa" ? "wa" : "email";
  const emailTab = searchParams.get("emailTab") === "contacts" ? "contacts" : "compose";

  function setQuery(patch: Record<string, string | null>) {
    const p = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") p.delete(k);
      else p.set(k, v);
    }
    router.push(`/communications?${p.toString()}`);
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-6 sm:py-8 min-w-0 overflow-x-hidden">
        <div className="mb-6 sm:mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-2">
              מרכז תקשורת
            </h1>
            <p className="text-muted-foreground text-[15px] max-w-xl">
              אימייל ווואטסאפ במקום אחד — כתיבה, שידור וניהול קהל
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/audience"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-input bg-background px-4 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground"
            >
              ניהול קהל
            </Link>
            <Link
              href="/broadcast"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-input bg-background px-4 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground"
            >
              תזמון שידור (דיוור)
            </Link>
          </div>
        </div>

        <Tabs
          value={ch}
          onValueChange={(v) => {
            if (v === "wa") setQuery({ ch: "wa" });
            else setQuery({ ch: "email", emailTab: "compose" });
          }}
          className="w-full"
        >
          <TabsList className="mb-4 w-full max-w-md rounded-xl bg-muted p-1">
            <TabsTrigger value="email" className="flex-1 rounded-lg">
              אימייל
            </TabsTrigger>
            <TabsTrigger value="wa" className="flex-1 rounded-lg">
              וואטסאפ
            </TabsTrigger>
          </TabsList>

          <TabsContent value="email" className="mt-0">
            <Tabs
              value={emailTab}
              onValueChange={(v) => setQuery({ ch: "email", emailTab: v })}
              className="w-full"
            >
              <TabsList className="mb-4 rounded-xl bg-slate-100 p-1">
                <TabsTrigger value="compose" className="rounded-lg data-[state=active]:bg-white">
                  כתיבה ושליחה
                </TabsTrigger>
                <TabsTrigger value="contacts" className="rounded-lg data-[state=active]:bg-white">
                  אנשי קשר
                </TabsTrigger>
              </TabsList>
              <TabsContent value="contacts" className="mt-0">
                <ContactsTab initialContacts={initialContacts} />
              </TabsContent>
              <TabsContent value="compose" className="mt-0">
                <CampaignsClient
                  initialContacts={initialContacts}
                  signature={emailSignature}
                  initialEmailTagPresets={emailTagPresets}
                />
              </TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="wa" className="mt-0">
            <Tabs defaultValue="broadcast" className="w-full">
              <TabsList className="mb-6 rounded-xl bg-slate-100 p-1">
                <TabsTrigger value="broadcast" className="rounded-lg data-[state=active]:bg-white">
                  שידור הודעות
                </TabsTrigger>
                <TabsTrigger value="groups" className="rounded-lg data-[state=active]:bg-white">
                  ניהול קבוצות
                </TabsTrigger>
              </TabsList>
              <TabsContent value="broadcast" className="mt-0">
                <BroadcastTab
                  key={prefilledWaMessage}
                  allTags={waAllTags}
                  allowedTags={waAllowedTags}
                  prefilledMessage={prefilledWaMessage}
                  groups={waGroupOptions}
                />
              </TabsContent>
              <TabsContent value="groups" className="mt-0">
                <GroupManagementTab initialGroups={waGroups} />
              </TabsContent>
            </Tabs>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
