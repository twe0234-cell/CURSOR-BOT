-- Add log_details to broadcast_queue for exact API response logging
ALTER TABLE public.broadcast_queue
  ADD COLUMN IF NOT EXISTS log_details JSONB;
