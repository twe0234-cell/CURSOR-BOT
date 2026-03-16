import { redirect } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";
import InventoryClient from "./InventoryClient";

export default async function InventoryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: items } = await supabase
    .from("inventory")
    .select("id, user_id, product_type, item_type, script_type, hidur_level, status, price, cost_price, target_price, category, category_meta, scribe_code, description")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <InventoryClient
      initialItems={(items ?? []).map((r) => ({
        id: r.id,
        user_id: r.user_id,
        product_type: r.product_type,
        item_type: r.item_type,
        script_type: r.script_type,
        hidur_level: r.hidur_level,
        status: r.status,
        price: r.price != null ? Number(r.price) : null,
        cost_price: r.cost_price != null ? Number(r.cost_price) : null,
        target_price: r.target_price != null ? Number(r.target_price) : null,
        category: r.category ?? null,
        category_meta: (r.category_meta ?? null) as Record<string, unknown> | null,
        scribe_code: r.scribe_code ?? null,
        description: r.description,
      }))}
    />
  );
}
