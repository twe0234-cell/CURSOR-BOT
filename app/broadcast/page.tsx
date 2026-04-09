import { redirect } from "next/navigation";

type Props = { searchParams: Promise<{ message?: string }> };

/**
 * /broadcast is now merged into /whatsapp — redirect transparently.
 * Links from inventory (getBroadcastMessage) pass ?message=... which is preserved.
 */
export default async function BroadcastPage({ searchParams }: Props) {
  const params = await searchParams;
  const msg = params?.message ?? "";
  redirect(msg ? `/whatsapp?message=${encodeURIComponent(msg)}` : "/whatsapp");
}
