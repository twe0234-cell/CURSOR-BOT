-- 094: sys_user_roles ג€” formal permission engine

CREATE TABLE IF NOT EXISTS sys_user_roles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN (
    'admin', 'employee', 'client', 'scribe', 'trader', 'partner'
  )),
  scope_type TEXT,
  scope_id   UUID,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by UUID REFERENCES auth.users(id),
  expires_at TIMESTAMPTZ,
  UNIQUE (user_id, role, scope_type, scope_id)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user
  ON sys_user_roles (user_id, role);

CREATE INDEX IF NOT EXISTS idx_user_roles_scope
  ON sys_user_roles (scope_type, scope_id);

ALTER TABLE sys_user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.sys_user_roles
    WHERE user_id = auth.uid()
      AND role = 'admin'
      AND (expires_at IS NULL OR expires_at > now())
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.has_role(p_role TEXT, p_scope_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.sys_user_roles
    WHERE user_id = auth.uid()
      AND role = p_role
      AND (scope_id IS NULL OR scope_id = p_scope_id)
      AND (expires_at IS NULL OR expires_at > now())
  );
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sys_user_roles'
      AND policyname = 'user_roles_self_read'
  ) THEN
    CREATE POLICY user_roles_self_read ON sys_user_roles
      FOR SELECT
      USING (user_id = auth.uid() OR public.is_admin_user());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sys_user_roles'
      AND policyname = 'user_roles_admin_insert'
  ) THEN
    CREATE POLICY user_roles_admin_insert ON sys_user_roles
      FOR INSERT
      WITH CHECK (public.is_admin_user());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sys_user_roles'
      AND policyname = 'user_roles_admin_update'
  ) THEN
    CREATE POLICY user_roles_admin_update ON sys_user_roles
      FOR UPDATE
      USING (public.is_admin_user())
      WITH CHECK (public.is_admin_user());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sys_user_roles'
      AND policyname = 'user_roles_admin_delete'
  ) THEN
    CREATE POLICY user_roles_admin_delete ON sys_user_roles
      FOR DELETE
      USING (public.is_admin_user());
  END IF;
END;
$$;

INSERT INTO sys_user_roles (user_id, role, scope_type)
SELECT id, 'admin', 'global'
FROM auth.users
ORDER BY created_at
LIMIT 1
ON CONFLICT DO NOTHING;
