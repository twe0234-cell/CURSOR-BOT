"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  fetchEmailContacts,
  sendEmailCampaign,
  getGmailStatus,
  type EmailContact,
} from "./actions";
import { MailIcon, KeyIcon } from "lucide-react";

type Props = {
  initialContacts: EmailContact[];
};

export default function CampaignsTab({ initialContacts }: Props) {
  const [contacts, setContacts] = useState(initialContacts ?? []);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [campaignSubject, setCampaignSubject] = useState("");
  const [campaignBody, setCampaignBody] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  const subscribedContacts = useMemo(
    () => contacts.filter((c) => c.subscribed !== false),
    [contacts]
  );

  const refreshContacts = async () => {
    const res = await fetchEmailContacts();
    if (res.success) setContacts(res.contacts);
  };

  useEffect(() => {
    getGmailStatus().then((r) => {
      if (r.success && r.connected) setGmailConnected(true);
    });
  }, []);

  useEffect(() => {
    fetchEmailContacts().then((r) => {
      if (r.success) setContacts(r.contacts);
    });
  }, []);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === subscribedContacts.length && subscribedContacts.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(subscribedContacts.map((c) => c.id)));
    }
  };

  const targetCount = selected.size > 0 ? selected.size : subscribedContacts.length;

  const handleSendCampaign = async () => {
    const ids = selected.size > 0 ? [...selected] : subscribedContacts.map((c) => c.id);
    if (ids.length === 0) {
      toast.error("אין נמענים – הוסף אנשי קשר מנויים בלבד");
      return;
    }
    setSending(true);
    const bodyHtml = campaignBody.trim() || "<p>שלום,</p>";
    const res = await sendEmailCampaign(ids, campaignSubject.trim(), bodyHtml);
    setSending(false);
    if (res.success) {
      toast.success(`נשלחו ${res.sent} אימיילים${res.failed > 0 ? `, ${res.failed} נכשלו` : ""}`);
      setCampaignSubject("");
      setCampaignBody("");
      setSelected(new Set());
      refreshContacts();
    } else {
      toast.error(res.error);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="shadow-sm rounded-xl border-slate-200 bg-white overflow-hidden">
        <CardHeader>
          <div className="flex items-center gap-2">
            <MailIcon className="w-5 h-5 text-indigo-500" />
            <div>
              <h2 className="text-base font-semibold text-slate-700">קמפיין אימייל</h2>
              <p className="text-sm text-muted-foreground">שליחת קמפיין לנמענים מנויים (ללא הסירו מנוי)</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {gmailConnected ? (
            <div className="space-y-6">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">נושא</label>
                <Input
                  value={campaignSubject}
                  onChange={(e) => setCampaignSubject(e.target.value)}
                  placeholder="נושא האימייל"
                  className="rounded-xl"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">תוכן (HTML, RTL)</label>
                <textarea
                  value={campaignBody}
                  onChange={(e) => setCampaignBody(e.target.value)}
                  placeholder="<p>שלום,</p><p>התוכן כאן...</p>"
                  rows={10}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 font-mono text-sm"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  התוכן יועמד אוטומטית ב-RTL (ימין לשמאל)
                </p>
              </div>

              {subscribedContacts.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
                  <p className="text-sm font-medium text-slate-700">בחירת נמענים</p>
                  <p className="text-xs text-muted-foreground">
                    נמענים שהסירו מנוי (unsubscribed) לא יקבלו את הקמפיין.
                  </p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={toggleSelectAll} className="rounded-xl">
                      {selected.size === subscribedContacts.length && subscribedContacts.length > 0
                        ? "בטל בחירה"
                        : "בחר את כל המנויים"}
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      {targetCount} נמענים יקבלו
                    </span>
                  </div>
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-100 p-2 space-y-1">
                    {subscribedContacts.slice(0, 20).map((c) => (
                      <label key={c.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-100 rounded px-2 py-1">
                        <Checkbox
                          checked={selected.has(c.id)}
                          onCheckedChange={() => toggleSelect(c.id)}
                        />
                        <span className="text-sm truncate">{c.email}</span>
                      </label>
                    ))}
                    {subscribedContacts.length > 20 && (
                      <p className="text-xs text-muted-foreground py-1">
                        +{subscribedContacts.length - 20} נוספים
                      </p>
                    )}
                  </div>
                </div>
              )}

              <Button
                onClick={handleSendCampaign}
                disabled={sending || !campaignSubject.trim() || targetCount === 0}
                className="rounded-xl bg-indigo-600 hover:bg-indigo-700 w-full py-6"
              >
                {sending ? "שולח..." : "שלח קמפיין"}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <KeyIcon className="size-16 text-indigo-500" />
              <h3 className="text-lg font-semibold text-slate-700">חיבור Gmail</h3>
              <p className="text-center text-muted-foreground max-w-md">
                לחיבור Gmail שלך להפעלת שליחת אימיילים – הגדר OAuth בהגדרות.
              </p>
              <Link href="/settings">
                <Button variant="outline" className="rounded-xl">הגדרות</Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
