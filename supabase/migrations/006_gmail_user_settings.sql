-- Add Gmail OAuth columns to user_settings
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS gmail_refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS gmail_email TEXT;
