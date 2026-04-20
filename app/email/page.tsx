import { redirect } from "next/navigation";

type Props = { searchParams: Promise<{ tab?: string }> };

/** @deprecated Use `/communications` — kept for bookmarks and deep links. */
export default async function EmailPage({ searchParams }: Props) {
  const params = await searchParams;
  const tab = params?.tab === "contacts" ? "contacts" : "compose";
  redirect(`/communications?ch=email&emailTab=${tab}`);
}
