import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/src/lib/supabase/server";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import BrandingSection from "./BrandingSection";
import BusinessProfileTab from "./BusinessProfileTab";
import ApiIntegrationsTab from "./ApiIntegrationsTab";
import LogExportButton from "./LogExportButton";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: settings } = await supabase
    .from("user_settings")
    .select("green_api_id, green_api_token, allowed_tags, gmail_refresh_token, gmail_email")
    .eq("user_id", user.id)
    .single();

  const allowedTags = (settings?.allowed_tags ?? []) as string[];

  const { data: sysSettings } = await supabase
    .from("sys_settings")
    .select("logo_url, email_signature, whatsapp_number")
    .eq("id", "default")
    .single();

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-6 sm:py-8 min-w-0 overflow-x-hidden">
      <h1 className="mb-6 text-3xl sm:text-4xl font-bold text-foreground">הגדרות</h1>

      <div className="mb-8">
        <BrandingSection currentLogoUrl={sysSettings?.logo_url ?? null} />
      </div>

      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="mb-6 rounded-xl bg-muted p-1">
          <TabsTrigger value="profile" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm data-[state=active]:text-foreground">
            פרופיל עסק
          </TabsTrigger>
          <TabsTrigger value="api" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm data-[state=active]:text-foreground">
            חיבורי API
          </TabsTrigger>
        </TabsList>
        <TabsContent value="profile" className="mt-0">
          <BusinessProfileTab
            initialWhatsappNumber={sysSettings?.whatsapp_number ?? null}
            initialEmailSignature={sysSettings?.email_signature ?? null}
          />
        </TabsContent>
        <TabsContent value="api" className="mt-0">
          <Suspense fallback={<div className="animate-pulse h-64 rounded-2xl bg-slate-100" />}>
            <ApiIntegrationsTab
              defaultGreenApiId={settings?.green_api_id ?? ""}
              defaultGreenApiToken={settings?.green_api_token ?? ""}
              defaultAllowedTags={allowedTags}
              gmailConnected={!!settings?.gmail_refresh_token}
              gmailEmail={settings?.gmail_email ?? null}
            />
          </Suspense>
        </TabsContent>
      </Tabs>

      <div className="mb-8 flex flex-wrap gap-2">
        <Link href="/settings/lists">
          <Button variant="outline" className="w-full sm:w-auto">
            רשימות נפתחות
          </Button>
        </Link>
        <Link href="/settings/calculator">
          <Button variant="outline" className="w-full sm:w-auto">
            הגדרות מחשבון
          </Button>
        </Link>
      </div>

      <LogExportButton />
    </div>
  );
}
