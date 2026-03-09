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
    .select("id, user_id, product_type, item_type, script_type, hidur_level, status, price, description")
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
        description: r.description,
      }))}
    />
  );
}
