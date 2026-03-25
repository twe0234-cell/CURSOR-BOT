import { redirect, notFound } from "next/navigation";
import ContactDetailClient from "./ContactDetailClient";
import { loadContactDetailPage } from "@/src/services/crm.service";

/**
 * CRM contact detail – data loading lives in `loadContactDetailPage` (crm.service).
 * This file only: resolve params, map auth/not-found, render.
 */
export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await loadContactDetailPage(id);

  if (!result.success) {
    if (result.error === "יש להתחבר") redirect("/login");
    notFound();
  }

  return <ContactDetailClient {...result.data} />;
}
