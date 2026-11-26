-- ============================================================================
-- MIGRATION 014: ÍNDICES DE PERFORMANCE PARA CHAVES ESTRANGEIRAS E CONSULTAS
-- ATENÇÃO: VALIDAR EM STAGING ANTES DE APLICAR EM PRODUÇÃO.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_iatf_lot_animals_lot_id ON public.iatf_lot_animals (lot_id);
CREATE INDEX IF NOT EXISTS idx_iatf_lot_animals_animal_id ON public.iatf_lot_animals (animal_id);
CREATE INDEX IF NOT EXISTS idx_iatf_lot_animals_bull_id ON public.iatf_lot_animals (bull_id);
CREATE INDEX IF NOT EXISTS idx_iatf_lot_animals_semen_batch_id ON public.iatf_lot_animals (semen_batch_id);

CREATE INDEX IF NOT EXISTS idx_animal_managements_animal_id ON public.animal_managements (animal_id);
CREATE INDEX IF NOT EXISTS idx_animal_managements_lot_id ON public.animal_managements (lot_id);
CREATE INDEX IF NOT EXISTS idx_animal_managements_org_date ON public.animal_managements (organization_id, execution_date DESC);

CREATE INDEX IF NOT EXISTS idx_management_events_lot_id ON public.management_events (lot_id);
CREATE INDEX IF NOT EXISTS idx_management_events_org_planned ON public.management_events (organization_id, planned_date);

CREATE INDEX IF NOT EXISTS idx_animals_org_farm_tag ON public.animals (organization_id, farm_id, tag_number);
CREATE INDEX IF NOT EXISTS idx_iatf_lots_org_farm_season ON public.iatf_lots (organization_id, farm_id, season_id);

CREATE INDEX IF NOT EXISTS idx_org_members_user_status ON public.organization_members (user_id, status);
