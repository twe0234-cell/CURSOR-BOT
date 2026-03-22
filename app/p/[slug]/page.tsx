import { notFound } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/src/lib/supabase/server";
import { MessageCircle } from "lucide-react";

export default async function PublicProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  // SECURITY: Explicit select - cost_price, total_cost, scribe_id MUST NOT be included
  const { data: item, error } = await supabase
    .from("inventory")
    .select(
      "id, sku, images, target_price, product_category, script_type, category_meta, parchment_type, computer_proofread, human_proofread, is_sewn, has_lamnatzeach, size"
    )
    .eq("public_slug", slug)
    .eq("is_public", true)
    .single();

  if (error || !item) {
    notFound();
  }

  const images = (item.images ?? null) as string[] | null;
  const targetPrice = item.target_price != null ? Number(item.target_price) : null;
  const meta = (item.category_meta ?? {}) as Record<string, string | number>;
  const metaSize = meta.size != null ? String(meta.size).trim() : null;
  const pitumSize =
    item.product_category === "פיטום הקטורת" && item.size != null
      ? String(item.size).trim()
      : null;
  const sizeDisplay =
    item.product_category === "פיטום הקטורת" ? pitumSize : metaSize;
  const naviName = meta.navi != null ? String(meta.navi).trim() : null;
  const lines = meta.lines != null ? String(meta.lines).trim() : null;

  const { data: sysSettings } = await supabase
    .from("sys_settings")
    .select("whatsapp_number")
    .eq("id", "default")
    .single();

  const waNumber = sysSettings?.whatsapp_number?.replace(/\D/g, "") ?? "";
  const skuDisplay = item.sku ?? item.id;
  const waLink = waNumber
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(`שלום, אני מעוניין בפריט מקט ${skuDisplay} שראיתי בקטלוג`)}`
    : null;

  return (
    <div className="min-h-screen bg-sky-50/30" dir="rtl">
      <div className="max-w-2xl mx-auto px-4 py-8 sm:py-12">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-lg overflow-hidden">
          {/* Makat (SKU) */}
          <div className="px-6 pt-6 pb-2">
            <p className="text-sm text-slate-500 font-medium">מק״ט</p>
            <p className="text-lg font-bold text-slate-800 font-mono">{skuDisplay}</p>
          </div>

          {/* Image gallery */}
          <div className="relative aspect-[4/3] bg-slate-100">
            {(images ?? []).length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-4">
                {(images ?? []).slice(0, 4).map((url, i) => (
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
          </div>

          <div className="p-6 sm:p-8">
            {targetPrice != null && (
              <p className="text-xl font-bold text-sky-700 mb-6">
                מחיר מומלץ: {targetPrice.toLocaleString("he-IL")} ₪
              </p>
            )}

            {/* מפרט טכני - Technical Specifications */}
            {(item.product_category ||
              item.script_type ||
              sizeDisplay ||
              naviName ||
              lines ||
              item.parchment_type ||
              item.computer_proofread ||
              item.human_proofread ||
              item.is_sewn ||
              item.product_category === "פיטום הקטורת") && (
              <div className="mb-6">
                <p className="text-sm font-semibold text-slate-600 mb-3">מפרט טכני</p>
                <div className="flex flex-wrap gap-2">
                  {item.product_category && (
                    <span className="inline-flex items-center rounded-full bg-sky-100 px-3 py-1 text-sm font-medium text-sky-800">
                      {item.product_category}
                    </span>
                  )}
                  {item.script_type && (
                    <span className="inline-flex items-center rounded-full bg-sky-100 px-3 py-1 text-sm font-medium text-sky-800">
                      כתב {item.script_type}
                    </span>
                  )}
                  {item.product_category === "פיטום הקטורת" && (
                    <span
                      className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${
                        item.has_lamnatzeach
                          ? "bg-emerald-100 text-emerald-900"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {Boolean(item.has_lamnatzeach) ? "כולל למנצח" : "ללא למנצח"}
                    </span>
                  )}
                  {sizeDisplay && (
                    <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-800">
                      גודל {sizeDisplay}
                      {item.product_category === "פיטום הקטורת" ? " (ס״מ)" : ""}
                    </span>
                  )}
                  {naviName && (
                    <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-800">
                      נביא {naviName}
                    </span>
                  )}
                  {lines && (
                    <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-800">
                      {lines} שורות
                    </span>
                  )}
                  {item.parchment_type && (
                    <span className="inline-flex items-center rounded-full bg-sky-100 px-3 py-1 text-sm font-medium text-sky-800">
                      קלף {item.parchment_type}
                    </span>
                  )}
                  {item.computer_proofread && (
                    <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-800">
                      עבר הגהת מחשב
                    </span>
                  )}
                  {item.human_proofread && (
                    <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-800">
                      עבר הגהת אנוש
                    </span>
                  )}
                  {item.is_sewn && (
                    <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-800">
                      תפור
                    </span>
                  )}
                </div>
              </div>
            )}

            {waLink ? (
              <a
                href={waLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 w-full rounded-xl bg-[#25D366] px-6 py-3 font-semibold text-white shadow-md hover:bg-[#20bd5a] transition-colors"
              >
                <MessageCircle className="size-5" />
                מעוניין בפריט? לחץ כאן לוואטסאפ
              </a>
            ) : (
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
