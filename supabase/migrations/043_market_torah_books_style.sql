-- Migration 043: add style column to market_torah_books
--
-- The original CREATE TABLE in 035_soferim_and_market_torah.sql included
-- `style TEXT`, but the table already existed in production when that
-- migration was applied, so the CREATE TABLE IF NOT EXISTS was a no-op
-- and the column was never created.
--
-- This migration adds the column safely:
--   • ADD COLUMN IF NOT EXISTS is idempotent — safe to re-run.
--   • No NOT NULL constraint and no default, so all existing rows keep
--     their current data unchanged (column will be NULL for old rows).
--   • Application code already handles NULL: mapBookRow returns
--     (b.style ?? null) and every insert uses (v.style ?? null).

ALTER TABLE public.market_torah_books
  ADD COLUMN IF NOT EXISTS style TEXT;
