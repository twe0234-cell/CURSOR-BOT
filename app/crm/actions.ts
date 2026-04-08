"use server";

/**
 * CRM server actions – thin delegation layer.
 *
 * Each action:
 *  1. Calls the corresponding service function (all business logic lives there).
 *  2. On success, calls `revalidatePath` to invalidate Next.js cache.
 *  3. Returns the result unchanged to the caller.
 *
 * No business logic, validation, or Supabase calls live here.
 * See: src/services/crm.service.ts
 */

import { revalidatePath } from "next/cache";
import * as crm from "@/src/services/crm.service";

// ─── Re-export types so existing imports from "@/app/crm/actions" keep working ──

export type {
  CrmContact,
  ContactDetailResult,
  ActionResult,
  CreateCrmContactInput,
  UpdateCrmContactInput,
  AddHistoryEntryInput,
  AddHistoryEntryResult,
} from "@/src/services/crm.service";

// ─── Read-only actions (no cache invalidation needed) ────────────────────────

export async function fetchCrmContacts() {
  return crm.fetchCrmContacts();
}

export async function fetchScribes() {
  return crm.fetchScribes();
}

export async function fetchDealers() {
  return crm.fetchDealers();
}

export async function fetchContactDetail(id: string) {
  return crm.fetchContactDetail(id);
}

// ─── Mutation actions (invalidate cache on success) ──────────────────────────

export async function importGmailContacts() {
  const result = await crm.importGmailContacts();
  if (result.success) revalidatePath("/crm");
  return result;
}

export async function createClientContact(name: string, phone?: string) {
  const result = await crm.createClientContact(name, phone);
  if (result.success) {
    revalidatePath("/crm");
    revalidatePath("/sales");
  }
  return result;
}

export async function createMerchantContact(name: string) {
  const result = await crm.createMerchantContact(name);
  if (result.success) {
    revalidatePath("/crm");
    revalidatePath("/market");
  }
  return result;
}

export async function createScribeContact(name: string) {
  const result = await crm.createScribeContact(name);
  if (result.success) revalidatePath("/crm");
  return result;
}

export async function bulkImportCrmContacts(rows: Record<string, unknown>[]) {
  const result = await crm.bulkImportCrmContacts(rows);
  if (result.success) revalidatePath("/crm");
  return result;
}

export async function createCrmContact(input: crm.CreateCrmContactInput) {
  const result = await crm.createCrmContact(input);
  if (result.success) revalidatePath("/crm");
  return result;
}

export async function updateCrmContact(
  id: string,
  input: crm.UpdateCrmContactInput
) {
  const result = await crm.updateCrmContact(id, input);
  if (result.success) {
    revalidatePath("/crm");
    revalidatePath(`/crm/${id}`);
  }
  return result;
}

export async function updateContactTags(contactId: string, tags: string[]) {
  const result = await crm.updateContactTags(contactId, tags);
  if (result.success) {
    revalidatePath("/crm");
    revalidatePath(`/crm/${contactId}`);
  }
  return result;
}

export async function addContactHistoryNote(contactId: string, body: string, follow_up_date?: string | null) {
  const result = await crm.addContactHistoryNote(contactId, body, follow_up_date);
  if (result.success) {
    revalidatePath("/crm");
    revalidatePath(`/crm/${contactId}`);
  }
  return result;
}

export async function addHistoryEntry(contactId: string, input: crm.AddHistoryEntryInput) {
  const result = await crm.addHistoryEntry(contactId, input);
  if (result.success) {
    revalidatePath("/crm");
    revalidatePath(`/crm/${contactId}`);
  }
  return result;
}

export async function addTransaction(
  contactId: string,
  amount: number,
  type: "Debt" | "Credit",
  description?: string
) {
  const result = await crm.addTransaction(contactId, amount, type, description);
  if (result.success) {
    revalidatePath("/crm");
    revalidatePath(`/crm/${contactId}`);
  }
  return result;
}

export async function addDocument(
  contactId: string,
  fileUrl: string,
  docType?: string,
  name?: string
) {
  const result = await crm.addDocument(contactId, fileUrl, docType, name);
  if (result.success) {
    revalidatePath("/crm");
    revalidatePath(`/crm/${contactId}`);
  }
  return result;
}

export async function upsertSoferProfile(
  contactId: string,
  fields: Parameters<typeof crm.upsertSoferProfile>[1]
) {
  const result = await crm.upsertSoferProfile(contactId, fields);
  if (result.success) revalidatePath(`/crm/${contactId}`);
  return result;
}

export async function findDuplicateCrmContacts() {
  return crm.findDuplicateCrmContacts();
}

export async function mergeCrmContacts(primaryId: string, duplicateIds: string[]) {
  const result = await crm.mergeCrmContacts(primaryId, duplicateIds);
  if (result.success) revalidatePath("/crm");
  return result;
}
