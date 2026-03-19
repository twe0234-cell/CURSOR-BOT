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
    .select("id, sku, user_id, product_category, purchase_date, category_meta, script_type, status, quantity, cost_price, total_cost, amount_paid, target_price, total_target_price, scribe_id, scribe_code, images, description, parchment_type, computer_proofread, human_proofread, is_sewn, is_public, public_slug")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <InventoryClient
      initialItems={(items ?? []).map((r) => {
        const qty = Number(r.quantity ?? 1);
        const cost = r.cost_price != null ? Number(r.cost_price) : null;
        const paid = Number(r.amount_paid ?? 0);
        const total = r.total_cost != null ? Number(r.total_cost) : (cost != null ? qty * cost : null);
        return {
          id: r.id,
          sku: r.sku ?? null,
          user_id: r.user_id,
          product_category: r.product_category ?? null,
          purchase_date: r.purchase_date ?? null,
          category_meta: (r.category_meta ?? null) as Record<string, unknown> | null,
          script_type: r.script_type ?? null,
          status: r.status ?? null,
          quantity: qty,
          cost_price: cost,
          total_cost: total,
          amount_paid: paid,
          target_price: r.target_price != null ? Number(r.target_price) : null,
          total_target_price: r.total_target_price != null ? Number(r.total_target_price) : null,
          scribe_id: r.scribe_id ?? null,
          scribe_code: r.scribe_code ?? null,
          images: (r.images ?? null) as string[] | null,
          description: r.description ?? null,
          parchment_type: r.parchment_type ?? null,
          computer_proofread: Boolean(r.computer_proofread ?? false),
          human_proofread: Boolean(r.human_proofread ?? false),
          is_sewn: Boolean(r.is_sewn ?? false),
          is_public: r.is_public ?? false,
          public_slug: r.public_slug ?? null,
        };
      })}
    />
  );
}
