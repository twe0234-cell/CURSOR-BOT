import { redirect } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";
import MarketClient from "./MarketClient";
import { fetchMarketTorahBooks } from "./actions";

export default async function MarketPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const booksRes = await fetchMarketTorahBooks();
  const rows = booksRes.success ? booksRes.rows : [];

  return <MarketClient initialRows={rows} />;
}
