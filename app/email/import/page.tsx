import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/src/lib/supabase/server";
import { fetchGmailTriageContacts } from "./actions";
import TriageTable from "./TriageTable";
import { Button } from "@/components/ui/button";
import RefreshButton from "./RefreshButton";
import EmailToMarketCard from "./EmailToMarketCard";

export default async function GmailImportPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const res = await fetchGmailTriageContacts();
  const contacts = res.success ? res.contacts : [];

  return (
    <div className="min-h-screen bg-slate-50/50" dir="rtl">
      <div className="w-full max-w-5xl mx-auto px-4 py-6 sm:py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-800">ייבוא אנשי קשר מ-Gmail</h1>
            <p className="mt-1 text-muted-foreground">
              סנן והקצה אנשי קשר חדשים ל-CRM
            </p>
          </div>
          <div className="flex gap-2">
            <RefreshButton />
            <Link href="/email">
              <Button variant="outline" className="rounded-xl">חזרה לדיוור</Button>
            </Link>
          </div>
        </div>

        {!res.success && (
          <div className="mb-6 rounded-xl bg-red-50 p-4 text-red-700">
            {res.error}
          </div>
        )}

        <EmailToMarketCard />

        <TriageTable
          initialContacts={contacts}
          onContactsChange={() => {}}
        />

        {contacts.length === 0 && res.success && (
          <div className="rounded-xl border-2 border-dashed border-slate-200 bg-white p-12 text-center">
            <p className="text-muted-foreground">אין אנשי קשר חדשים לייבא</p>
            <p className="mt-2 text-sm text-muted-foreground">כל אנשי הקשר מ-Gmail כבר קיימים ב-CRM או ברשימת ההתעלמות</p>
          </div>
        )}
      </div>
    </div>
  );
}
