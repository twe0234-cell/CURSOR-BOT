import { redirect } from "next/navigation";

type Props = { searchParams: Promise<{ message?: string }> };

/** @deprecated Use `/communications` — kept for bookmarks and deep links. */
export default async function WhatsAppPage({ searchParams }: Props) {
  const params = await searchParams;
  const msg = params?.message;
  if (msg) {
    redirect(`/communications?ch=wa&message=${encodeURIComponent(msg)}`);
  }
  redirect("/communications?ch=wa");
}
