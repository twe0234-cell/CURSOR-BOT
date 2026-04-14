import { redirect } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";
import { fetchMarketTorahBooks } from "../actions";
import MarketKanbanClient from "./MarketKanbanClient";

export default async function MarketKanbanPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const booksRes = await fetchMarketTorahBooks();
  const rows = booksRes.success ? booksRes.rows : [];

  return <MarketKanbanClient initialRows={rows} />;
}
