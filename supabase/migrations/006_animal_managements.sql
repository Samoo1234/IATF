-- ============================================================================
-- MIGRAÇÃO 006: MANEJO INDIVIDUAL POR ANIMAL E PROTOCOLOS REALIZADOS
-- ============================================================================

CREATE TABLE IF NOT EXISTS animal_managements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    animal_id UUID NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
    season_id UUID REFERENCES reproductive_seasons(id) ON DELETE SET NULL,
    protocol_id UUID REFERENCES protocols(id) ON DELETE SET NULL,
    lot_id UUID REFERENCES iatf_lots(id) ON DELETE SET NULL, -- Opcional, caso participe de um lote
    
    cycle_number INT NOT NULL DEFAULT 1, -- 1ª IATF, 2ª IATF (Ressia), 3ª IATF
    
    -- Datas calculadas / planejadas
    start_date DATE NOT NULL, -- D0 planejado
    d7_date DATE,
    d9_date DATE,
    ia_date DATE,
    dg_date DATE,
    
    -- Etapa D0 (Início / Implante)
    d0_executed_at DATE,
    d0_responsible VARCHAR(255),
    d0_notes TEXT,
    
    -- Etapa Intermediária D7 / D9 (Retirada P4 + Indutor)
    d9_executed_at DATE,
    d9_responsible VARCHAR(255),
    d9_device_loss BOOLEAN DEFAULT FALSE,
    d9_notes TEXT,
    
    -- Etapa IA (Inseminação Artificial)
    ia_executed_at DATE,
    bull_id UUID REFERENCES bulls(id) ON DELETE SET NULL,
    semen_batch_id UUID REFERENCES semen_batches(id) ON DELETE SET NULL,
    inseminator_name VARCHAR(255),
    ecc_ia NUMERIC(3,2),
    ia_notes TEXT,
    
    -- Etapa DG (Diagnóstico de Gestação)
    dg_executed_at DATE,
    pregnancy_status VARCHAR(50) DEFAULT 'pendente', -- pendente, prenha, vazia, inconclusivo
    ecc_dg NUMERIC(3,2),
    expected_parturition_date DATE,
    dg_notes TEXT,
    
    status VARCHAR(50) NOT NULL DEFAULT 'em_andamento', -- em_andamento, concluido, cancelado
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices de Desempenho
CREATE INDEX IF NOT EXISTS idx_animal_managements_animal ON animal_managements(animal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_animal_managements_org_farm ON animal_managements(organization_id, farm_id);
CREATE INDEX IF NOT EXISTS idx_animal_managements_status ON animal_managements(status);

-- RLS
ALTER TABLE animal_managements ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Dev full access to animal_managements" ON animal_managements;
    CREATE POLICY "Dev full access to animal_managements"
        ON animal_managements
        FOR ALL
        TO public
        USING (true)
        WITH CHECK (true);
END $$;
