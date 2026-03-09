-- Create storage bucket 'media' for broadcast images
-- Run this in Supabase SQL Editor (Dashboard -> SQL Editor)
INSERT INTO storage.buckets (id, name, public)
VALUES ('media', 'media', true)
ON CONFLICT (id) DO NOTHING;
