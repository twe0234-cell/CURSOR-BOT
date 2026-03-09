"use server";

import { createClient } from "@/src/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type SettingsActionResult =
  | { success: true }
  | { success: false; error: string };

export async function saveUserSettings(
  greenApiId: string,
  greenApiToken: string
): Promise<SettingsActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "יש להתחבר כדי לשמור הגדרות" };
  }

  const { error } = await supabase
    .from("user_settings")
    .upsert(
      {
        user_id: user.id,
        green_api_id: greenApiId.trim(),
        green_api_token: greenApiToken.trim(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/settings");
  return { success: true };
}
