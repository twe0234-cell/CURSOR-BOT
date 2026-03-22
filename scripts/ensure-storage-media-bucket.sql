-- Temporary one-off: ensure `media` bucket + RLS on storage.objects
-- Bucket name used by app: app/broadcast/actions.ts → MEDIA_BUCKET = "media"
-- Run via: node fix-whatsapp-storage-media.mjs

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('media', 'media', true, 52428800, NULL)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  name = EXCLUDED.name;

-- SELECT
DROP POLICY IF EXISTS "media_select_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "media_select_anon" ON storage.objects;
CREATE POLICY "media_select_authenticated"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'media');
CREATE POLICY "media_select_anon"
  ON storage.objects FOR SELECT
  TO anon
  USING (bucket_id = 'media');

-- INSERT
DROP POLICY IF EXISTS "media_insert_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "media_insert_anon" ON storage.objects;
CREATE POLICY "media_insert_authenticated"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'media');
CREATE POLICY "media_insert_anon"
  ON storage.objects FOR INSERT
  TO anon
  WITH CHECK (bucket_id = 'media');

-- UPDATE
DROP POLICY IF EXISTS "media_update_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "media_update_anon" ON storage.objects;
CREATE POLICY "media_update_authenticated"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'media')
  WITH CHECK (bucket_id = 'media');
CREATE POLICY "media_update_anon"
  ON storage.objects FOR UPDATE
  TO anon
  USING (bucket_id = 'media')
  WITH CHECK (bucket_id = 'media');

-- DELETE
DROP POLICY IF EXISTS "media_delete_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "media_delete_anon" ON storage.objects;
CREATE POLICY "media_delete_authenticated"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'media');
CREATE POLICY "media_delete_anon"
  ON storage.objects FOR DELETE
  TO anon
  USING (bucket_id = 'media');
