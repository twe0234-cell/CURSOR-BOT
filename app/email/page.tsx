import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";
import ContactsTab from "./ContactsTab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { MailIcon, SparklesIcon, ArrowLeftIcon } from "lucide-react";

export default async function EmailPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

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

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <div className="w-full max-w-6xl mx-auto px-4 py-6 sm:py-8 min-w-0 overflow-x-hidden">
        <div className="mb-6 sm:mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-2">
              דיוור אימייל
            </h1>
            <p className="text-muted-foreground text-[15px] max-w-xl">
              ייבוא אנשי קשר, שליחת קמפיינים מ-Gmail ומעקב פתיחות והסרות
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/email/import">
              <Button variant="outline" className="rounded-xl border-border/80 hover:border-primary/25 hover:bg-muted/50">
                ייבוא מ-Gmail (CRM)
              </Button>
            </Link>
            <Link href="/email/campaigns">
              <Button className="rounded-xl bg-sky-600 hover:bg-sky-700 gap-2">
                <MailIcon className="size-4" />
                עורך קמפיין
              </Button>
            </Link>
          </div>
        </div>
        <Tabs defaultValue="contacts" className="w-full">
          <TabsList className="mb-6 rounded-xl bg-muted/60 p-1 ring-1 ring-border/50">
            <TabsTrigger
              value="contacts"
              className="rounded-lg data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border/60"
            >
              אנשי קשר
            </TabsTrigger>
            <TabsTrigger
              value="campaigns"
              className="rounded-lg data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border/60"
            >
              קמפיינים
            </TabsTrigger>
          </TabsList>
          <TabsContent value="contacts" className="mt-0">
            <ContactsTab initialContacts={mapped} />
          </TabsContent>
          <TabsContent value="campaigns" className="mt-0">
            {/* ────────────────────────────────────────────────────────────
                כרטיס ניווט לעורך הקמפיין המלא — ממשק AI, עריכה עשירה,
                קבצים מצורפים, פילוח תגיות, מעקב פתיחות ומכשירים.
                הלוגיקה כולה ב-/email/campaigns כדי למנוע כפילות.
            ──────────────────────────────────────────────────────────── */}
            <div className="flex flex-col items-center justify-center py-16 gap-6 rounded-2xl border border-dashed border-border/60 bg-muted/20">
              <div className="flex size-16 items-center justify-center rounded-2xl bg-sky-50 ring-1 ring-sky-100">
                <MailIcon className="size-8 text-sky-500" />
              </div>
              <div className="text-center space-y-3 max-w-md">
                <h2 className="text-xl font-semibold text-foreground">עורך קמפיין מתקדם</h2>
                <div className="flex flex-wrap justify-center gap-2 text-xs">
                  {["כתיבת AI", "עריכה עשירה", "קבצים מצורפים", "פילוח תגיות", "חתימה אוטומטית", "מעקב מכשירים"].map((f) => (
                    <span key={f} className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-0.5 font-medium text-sky-700 ring-1 ring-sky-200">
                      <SparklesIcon className="size-3" />
                      {f}
                    </span>
                  ))}
                </div>
                <p className="text-muted-foreground text-sm">
                  כל הכלים לשליחת קמפיין מקצועי — AI לכתיבת נושא וגוף, עורך HTML עשיר, קבצים מצורפים, פילוח לפי תגיות ומעקב אחר פתיחות לפי מכשיר.
                </p>
              </div>
              <Link href="/email/campaigns">
                <Button className="rounded-xl bg-sky-600 hover:bg-sky-700 gap-2 px-6">
                  <ArrowLeftIcon className="size-4" />
                  פתח עורך קמפיין
                </Button>
              </Link>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
