import { notFound } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/src/lib/supabase/server";
import { MessageCircle } from "lucide-react";

export type PublicProductPayload = {
  id: string;
  product_category: string | null;
  category_meta: Record<string, unknown> | null;
  script_type: string | null;
  status: string | null;
  target_price: number | null;
  images: string[] | null;
  description: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  available: "זמין",
  in_use: "בשימוש",
  sold: "נמכר",
  reserved: "שמור",
};

export default async function PublicProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: item, error } = await supabase
    .from("inventory")
    .select("id, product_category, category_meta, script_type, status, target_price, images, description")
    .eq("public_slug", slug)
    .eq("is_public", true)
    .single();

  if (error || !item) {
    notFound();
  }

  const payload: PublicProductPayload = {
    id: item.id,
    product_category: item.product_category ?? null,
    category_meta: (item.category_meta ?? null) as Record<string, unknown> | null,
    script_type: item.script_type ?? null,
    status: item.status ?? null,
    target_price: item.target_price != null ? Number(item.target_price) : null,
    images: (item.images ?? null) as string[] | null,
    description: item.description ?? null,
  };

  const { data: sysSettings } = await supabase
    .from("sys_settings")
    .select("whatsapp_number")
    .eq("id", "default")
    .single();

  const waNumber = sysSettings?.whatsapp_number?.replace(/\D/g, "") ?? "";
  const waLink = waNumber
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(`שלום, אני מעוניין בפריט ${payload.id} שראיתי בקטלוג`)}`
    : null;

  const meta = (payload.category_meta ?? {}) as Record<string, string | number>;
  const attrs: { label: string; value: string }[] = [];
  if (meta.size) attrs.push({ label: "גודל", value: String(meta.size) });
  if (meta.navi) attrs.push({ label: "נביא", value: String(meta.navi) });
  if (meta.lines) attrs.push({ label: "שורות", value: String(meta.lines) });
  if (payload.script_type) attrs.push({ label: "כתב", value: payload.script_type });

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white" dir="rtl">
      <div className="max-w-2xl mx-auto px-4 py-8 sm:py-12">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-lg overflow-hidden">
          {/* Image gallery */}
          <div className="relative aspect-[4/3] bg-slate-100">
            {(payload.images ?? []).length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-4">
                {(payload.images ?? []).slice(0, 4).map((url, i) => (
                  <div key={i} className="relative aspect-square rounded-xl overflow-hidden">
                    <Image
                      src={url}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 100vw, 50vw"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                <span className="text-6xl">📦</span>
              </div>
            )}
            <span className="absolute top-4 right-4 rounded-full bg-teal-100 px-3 py-1 text-sm font-medium text-teal-700">
              {STATUS_LABELS[payload.status ?? ""] ?? payload.status ?? "—"}
            </span>
          </div>

          <div className="p-6 sm:p-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 mb-2">
              {payload.product_category ?? "פריט"}
            </h1>

            {attrs.length > 0 && (
              <div className="flex flex-wrap gap-3 mb-4">
                {attrs.map((a) => (
                  <div key={a.label} className="rounded-lg bg-slate-50 px-3 py-1.5">
                    <span className="text-xs text-slate-500">{a.label}:</span>{" "}
                    <span className="font-medium text-slate-700">{a.value}</span>
                  </div>
                ))}
              </div>
            )}

            {payload.description && (
              <p className="text-slate-600 mb-6 leading-relaxed">{payload.description}</p>
            )}

            {payload.target_price != null && (
              <p className="text-xl font-bold text-teal-700 mb-6">
                מחיר: {payload.target_price.toLocaleString("he-IL")} ₪
              </p>
            )}

            {waLink && (
              <a
                href={waLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 w-full sm:w-auto justify-center rounded-xl bg-[#25D366] px-6 py-3 font-semibold text-white shadow-md hover:bg-[#20bd5a] transition-colors"
              >
                <MessageCircle className="size-5" />
                פנה ב-WhatsApp
              </a>
            )}

            {!waLink && (
              <p className="text-sm text-slate-500">
                להזמנת פריט זה, צור קשר עם העסק.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
