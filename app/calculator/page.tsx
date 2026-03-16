import { redirect } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";
import CalculatorClient from "./CalculatorClient";

export default async function CalculatorPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <CalculatorClient />;
}
