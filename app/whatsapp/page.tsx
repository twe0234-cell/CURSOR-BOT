import { redirect } from "next/navigation";

type Props = { searchParams: Promise<{ message?: string; image?: string }> };

/** @deprecated Use `/communications` — kept for bookmarks and deep links. */
export default async function WhatsAppPage({ searchParams }: Props) {
  const params = await searchParams;
  const msg = params?.message;
  const image = params?.image;
  if (msg) {
    const qp = new URLSearchParams({
      ch: "wa",
      message: msg,
    });
    if (image) qp.set("image", image);
    redirect(`/communications?${qp.toString()}`);
  }
  redirect("/communications?ch=wa");
}
