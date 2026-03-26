import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { fetchProjectWithSheets } from "./actions";
import TorahDetailClient from "./TorahDetailClient";

type Props = { params: Promise<{ id: string }> };

export default async function TorahProjectDetailPage({ params }: Props) {
  const { id } = await params;
  const res = await fetchProjectWithSheets(id);

  if (!res.success) {
    if (res.code === "NOT_FOUND") notFound();
    if (res.code === "UNAUTHENTICATED") redirect("/login");
    notFound();
  }

  return (
    <div className="min-h-screen bg-slate-50/80">
      <div className="container mx-auto max-w-6xl px-3 sm:px-4 pt-4">
        <Link
          href="/torah"
          className="text-sm text-sky-600 hover:text-sky-800 hover:underline"
        >
          ← חזרה לרשימת פרויקטים
        </Link>
      </div>
      <TorahDetailClient projectId={id} project={res.project} initialSheets={res.sheets} />
    </div>
  );
}
