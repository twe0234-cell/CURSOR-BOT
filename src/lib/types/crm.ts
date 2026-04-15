// CRM — types aligned with supabase/migrations (Phase 3 identity: 071 + history 048)

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

// ── crm_contacts (core + 071) ────────────────────────────────────────────────

/** ערוץ מועדף בפורמט יציב (עמודה preferred_contact_method, מיגרציה 071) */
export type CrmPreferredContactMethod = "whatsapp" | "email" | "phone";

/**
 * Legacy UI/API — ערכים עם אות ראשונה גדולה (עמודה preferred_contact, מיגרציה 008)
 * @deprecated לטווח ארוך: השתמש ב-CrmPreferredContactMethod + מיפוי ב-UI
 */
export type CrmPreferredContactLegacy = "WhatsApp" | "Email" | "Phone";

/** רשומה ב-extra_phones / extra_emails (JSONB, מיגרציה 061) */
export type CrmExtraContactChannel = {
  label: string;
  value: string;
};

/**
 * שדות crm_contacts הרלוונטיים לזהות / קשר — לרוב select("*") או הרחבה הדרגתית ב-service
 * @see supabase/migrations/008_crm_schema.sql, 061_crm_extra_contacts.sql, 071_crm_phase3_identity_arrays_community.sql
 */
export type CrmContactIdentityFields = {
  id: string;
  user_id: string;
  name: string;
  type: string;
  /** legacy — מיפוי ל-preferred_contact_method */
  preferred_contact: CrmPreferredContactLegacy | string | null;
  preferred_contact_method: CrmPreferredContactMethod | null;
  wa_chat_id: string | null;
  /** טלפון ראשי; ריבוי ב-extra_phones */
  phone: string | null;
  /** דוא״ל ראשי; ריבוי ב-extra_emails */
  email: string | null;
  extra_phones: CrmExtraContactChannel[] | unknown;
  extra_emails: CrmExtraContactChannel[] | unknown;
  tags: string[] | null;
  notes: string | null;
  certification: string | null;
  phone_type: string | null;
  city: string | null;
  address: string | null;
  address_city: string | null;
  address_physical: string | null;
  /** קהילה — ערך התואם ל-sys_dropdowns.list_key = 'crm_community' */
  community: string | null;
  handwriting_image_url: string | null;
  sku: string | null;
  created_at: string;
  updated_at: string;
};

/** מפתח רשימה ב-sys_dropdowns לערכי קהילה (ניתן להרחבה דרך הטבלה) */
export const CRM_COMMUNITY_DROPDOWN_KEY = "crm_community" as const;
