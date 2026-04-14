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
    if (Array.isArray(allowedTags)) {
      revalidatePath("/audience");
      revalidatePath("/whatsapp");
    }
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
    revalidatePath("/whatsapp");
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "שגיאה לא צפויה";
    return { success: false, error: msg };
  }
}
