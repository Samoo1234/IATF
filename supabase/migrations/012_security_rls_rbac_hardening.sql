-- ============================================================================
-- MIGRATION 012: HARDENING DE SEGURANÇA, RLS MULTI-TENANT, RBAC E VIEWS
-- ATENÇÃO: VALIDAR EM STAGING ANTES DE APLICAR EM PRODUÇÃO.
-- ============================================================================

-- 1. Revogar execução anônima/pública de funções SECURITY DEFINER críticas
REVOKE EXECUTE ON FUNCTION public.create_team_member_user(UUID, VARCHAR, VARCHAR, VARCHAR, VARCHAR) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_team_member_user(UUID, VARCHAR, VARCHAR, VARCHAR, VARCHAR) TO service_role;

DO $$
DECLARE
  fn RECORD;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
  LOOP
    -- Fixar search_path imutável em todas as funções SECURITY DEFINER do schema public
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', fn.sig);
    -- Revogar execução de anon em funções SECURITY DEFINER
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', fn.sig);
  END LOOP;
END $$;

-- 2. Função auxiliar segura de pertencimento ativo à organização (com InitPlan)
CREATE OR REPLACE FUNCTION public.get_user_org_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT organization_id
  FROM public.organization_members
  WHERE user_id = (SELECT auth.uid())
    AND COALESCE(status, 'active') = 'active';
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE organization_id = p_org_id
      AND user_id = (SELECT auth.uid())
      AND role = 'admin'
      AND COALESCE(status, 'active') = 'active'
  );
$$;

-- 3. Remover políticas permissivas de desenvolvimento (USING (true) / WITH CHECK (true))
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        policyname ILIKE '%dev%'
        OR policyname ILIKE '%allow_all%'
        OR qual = 'true'
        OR with_check = 'true'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END $$;

-- 4. Blindar organization_members contra escalação de privilégio e cross-tenant
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_org_members ON public.organization_members;
DROP POLICY IF EXISTS org_members_select ON public.organization_members;
DROP POLICY IF EXISTS org_members_admin_write ON public.organization_members;

CREATE POLICY org_members_select ON public.organization_members
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR organization_id IN (SELECT public.get_user_org_ids())
  );

CREATE POLICY org_members_admin_insert ON public.organization_members
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin(organization_id));

CREATE POLICY org_members_admin_update ON public.organization_members
  FOR UPDATE TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

CREATE POLICY org_members_admin_delete ON public.organization_members
  FOR DELETE TO authenticated
  USING (public.is_org_admin(organization_id));

-- 5. Garantir RLS multi-tenant estrito em todas as tabelas com organization_id
DO $$
DECLARE
  tbl TEXT;
  tables_with_org TEXT[] := ARRAY[
    'farms', 'reproductive_seasons', 'properties', 'breeds', 'animal_categories',
    'bulls', 'protocols', 'animals', 'iatf_lots', 'management_events',
    'semen_batches', 'veterinarians', 'animal_managements',
    'genetic_tanks', 'genetic_canisters', 'genetic_clients',
    'genetic_inventory_items', 'genetic_movements', 'genetic_receipts'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables_with_org LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'organization_id'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
      EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_%I ON public.%I', tbl, tbl);
      EXECUTE format(
        'CREATE POLICY tenant_isolation_%I ON public.%I FOR ALL TO authenticated ' ||
        'USING (organization_id IN (SELECT public.get_user_org_ids())) ' ||
        'WITH CHECK (organization_id IN (SELECT public.get_user_org_ids()))',
        tbl, tbl
      );
    END IF;
  END LOOP;
END $$;

-- 6. Converter views para security_invoker = true (elimina security_definer_view)
DO $$
DECLARE
  v RECORD;
BEGIN
  FOR v IN
    SELECT viewname
    FROM pg_views
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', v.viewname);
  END LOOP;
END $$;
