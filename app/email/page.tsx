import { redirect } from "next/navigation";

type Props = {
  searchParams: Promise<{ tab?: string; prefillSubject?: string; prefillBody?: string }>;
};

/** @deprecated Use `/communications` — kept for bookmarks and deep links. */
export default async function EmailPage({ searchParams }: Props) {
  const params = await searchParams;
  const tab = params?.tab === "contacts" ? "contacts" : "compose";
  const qp = new URLSearchParams({ ch: "email", emailTab: tab });
  if (params?.prefillSubject) qp.set("prefillSubject", params.prefillSubject);
  if (params?.prefillBody) qp.set("prefillBody", params.prefillBody);
  redirect(`/communications?${qp.toString()}`);
}
