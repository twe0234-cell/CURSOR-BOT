-- Ensure public bucket `media` exists (WhatsApp / broadcast / inventory uploads use this id).
-- storage.buckets row is required before objects can be uploaded; RLS alone is not enough.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('media', 'media', true, 52428800, NULL)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  name = EXCLUDED.name;
