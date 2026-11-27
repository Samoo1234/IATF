-- ============================================================================
-- ROLLBACK SCRIPT PARA MIGRATIONS 012, 013 e 014 (SOMENTE STAGING / EMERGÊNCIA)
-- ============================================================================

-- Rollback 014 (índices)
DROP INDEX IF EXISTS public.idx_iatf_lot_animals_lot_id;
DROP INDEX IF EXISTS public.idx_iatf_lot_animals_animal_id;
DROP INDEX IF EXISTS public.idx_iatf_lot_animals_bull_id;
DROP INDEX IF EXISTS public.idx_iatf_lot_animals_semen_batch_id;
DROP INDEX IF EXISTS public.idx_animal_managements_animal_id;
DROP INDEX IF EXISTS public.idx_animal_managements_lot_id;
DROP INDEX IF EXISTS public.idx_animal_managements_org_start_date;
DROP INDEX IF EXISTS public.idx_management_events_lot_id;
DROP INDEX IF EXISTS public.idx_management_events_org_planned;
DROP INDEX IF EXISTS public.idx_animals_org_farm_tag;
DROP INDEX IF EXISTS public.idx_iatf_lots_org_farm_season;
DROP INDEX IF EXISTS public.idx_org_members_user_status;

-- Rollback 013 (is_main_farm)
DROP INDEX IF EXISTS public.uq_farms_one_main_per_org;
ALTER TABLE public.farms DROP COLUMN IF EXISTS is_main_farm;

-- Rollback 012 (remover políticas dependentes antes de dropar funções)
DROP POLICY IF EXISTS org_update_admin ON public.organizations;
DROP POLICY IF EXISTS org_members_admin_insert ON public.organization_members;
DROP POLICY IF EXISTS org_members_admin_update ON public.organization_members;
DROP POLICY IF EXISTS org_members_admin_delete ON public.organization_members;

DROP FUNCTION IF EXISTS public.is_org_admin(UUID);
