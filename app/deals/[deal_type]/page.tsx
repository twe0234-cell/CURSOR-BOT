import { redirect } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";

interface Props {
  params: Promise<{ deal_type: string }>;
}

export default async function DealTypeRouter({ params }: Props) {
  const { deal_type } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("sys_deal_types")
    .select("ui_route")
    .eq("code", deal_type)
    .single();

  if (data?.ui_route) {
    redirect(data.ui_route);
  }

  redirect("/dashboard");
}
