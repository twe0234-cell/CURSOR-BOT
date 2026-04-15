"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SysEvent } from "@/src/lib/types/sys-events";

function describe(ev: SysEvent): string {
  const meta = (ev.metadata ?? {}) as Record<string, unknown>;
  const action = String(ev.action ?? "");
  if (action === "gmail_triage_saved") return "ייבוא Gmail → CRM";
  if (action === "contacts_merged") {
    const merged = meta.merged_contact_ids as string[] | undefined;
    return merged?.length
      ? `מיזוג אנשי קשר (${merged.length})`
      : "מיזוג אנשי קשר";
  }
  if (action === "contact_updated") return "עדכון איש קשר";
  if (action === "contact_created") return "יצירת איש קשר";
  if (action === "negotiation_note") return "הערת משא ומתן";
  if (action === "whatsapp_message") return "הודעת וואטסאפ";
  if (action === "email_sent") return "מייל נשלח";
  if (action === "torah_project_updated") return "עדכון פרויקט תורה";
  return action || ev.entity_type || "אירוע";
}

export function ContactSysEventsBlock({ events }: { events: SysEvent[] }) {
  if (!events.length) {
    return (
      <Card className="rounded-2xl border border-border/60 bg-card/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">ציר זמן (אירועים)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">אין אירועים מתועדים לאיש קשר זה.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-2xl border border-border/60 bg-card/40">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">ציר זמן (אירועים)</CardTitle>
        <p className="text-xs text-muted-foreground">
          משא ומתן, מיילים, וואטסאפ ופרויקטי תורה — מקור אמת אחד.
        </p>
      </CardHeader>
      <CardContent className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
        {events.map((ev) => {
          const ts = ev.created_at ? new Date(ev.created_at) : null;
          const meta = (ev.metadata ?? {}) as Record<string, unknown>;
          return (
            <div
              key={ev.id}
              className="rounded-xl border border-border/50 bg-background/60 p-3 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{describe(ev)}</span>
                {ts && (
                  <span className="text-xs text-muted-foreground" suppressHydrationWarning>
                    {ts.toLocaleString("he-IL", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {ev.source && (
                  <span className="inline-flex rounded-md border border-border/60 bg-secondary px-1.5 py-0.5 text-[10px] font-medium">
                    {ev.source}
                  </span>
                )}
                {ev.entity_type && (
                  <span className="inline-flex rounded-md border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {ev.entity_type}
                  </span>
                )}
              </div>
              {(ev.from_state || ev.to_state) && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {ev.from_state ?? "—"} → {ev.to_state ?? "—"}
                </p>
              )}
              {typeof meta.summary === "string" && meta.summary.trim() && (
                <p className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap">
                  {meta.summary}
                </p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
