// CRM unified communications (see migration 048_unified_crm_communications.sql)

export type CrmHistoryDirection = "in" | "out" | "internal";

export type CrmHistorySource = "gmail" | "whatsapp" | "system" | "manual";

/** Row shape for `crm_contact_history` used in contact detail timeline */
export type CrmContactHistoryEntry = {
  id: string;
  body: string;
  created_at: string;
  follow_up_date: string | null;
  direction: CrmHistoryDirection;
  source: CrmHistorySource;
  external_reference_id: string | null;
  metadata: Record<string, unknown>;
};

export type AddHistoryEntryInput = {
  body: string;
  follow_up_date?: string | null;
  direction?: CrmHistoryDirection;
  source?: CrmHistorySource;
  external_reference_id?: string | null;
  metadata?: Record<string, unknown>;
};
