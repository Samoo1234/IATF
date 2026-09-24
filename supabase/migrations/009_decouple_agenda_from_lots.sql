-- Migration 009: Decouple Agenda from Lots (Suporte a serviços avulsos vinculados a fazendas)

-- 1. Permite que lot_id seja nulo (opcional para agendamentos avulsos)
ALTER TABLE management_events ALTER COLUMN lot_id DROP NOT NULL;

-- 2. Adiciona farm_id diretamente em management_events
ALTER TABLE management_events ADD COLUMN IF NOT EXISTS farm_id UUID REFERENCES farms(id) ON DELETE CASCADE;

-- 3. Adiciona título/descrição do serviço e tipo de evento
ALTER TABLE management_events ADD COLUMN IF NOT EXISTS title VARCHAR(255);
ALTER TABLE management_events ADD COLUMN IF NOT EXISTS event_type VARCHAR(50) DEFAULT 'lote';

-- 4. Preenche retroativamente farm_id de todos os eventos existentes a partir do lote
UPDATE management_events me
SET farm_id = il.farm_id
FROM iatf_lots il
WHERE me.lot_id = il.id AND me.farm_id IS NULL;

-- 5. Atualiza o event_type dos eventos existentes para 'lote'
UPDATE management_events
SET event_type = 'lote'
WHERE event_type IS NULL;

-- 6. Índices de performance
CREATE INDEX IF NOT EXISTS idx_management_events_farm ON management_events(farm_id);
CREATE INDEX IF NOT EXISTS idx_management_events_farm_date ON management_events(farm_id, planned_date);
CREATE INDEX IF NOT EXISTS idx_management_events_event_type ON management_events(event_type);
