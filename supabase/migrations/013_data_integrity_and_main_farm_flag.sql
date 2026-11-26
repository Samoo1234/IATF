-- ============================================================================
-- MIGRATION 013: INTEGRIDADE DE DADOS, FAZENDA PRINCIPAL E ESTORNO GENÉTICO
-- ATENÇÃO: VALIDAR EM STAGING ANTES DE APLICAR EM PRODUÇÃO.
-- ============================================================================

-- 1. Coluna explícita is_main_farm (substitui busca frágil por substring 'principal')
ALTER TABLE public.farms
  ADD COLUMN IF NOT EXISTS is_main_farm BOOLEAN NOT NULL DEFAULT false;

-- Backfill não-destrutivo: marca fazendas existentes com 'principal' no nome (1 por organização)
WITH ranked AS (
  SELECT id, organization_id,
         ROW_NUMBER() OVER (PARTITION BY organization_id ORDER BY created_at ASC) AS rn
  FROM public.farms
  WHERE lower(name) LIKE '%principal%'
)
UPDATE public.farms f
SET is_main_farm = true
FROM ranked r
WHERE f.id = r.id AND r.rn = 1 AND f.is_main_farm = false;

-- Garante no máximo uma fazenda principal por organização
CREATE UNIQUE INDEX IF NOT EXISTS uq_farms_one_main_per_org
  ON public.farms (organization_id)
  WHERE is_main_farm = true;

-- 2. Endurecer freeze_farm / unfreeze_farm para exigir admin ativo da organização
CREATE OR REPLACE FUNCTION public.freeze_farm(p_farm_id UUID, p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_org_admin(p_org_id) THEN
    RAISE EXCEPTION 'Apenas administradores ativos podem congelar fazendas.';
  END IF;

  UPDATE public.farms
  SET status = 'frozen', updated_at = NOW()
  WHERE id = p_farm_id AND organization_id = p_org_id;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.unfreeze_farm(p_farm_id UUID, p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_org_admin(p_org_id) THEN
    RAISE EXCEPTION 'Apenas administradores ativos podem descongelar fazendas.';
  END IF;

  UPDATE public.farms
  SET status = 'active', updated_at = NOW()
  WHERE id = p_farm_id AND organization_id = p_org_id;
  RETURN FOUND;
END;
$$;

-- 3. Tornar handle_new_user_onboarding idempotente para não conflitar com criação administrativa
CREATE OR REPLACE FUNCTION public.handle_new_user_onboarding()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  new_org_id UUID;
  user_name TEXT;
BEGIN
  -- Se o usuário já foi vinculado a uma organização (ex: criação via /api/team/members), não cria org duplicada
  IF EXISTS (SELECT 1 FROM public.organization_members WHERE user_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  user_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1));

  INSERT INTO public.organizations (name, code)
  VALUES (
    'Agropecuária ' || initcap(user_name),
    'ORG-' || UPPER(SUBSTRING(MD5(NEW.id::text) FROM 1 FOR 6))
  )
  RETURNING id INTO new_org_id;

  INSERT INTO public.organization_members (organization_id, user_id, role, display_name, email, status)
  VALUES (new_org_id, NEW.id, 'admin', initcap(user_name), NEW.email, 'active')
  ON CONFLICT (organization_id, user_id) DO NOTHING;

  INSERT INTO public.farms (organization_id, name, owner_name, technical_responsible, state, is_main_farm)
  VALUES (
    new_org_id,
    'Fazenda Principal ' || initcap(user_name),
    initcap(user_name),
    'MV. ' || initcap(user_name),
    'MT',
    true
  );

  RETURN NEW;
END;
$$;
