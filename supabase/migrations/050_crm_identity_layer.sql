-- Phase 1.7: Identity layer for external IDs → CRM contact (Gmail/WhatsApp/import JSON)
-- No sync logic here — schema only.

-- ─────────────────────────────────────────────────────────────
-- 1) crm_contact_identities — many identifiers → one contact
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_contact_identities (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id            UUID NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  source                TEXT NOT NULL DEFAULT 'import'
                          CHECK (source IN ('gmail', 'whatsapp', 'system', 'manual', 'import')),
  identity_type         TEXT NOT NULL
                          CHECK (identity_type IN ('email', 'phone', 'wa_chat_id', 'external')),
  value_normalized      TEXT NOT NULL,
  value_raw             TEXT,
  external_reference_id TEXT,
  metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, identity_type, value_normalized)
);

CREATE INDEX IF NOT EXISTS idx_crm_contact_identities_contact
  ON public.crm_contact_identities(contact_id);

CREATE INDEX IF NOT EXISTS idx_crm_contact_identities_user
  ON public.crm_contact_identities(user_id);

COMMENT ON TABLE public.crm_contact_identities IS
  'Maps normalized external identifiers (email, phone, WA chat, opaque id) to a single crm_contacts row per tenant.';

COMMENT ON COLUMN public.crm_contact_identities.metadata IS
  'Structured payload from imports (e.g. Gmail thread ids, labels, raw JSON fragments).';

ALTER TABLE public.crm_contact_identities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_contact_identities_select" ON public.crm_contact_identities;
CREATE POLICY "crm_contact_identities_select" ON public.crm_contact_identities
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "crm_contact_identities_insert" ON public.crm_contact_identities;
CREATE POLICY "crm_contact_identities_insert" ON public.crm_contact_identities
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "crm_contact_identities_update" ON public.crm_contact_identities;
CREATE POLICY "crm_contact_identities_update" ON public.crm_contact_identities
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "crm_contact_identities_delete" ON public.crm_contact_identities;
CREATE POLICY "crm_contact_identities_delete" ON public.crm_contact_identities
  FOR DELETE USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_contact_identities TO authenticated;
GRANT ALL ON public.crm_contact_identities TO service_role;


-- ─────────────────────────────────────────────────────────────
-- 2) crm_merge_suggestions — future AI / heuristic dedup queue
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_merge_suggestions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id_a    UUID NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  contact_id_b    UUID NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  confidence      NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 100),
  reason          TEXT,
  evidence        JSONB NOT NULL DEFAULT '{}'::jsonb,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'accepted', 'dismissed', 'expired')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ,
  CONSTRAINT crm_merge_suggestions_distinct_contacts CHECK (contact_id_a <> contact_id_b)
);

CREATE INDEX IF NOT EXISTS idx_crm_merge_suggestions_user_status
  ON public.crm_merge_suggestions(user_id, status);

COMMENT ON TABLE public.crm_merge_suggestions IS
  'Queued pairs of contacts that may represent the same person; evidence JSON for structured import/ML signals.';

COMMENT ON COLUMN public.crm_merge_suggestions.evidence IS
  'Structured JSON: matching fields, scores, source system references.';

ALTER TABLE public.crm_merge_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_merge_suggestions_select" ON public.crm_merge_suggestions;
CREATE POLICY "crm_merge_suggestions_select" ON public.crm_merge_suggestions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "crm_merge_suggestions_insert" ON public.crm_merge_suggestions;
CREATE POLICY "crm_merge_suggestions_insert" ON public.crm_merge_suggestions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "crm_merge_suggestions_update" ON public.crm_merge_suggestions;
CREATE POLICY "crm_merge_suggestions_update" ON public.crm_merge_suggestions
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "crm_merge_suggestions_delete" ON public.crm_merge_suggestions;
CREATE POLICY "crm_merge_suggestions_delete" ON public.crm_merge_suggestions
  FOR DELETE USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_merge_suggestions TO authenticated;
GRANT ALL ON public.crm_merge_suggestions TO service_role;
