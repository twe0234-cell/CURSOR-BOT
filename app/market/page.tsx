import { redirect } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";
import MarketClient from "./MarketClient";
import { fetchMarketTorahBooks, fetchScribesForMarketForm } from "./actions";

export default async function MarketPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [booksRes, scribesRes] = await Promise.all([
    fetchMarketTorahBooks(),
    fetchScribesForMarketForm(),
  ]);

  const rows = booksRes.success ? booksRes.rows : [];
  const scribes = scribesRes.success ? scribesRes.contacts : [];

  return <MarketClient initialRows={rows} scribes={scribes} />;
}
