import { redirect } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";
import InventoryClient from "./InventoryClient";
import { fetchInventory } from "./actions";

export default async function InventoryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const res = await fetchInventory();
  if (!res.success) {
    return (
      <InventoryClient initialItems={[]} loadError={res.error} />
    );
  }

  return <InventoryClient initialItems={res.items} />;
}
