import { NextResponse } from "next/server";
import { createAdminClient } from "@/src/lib/supabase/admin";

const GREEN_API_URL = "https://api.green-api.com";
const DELAY_MS = 2500;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function replaceVariables(text: string, vars: Record<string, string>): string {
  let result = text;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, "gi"), value ?? "");
  }
  return result;
}

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Admin client not configured" }, { status: 503 });
  }

  try {
    const { data: job } = await supabase
      .from("broadcast_queue")
      .select("id, user_id, payload")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    if (!job) {
      return NextResponse.json({ processed: 0, message: "No pending jobs" });
    }

    await supabase
      .from("broadcast_queue")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", job.id);

    const { payload, user_id } = job;
    const { targets, messageText, imageUrl, scribeCode, tags } = payload as {
      targets: Array<{ wa_chat_id: string; name: string | null }>;
      messageText: string;
      imageUrl?: string | null;
      scribeCode?: string | null;
      tags?: string[];
    };

    const { data: settings } = await supabase
      .from("user_settings")
      .select("green_api_id, green_api_token")
      .eq("user_id", user_id)
      .single();

    if (!settings?.green_api_id || !settings?.green_api_token) {
      await supabase
        .from("broadcast_queue")
        .update({
          status: "failed",
          result: { error: "Green API not configured" },
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      return NextResponse.json({ error: "Green API not configured" }, { status: 400 });
    }

    const creds = { id: settings.green_api_id, token: settings.green_api_token };
    const errors: string[] = [];
    let sent = 0;
    let failed = 0;

    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      const vars = { Name: target.name ?? "", name: target.name ?? "" };
      let message = replaceVariables(messageText, vars);
      if (scribeCode?.trim()) {
        message = message.trimEnd() + "\n\nRef: " + scribeCode.trim();
      }

      try {
        if (imageUrl?.trim()) {
          const res = await fetch(
            `${GREEN_API_URL}/waInstance${creds.id}/sendFileByUrl/${creds.token}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chatId: target.wa_chat_id,
                urlFile: imageUrl.trim(),
                fileName: "image.jpg",
                caption: message,
              }),
            }
          );
          if (!res.ok) {
            errors.push(`${target.wa_chat_id}: ${await res.text()}`);
            failed++;
          } else sent++;
        } else {
          const res = await fetch(
            `${GREEN_API_URL}/waInstance${creds.id}/sendMessage/${creds.token}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ chatId: target.wa_chat_id, message }),
            }
          );
          if (!res.ok) {
            errors.push(`${target.wa_chat_id}: ${await res.text()}`);
            failed++;
          } else sent++;
        }
      } catch (err) {
        errors.push(`${target.wa_chat_id}: ${err instanceof Error ? err.message : "Unknown"}`);
        failed++;
      }

      await sleep(DELAY_MS);
    }

    await supabase.from("broadcast_logs").insert({
      user_id: user_id,
      sent,
      failed,
      errors: errors.slice(0, 50),
      tags: tags ?? [],
      scribe_code: scribeCode ?? null,
      internal_notes: payload.internalNotes ?? null,
    });

    await supabase
      .from("broadcast_queue")
      .update({
        status: "completed",
        result: { sent, failed, errors: errors.slice(0, 10) },
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    return NextResponse.json({ processed: 1, sent, failed });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Processing failed" },
      { status: 500 }
    );
  }
}
