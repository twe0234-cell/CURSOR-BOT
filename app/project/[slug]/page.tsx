import { notFound } from "next/navigation";
import { fetchPublicProject } from "@/app/investments/actions";
import { Check, Circle } from "lucide-react";

export default async function PublicProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const res = await fetchPublicProject(slug);

  if (!res.success || !res.project) {
    notFound();
  }

  const { project } = res;
  const statusLabel =
    project.status === "active"
      ? "פעיל"
      : project.status === "completed"
        ? "הושלם"
        : "בוטל";

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">
      <div className="max-w-2xl mx-auto px-4 py-8 sm:py-12">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-lg overflow-hidden">
          <div className="p-6 sm:p-8">
            <h1 className="text-2xl font-bold text-slate-800 mb-2">
              {project.item_details ?? "פרויקט"}
            </h1>
            <span
              className={`inline-block text-sm px-3 py-1 rounded-full mb-6 ${
                project.status === "active"
                  ? "bg-amber-100 text-amber-800"
                  : project.status === "completed"
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-slate-100 text-slate-600"
              }`}
            >
              {statusLabel}
            </span>

            <div className="mb-6">
              <p className="text-sm font-medium text-slate-600 mb-2">התקדמות</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-3 rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full transition-all"
                    style={{ width: `${project.progress_pct}%` }}
                  />
                </div>
                <span className="text-sm font-medium text-slate-700">
                  {project.progress_pct}%
                </span>
              </div>
            </div>

            {project.milestones.length > 0 && (
              <div>
                <p className="text-sm font-medium text-slate-600 mb-3">שלבים</p>
                <ul className="space-y-2">
                  {project.milestones.map((m) => (
                    <li
                      key={m.id}
                      className="flex items-center gap-2 text-slate-700"
                    >
                      {m.done ? (
                        <Check className="size-4 text-emerald-600 shrink-0" />
                      ) : (
                        <Circle className="size-4 text-slate-300 shrink-0" />
                      )}
                      <span
                        className={m.done ? "text-slate-600 line-through" : ""}
                      >
                        {m.label}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {project.milestones.length === 0 && (
              <p className="text-sm text-slate-500">
                אין שלבים להצגה כרגע.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
