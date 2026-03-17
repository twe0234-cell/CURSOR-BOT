"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { fetchEmailContacts, getGmailStatus } from "@/app/email/actions";
import { sendGmailCampaignAction } from "./actions";
import EmailComposer from "./EmailComposer";
import type { EmailContact } from "@/app/email/actions";
import { KeyIcon } from "lucide-react";

type Props = {
  initialContacts: EmailContact[];
  signature: string | null;
};

function fileToBase64(file: File): Promise<{ filename: string; contentBase64: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] ?? "";
      resolve({ filename: file.name, contentBase64: base64 });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function CampaignsClient({ initialContacts, signature }: Props) {
  const [contacts, setContacts] = useState(initialContacts);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  const subscribedContacts = useMemo(
    () => contacts.filter((c) => c.subscribed !== false),
    [contacts]
  );

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

  const targetIds = selected.size > 0 ? [...selected] : subscribedContacts.map((c) => c.id);

  const handleSend = async () => {
    if (targetIds.length === 0) {
      toast.error("אין נמענים – הוסף אנשי קשר מנויים");
      return;
    }
    setSending(true);

    let attPayload: { filename: string; contentBase64: string }[] = [];
    try {
      attPayload = await Promise.all(attachments.map(fileToBase64));
    } catch {
      toast.error("שגיאה בקריאת קבצים");
      setSending(false);
      return;
    }

    const res = await sendGmailCampaignAction(subject, bodyHtml, targetIds, attPayload);
    setSending(false);

    if (res.success) {
      toast.success(`נשלחו ${res.sent} אימיילים${res.failed > 0 ? `, ${res.failed} נכשלו` : ""}`);
      setSubject("");
      setBodyHtml("");
      setAttachments([]);
      setSelected(new Set());
    } else {
      toast.error(res.error);
    }
  };

  if (!gmailConnected) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <KeyIcon className="size-16 text-indigo-500" />
        <h3 className="text-lg font-semibold text-slate-700">חיבור Gmail</h3>
        <p className="text-center text-muted-foreground max-w-md">
          לחיבור Gmail – הגדר OAuth בהגדרות
        </p>
        <Link href="/settings">
          <Button variant="outline" className="rounded-xl">הגדרות</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card className="shadow-sm rounded-xl border-slate-200">
        <CardHeader>
          <CardTitle className="text-base font-semibold">כתיבת קמפיין</CardTitle>
          <CardDescription>נושא, תוכן וקבצים מצורפים</CardDescription>
        </CardHeader>
        <CardContent>
          <EmailComposer
            subject={subject}
            onSubjectChange={setSubject}
            bodyHtml={bodyHtml}
            onBodyChange={setBodyHtml}
            signature={signature}
            attachments={attachments}
            onAttachmentsChange={setAttachments}
          />
        </CardContent>
      </Card>

      <Card className="shadow-sm rounded-xl border-slate-200">
        <CardHeader>
          <CardTitle className="text-base font-semibold">נמענים</CardTitle>
          <CardDescription>בחר אנשי קשר (מנויים בלבד)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            variant="outline"
            size="sm"
            onClick={toggleSelectAll}
            className="rounded-xl"
          >
            {selected.size === subscribedContacts.length && subscribedContacts.length > 0
              ? "בטל בחירה"
              : "בחר את כל המנויים"}
          </Button>
          <p className="text-sm text-muted-foreground">
            {targetIds.length} נמענים יקבלו
          </p>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {subscribedContacts.slice(0, 30).map((c) => (
              <label key={c.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 rounded px-2 py-1">
                <Checkbox
                  checked={selected.has(c.id)}
                  onCheckedChange={() => toggleSelect(c.id)}
                />
                <span className="text-sm truncate">{c.email}</span>
              </label>
            ))}
            {subscribedContacts.length > 30 && (
              <p className="text-xs text-muted-foreground">+{subscribedContacts.length - 30} נוספים</p>
            )}
          </div>
          <Button
            onClick={handleSend}
            disabled={sending || !subject.trim() || targetIds.length === 0}
            className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 py-6"
          >
            {sending ? "שולח..." : "שלח קמפיין"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
