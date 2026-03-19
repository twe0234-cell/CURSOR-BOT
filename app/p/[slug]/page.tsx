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

  const { data: item, error } = await supabase
    .from("inventory")
    .select("id, sku, images, target_price")
    .eq("public_slug", slug)
    .eq("is_public", true)
    .single();

  if (error || !item) {
    notFound();
  }

  const images = (item.images ?? null) as string[] | null;
  const targetPrice = item.target_price != null ? Number(item.target_price) : null;

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
