import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";
import ContactsTab from "./ContactsTab";
import { Button } from "@/components/ui/button";

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
            <Link href="/email/campaigns">
              <Button className="rounded-xl">
                כתיבה ושליחה
              </Button>
            </Link>
          </div>
        </div>
        <ContactsTab initialContacts={mapped} />
      </div>
    </div>
  );
}
