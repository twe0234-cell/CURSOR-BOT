"use server";

import { createClient } from "@/src/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type SettingsActionResult =
  | { success: true }
  | { success: false; error: string };

export async function saveUserSettings(
  greenApiId: string,
  greenApiToken: string,
  allowedTags?: string[],
  waMarketGroupId?: string | null
): Promise<SettingsActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "יש להתחבר כדי לשמור הגדרות" };
    }

    let waGroup: string | null;
    if (waMarketGroupId !== undefined) {
      waGroup = String(waMarketGroupId ?? "").trim() || null;
    } else {
      const { data: existing } = await supabase
        .from("user_settings")
        .select("wa_market_group_id")
        .eq("user_id", user.id)
        .maybeSingle();
      waGroup = (existing?.wa_market_group_id as string | null) ?? null;
    }

    const payload: Record<string, unknown> = {
      user_id: user.id,
      green_api_id: String(greenApiId ?? "").trim(),
      green_api_token: String(greenApiToken ?? "").trim(),
      wa_market_group_id: waGroup,
      updated_at: new Date().toISOString(),
    };

    if (Array.isArray(allowedTags)) {
      payload.allowed_tags = allowedTags.filter(Boolean).map((t) => String(t).trim());
    }

    const { error } = await supabase
      .from("user_settings")
      .upsert(payload, { onConflict: "user_id" });

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath("/settings");
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "שגיאה לא צפויה";
    return { success: false, error: msg };
  }
}

export async function disconnectGmail(): Promise<SettingsActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { error } = await supabase
      .from("user_settings")
      .update({
        gmail_refresh_token: null,
        gmail_email: null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    if (error) return { success: false, error: error.message };
    revalidatePath("/settings");
    revalidatePath("/email");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה לא צפויה" };
  }
}

export async function saveWhatsappNumber(whatsappNumber: string): Promise<SettingsActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { error } = await supabase
      .from("sys_settings")
      .upsert(
        { id: "default", whatsapp_number: whatsappNumber.trim() || null, updated_at: new Date().toISOString() },
        { onConflict: "id" }
      );

    if (error) return { success: false, error: error.message };
    revalidatePath("/settings");
    revalidatePath("/p");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}

export async function fetchRecentWebhookGroups(): Promise<
  { success: true; groups: { chatId: string; hits: number; lastSeen: string }[] } | { success: false; error: string }
> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { data, error } = await supabase.rpc("get_recent_webhook_groups" as never, {
      p_user_id: user.id,
    } as never);

    if (error || !data) {
      // fallback: direct query via sys_logs
      const { data: logs } = await supabase
        .from("sys_logs")
        .select("metadata, created_at")
        .eq("module", "whatsapp-webhook")
        .eq("message", "chatId mismatch - ignoring")
        .order("created_at", { ascending: false })
        .limit(200);

      const counts = new Map<string, { hits: number; lastSeen: string }>();
      for (const row of logs ?? []) {
        const meta = row.metadata as Record<string, string> | null;
        const chatId = meta?.chatId;
        const uid = meta?.user_id;
        if (!chatId || uid !== user.id) continue;
        const existing = counts.get(chatId);
        if (!existing) {
          counts.set(chatId, { hits: 1, lastSeen: row.created_at ?? "" });
        } else {
          existing.hits += 1;
        }
      }
      const groups = [...counts.entries()]
        .map(([chatId, { hits, lastSeen }]) => ({ chatId, hits, lastSeen }))
        .sort((a, b) => b.hits - a.hits)
        .slice(0, 15);
      return { success: true, groups };
    }
    return { success: true, groups: data as { chatId: string; hits: number; lastSeen: string }[] };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}

export async function saveEmailSignature(signature: string): Promise<SettingsActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "יש להתחבר" };

    const { error } = await supabase
      .from("sys_settings")
      .upsert(
        { id: "default", email_signature: signature.trim(), updated_at: new Date().toISOString() },
        { onConflict: "id" }
      );

    if (error) return { success: false, error: error.message };
    revalidatePath("/settings");
    revalidatePath("/email");
    revalidatePath("/email/campaigns");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "שגיאה" };
  }
}

export async function updateAllowedTags(allowedTags: string[]): Promise<SettingsActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "יש להתחבר" };
    }

    const { error } = await supabase
      .from("user_settings")
      .update({
        allowed_tags: (allowedTags ?? []).filter(Boolean).map((t) => String(t).trim()),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath("/settings");
    revalidatePath("/audience");
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "שגיאה לא צפויה";
    return { success: false, error: msg };
  }
}
