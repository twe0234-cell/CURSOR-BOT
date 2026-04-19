-- 073_torah_intake_submissions.sql
-- Public intake form for Torah/Tefillin/Mezuzah owners wishing to sell.
-- Submissions are append-only; admin reviews and approves into market_torah_books
-- or erp_torah_projects. All public writes go through a server action with the
-- service_role admin client (RLS bypassed server-side).

CREATE TABLE IF NOT EXISTS erp_torah_intake_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),

  status text NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review', 'approved', 'rejected', 'spam')),

  -- Owner (required)
  owner_name  text NOT NULL,
  owner_phone text NOT NULL,
  owner_email text NOT NULL,
  owner_city  text,

  -- Item (required)
  sefer_type text NOT NULL
    CHECK (sefer_type IN ('ספר תורה', 'תפילין', 'מזוזה', 'אחר')),

  -- Optional detail
  scribe_name   text,
  age_estimate  text,
  condition     text,
  description   text,
  asking_price  numeric(12, 2),

  -- Storage paths inside the "media" bucket: "torah-intake/{id}/{filename}"
  image_paths text[] NOT NULL DEFAULT ARRAY[]::text[],

  -- Abuse / audit
  submission_ip inet,
  user_agent    text,

  -- Email lifecycle
  confirmation_email_sent_at timestamptz,
  admin_notification_sent_at timestamptz,

  -- Review
  review_notes     text,
  reviewed_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at      timestamptz,
  approved_to_table text,
  approved_to_id    uuid
);

CREATE INDEX IF NOT EXISTS idx_intake_status_created
  ON erp_torah_intake_submissions (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_intake_ip_recent
  ON erp_torah_intake_submissions (submission_ip, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_intake_email_recent
  ON erp_torah_intake_submissions (owner_email, created_at DESC);

ALTER TABLE erp_torah_intake_submissions ENABLE ROW LEVEL SECURITY;

-- Server actions use service_role (admin client) which bypasses RLS.
-- Authenticated users (future /admin/torah-intake queue) may read/update.
-- Anon users MUST NOT read; the table may contain phone/email of non-customers.
DROP POLICY IF EXISTS intake_admin_all ON erp_torah_intake_submissions;
CREATE POLICY intake_admin_all
  ON erp_torah_intake_submissions
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE erp_torah_intake_submissions IS
  'Public intake — owners submitting Torah/Tefillin/Mezuzah for potential sale. Admin-reviewed before promotion to market_torah_books or erp_torah_projects.';
