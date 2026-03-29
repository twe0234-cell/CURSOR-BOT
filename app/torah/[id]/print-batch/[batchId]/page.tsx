import { notFound, redirect } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";
import { PrintBatchClient } from "./PrintBatchClient";

type Props = { params: Promise<{ id: string; batchId: string }> };

export default async function PrintQaBatchLabelPage({ params }: Props) {
  const { id: projectId, batchId } = await params;

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

  const { data: batch } = await supabase
    .from("torah_qa_batches")
    .select("id, project_id, sent_date")
    .eq("id", batchId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (!batch) notFound();

  const { data: junctions } = await supabase
    .from("torah_batch_sheets")
    .select("sheet_id")
    .eq("batch_id", batchId);

  const sheetIds = [...new Set((junctions ?? []).map((j) => j.sheet_id as string))];

  let sheetNumbers: number[] = [];
  if (sheetIds.length > 0) {
    const { data: sheetRows } = await supabase
      .from("torah_sheets")
      .select("sheet_number")
      .in("id", sheetIds)
      .order("sheet_number", { ascending: true });

    sheetNumbers = (sheetRows ?? []).map((s) => Number(s.sheet_number));
  }

  return (
    <PrintBatchClient
      projectTitle={(proj.title as string) ?? ""}
      batchId={batch.id as string}
      sheetNumbers={sheetNumbers}
      sentDateIso={batch.sent_date as string}
    />
  );
}
