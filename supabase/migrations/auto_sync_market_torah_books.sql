-- auto_sync_market_torah_books
--
-- Root cause: market_torah_books pre-existed migration 035
-- (035_soferim_and_market_torah.sql). The CREATE TABLE IF NOT EXISTS
-- was a no-op, so all columns from that definition were never added.
-- Migrations 037, 039, 041, 043 added their specific columns via
-- ALTER TABLE, but the 6 below were never backfilled.
--
-- This migration is:
--   • Additive only (no columns deleted or modified)
--   • Idempotent (IF NOT EXISTS on every statement)
--   • Safe for existing rows (no NOT NULL / no non-trivial DEFAULT)
--   • Aligned with the original 035 column definitions

ALTER TABLE public.market_torah_books
  ADD COLUMN IF NOT EXISTS size_cm NUMERIC;

ALTER TABLE public.market_torah_books
  ADD COLUMN IF NOT EXISTS parchment_type TEXT;

ALTER TABLE public.market_torah_books
  ADD COLUMN IF NOT EXISTS influencer_style TEXT;

ALTER TABLE public.market_torah_books
  ADD COLUMN IF NOT EXISTS current_progress TEXT;

ALTER TABLE public.market_torah_books
  ADD COLUMN IF NOT EXISTS expected_completion_date DATE;

ALTER TABLE public.market_torah_books
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- Force PostgREST to reload its schema cache so the new columns
-- are visible immediately without a restart.
NOTIFY pgrst, 'reload schema';
