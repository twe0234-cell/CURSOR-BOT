/**
 * Broadcast queue processor. Vercel Hobby plan runs crons only once/day.
 * Use cron-job.org (free): point to https://[YOUR-VERCEL-URL]/api/cron/process-broadcasts
 * with header: Authorization: Bearer [CRON_SECRET], run every 1 minute.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/src/lib/supabase/admin";
import {
  fileNameForImageUrl,
  greenApiDispatchSpacingDelayMs,
} from "@/lib/whatsapp/greenApi";

const GREEN_API_URL = "https://api.green-api.com";

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
  const authHeader = (req.headers.get("authorization") ?? "").trim();
  const cronSecret = (process.env.CRON_SECRET ?? "").trim();
  const expected = `Bearer ${cronSecret}`;
  if (cronSecret && authHeader !== expected) {
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
          log_details: [{ error: "Green API not configured" }],
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      return NextResponse.json({ error: "Green API not configured" }, { status: 400 });
    }

    const creds = { id: settings.green_api_id, token: settings.green_api_token };
    const errors: string[] = [];
    const logDetails: Array<{ chatId: string; ok: boolean; response?: unknown; error?: string }> = [];
    let sent = 0;
    let failed = 0;

    const validatedImageUrl = imageUrl?.trim() && !imageUrl.trim().startsWith("data:")
      ? imageUrl.trim()
      : null;

    let tIndex = 0;
    for (const target of targets) {
      try {
        const vars = { Name: target.name ?? "", name: target.name ?? "" };
        let message = replaceVariables(messageText, vars);
        if (scribeCode?.trim()) {
          message = message.trimEnd() + "\n\n" + scribeCode.trim();
        }

        if (validatedImageUrl && (validatedImageUrl.startsWith("http://") || validatedImageUrl.startsWith("https://"))) {
          const res = await fetch(
            `${GREEN_API_URL}/waInstance${creds.id}/sendFileByUrl/${creds.token}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chatId: target.wa_chat_id,
                urlFile: validatedImageUrl,
                fileName: fileNameForImageUrl(validatedImageUrl),
                caption: message,
              }),
            }
          );
          const bodyText = await res.text();
          let parsed: unknown = null;
          try {
            parsed = bodyText ? JSON.parse(bodyText) : null;
          } catch {
            parsed = bodyText;
          }
          if (!res.ok) {
            errors.push(`${target.wa_chat_id}: ${bodyText}`);
            failed++;
            logDetails.push({ chatId: target.wa_chat_id, ok: false, error: bodyText, response: parsed });
          } else {
            sent++;
            logDetails.push({ chatId: target.wa_chat_id, ok: true, response: parsed });
          }
        } else {
          const res = await fetch(
            `${GREEN_API_URL}/waInstance${creds.id}/sendMessage/${creds.token}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ chatId: target.wa_chat_id, message }),
            }
          );
          const bodyText = await res.text();
          let parsed: unknown = null;
          try {
            parsed = bodyText ? JSON.parse(bodyText) : null;
          } catch {
            parsed = bodyText;
          }
          if (!res.ok) {
            errors.push(`${target.wa_chat_id}: ${bodyText}`);
            failed++;
            logDetails.push({ chatId: target.wa_chat_id, ok: false, error: bodyText, response: parsed });
          } else {
            sent++;
            logDetails.push({ chatId: target.wa_chat_id, ok: true, response: parsed });
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${target.wa_chat_id}: ${msg}`);
        failed++;
        logDetails.push({ chatId: target.wa_chat_id, ok: false, error: msg });
      }

      if (tIndex < targets.length - 1) {
        await sleep(greenApiDispatchSpacingDelayMs());
      }
      tIndex++;
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
        log_details: logDetails,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    return NextResponse.json({ processed: 1, sent, failed });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Processing failed";
    // מחזיר job תקוע ל-failed כדי שלא יישאר ב-processing לנצח
    try {
      const { data: stuckJob } = await supabase
        .from("broadcast_queue")
        .select("id")
        .eq("status", "processing")
        .order("updated_at", { ascending: true })
        .limit(1)
        .single();
      if (stuckJob) {
        await supabase
          .from("broadcast_queue")
          .update({
            status: "failed",
            result: { error: msg },
            updated_at: new Date().toISOString(),
          })
          .eq("id", stuckJob.id);
      }
    } catch { /* ignore recovery errors */ }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
