import { notFound, redirect } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";
import { PrintTorahRollClient } from "./PrintTorahRollClient";
import { TORAH_SHEET_COUNT } from "@/src/lib/types/torah";

type Props = { params: Promise<{ id: string }> };

export default async function PrintTorahRollLabelsPage({ params }: Props) {
  const { id: projectId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: proj } = await supabase
    .from("torah_projects")
    .select("id, title, user_id")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!proj) notFound();

  const { data: sheetRows } = await supabase
    .from("torah_sheets")
    .select("sheet_number, sku")
    .eq("project_id", projectId);

  const skuBySheetNumber: Record<number, string | null> = {};
  for (let s = 1; s <= TORAH_SHEET_COUNT; s++) {
    skuBySheetNumber[s] = null;
  }
  for (const row of sheetRows ?? []) {
    const num = Number(row.sheet_number);
    if (num >= 1 && num <= TORAH_SHEET_COUNT) {
      skuBySheetNumber[num] = (row.sku as string | null) ?? null;
    }
  }

  return (
    <PrintTorahRollClient
      projectId={proj.id as string}
      projectTitle={(proj.title as string) ?? ""}
      skuBySheetNumber={skuBySheetNumber}
    />
  );
}
