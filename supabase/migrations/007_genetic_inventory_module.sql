-- ============================================================================
-- MIGRAÇÃO 007: MÓDULO COMPLETO DE ESTOQUE DE SÊMEN, DOSES E EMBRIÕES
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Centrais de Inseminação / Fornecedores Genéticos
CREATE TABLE IF NOT EXISTS genetic_centers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    short_name VARCHAR(100),
    document_number VARCHAR(30),
    contact_phone VARCHAR(50),
    contact_email VARCHAR(255),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Clientes / Proprietários de Material Genético (Custódia de Terceiros)
CREATE TABLE IF NOT EXISTS genetic_clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    document_number VARCHAR(30),
    phone VARCHAR(50),
    email VARCHAR(255),
    notes TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Botijões Criogênicos
CREATE TABLE IF NOT EXISTS semen_tanks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    number VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL, -- Apelido ou identificação
    brand VARCHAR(100),
    model VARCHAR(100),
    serial_number VARCHAR(100),
    capacity_notes VARCHAR(255),
    current_nitrogen_level NUMERIC(5,2) NOT NULL DEFAULT 100.00 CHECK (current_nitrogen_level >= 0 AND current_nitrogen_level <= 100),
    minimum_nitrogen_level NUMERIC(5,2) NOT NULL DEFAULT 25.00 CHECK (minimum_nitrogen_level >= 0 AND minimum_nitrogen_level <= 100),
    status VARCHAR(50) NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'manutencao', 'inativo')),
    notes TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_semen_tanks_farm_number ON semen_tanks(farm_id, number) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_semen_tanks_farm_status ON semen_tanks(farm_id, status);

-- 4. Canecas dos Botijões (Cilindros 1..10+)
CREATE TABLE IF NOT EXISTS semen_tank_canisters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    tank_id UUID NOT NULL REFERENCES semen_tanks(id) ON DELETE CASCADE,
    position_number INT NOT NULL CHECK (position_number > 0),
    nickname VARCHAR(100),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tank_id, position_number)
);

CREATE INDEX IF NOT EXISTS idx_tank_canisters_tank ON semen_tank_canisters(tank_id, position_number);

-- 5. Histórico de Medições de Nitrogênio
CREATE TABLE IF NOT EXISTS tank_nitrogen_measurements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    tank_id UUID NOT NULL REFERENCES semen_tanks(id) ON DELETE CASCADE,
    level_percent NUMERIC(5,2) NOT NULL CHECK (level_percent >= 0 AND level_percent <= 100),
    measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    measured_by VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nitrogen_measurements_tank ON tank_nitrogen_measurements(tank_id, measured_at DESC);

-- 6. Cadastro de Material Genético (Sêmen / Embrião)
CREATE TABLE IF NOT EXISTS genetic_materials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('SEMEN', 'EMBRYO')),
    sire_id UUID REFERENCES bulls(id) ON DELETE SET NULL,
    donor_id UUID REFERENCES animals(id) ON DELETE SET NULL,
    donor_name VARCHAR(255), -- Para doadoras externas ou animais sem registro na tabela animals
    donor_rgd VARCHAR(100),
    breed_id UUID REFERENCES breeds(id) ON DELETE SET NULL,
    sexing VARCHAR(30) NOT NULL DEFAULT 'convencional' CHECK (sexing IN ('convencional', 'femea', 'macho')),
    package_type VARCHAR(50) NOT NULL DEFAULT 'palheta_025' CHECK (package_type IN ('palheta_025', 'palheta_050', 'ampola', 'mini_tube', 'pellets', 'outro')),
    cryopreservation VARCHAR(30) NOT NULL DEFAULT 'nao_aplicavel' CHECK (cryopreservation IN ('DT', 'VT', 'nao_aplicavel')),
    material_code VARCHAR(100),
    description TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_genetic_materials_farm_type ON genetic_materials(farm_id, type);
CREATE INDEX IF NOT EXISTS idx_genetic_materials_sire ON genetic_materials(sire_id);
CREATE INDEX IF NOT EXISTS idx_genetic_materials_donor ON genetic_materials(donor_id);

-- 7. Lotes / Partidas de Material Genético
CREATE TABLE IF NOT EXISTS genetic_material_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    material_id UUID NOT NULL REFERENCES genetic_materials(id) ON DELETE CASCADE,
    center_id UUID REFERENCES genetic_centers(id) ON DELETE SET NULL,
    batch_number VARCHAR(100) NOT NULL,
    rack_code VARCHAR(50),
    manufactured_at DATE,
    expires_at DATE,
    cost_per_unit NUMERIC(10,2) DEFAULT 0.00,
    supplier_name VARCHAR(255),
    notes TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_material_batches_material ON genetic_material_batches(material_id);
CREATE INDEX IF NOT EXISTS idx_material_batches_farm_batch ON genetic_material_batches(farm_id, batch_number);

-- 8. Movimentações de Estoque (Livro Razão Imutável)
CREATE TABLE IF NOT EXISTS genetic_inventory_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    movement_type VARCHAR(30) NOT NULL CHECK (movement_type IN (
        'INBOUND',
        'OUTBOUND',
        'TRANSFER_OUT',
        'TRANSFER_IN',
        'USAGE',
        'LOSS',
        'ADJUSTMENT_POSITIVE',
        'ADJUSTMENT_NEGATIVE',
        'REVERSAL'
    )),
    material_type VARCHAR(20) NOT NULL CHECK (material_type IN ('SEMEN', 'EMBRYO')),
    batch_id UUID NOT NULL REFERENCES genetic_material_batches(id) ON DELETE RESTRICT,
    quantity INT NOT NULL CHECK (quantity > 0),
    owner_client_id UUID REFERENCES genetic_clients(id) ON DELETE SET NULL, -- NULL = estoque próprio da fazenda
    source_tank_id UUID REFERENCES semen_tanks(id) ON DELETE RESTRICT,
    source_canister_id UUID REFERENCES semen_tank_canisters(id) ON DELETE RESTRICT,
    destination_tank_id UUID REFERENCES semen_tanks(id) ON DELETE RESTRICT,
    destination_canister_id UUID REFERENCES semen_tank_canisters(id) ON DELETE RESTRICT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reason VARCHAR(255),
    notes TEXT,
    reference_type VARCHAR(100), -- Ex: 'iatf_lots', 'animal_managements', 'invoice'
    reference_id UUID,           -- ID do lote ou manejo vinculado
    transfer_group_id UUID,      -- Compartilhado entre TRANSFER_OUT e TRANSFER_IN
    idempotency_key VARCHAR(255),
    reversed_movement_id UUID REFERENCES genetic_inventory_movements(id),
    created_by VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gen_mov_farm_occurred ON genetic_inventory_movements(farm_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_gen_mov_batch ON genetic_inventory_movements(batch_id);
CREATE INDEX IF NOT EXISTS idx_gen_mov_type ON genetic_inventory_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_gen_mov_transfer ON genetic_inventory_movements(transfer_group_id);
CREATE INDEX IF NOT EXISTS idx_gen_mov_reference ON genetic_inventory_movements(reference_type, reference_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gen_mov_idempotency ON genetic_inventory_movements(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- 9. Saldo Materializado de Estoque
CREATE TABLE IF NOT EXISTS genetic_inventory_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL REFERENCES genetic_material_batches(id) ON DELETE RESTRICT,
    tank_id UUID NOT NULL REFERENCES semen_tanks(id) ON DELETE RESTRICT,
    canister_id UUID NOT NULL REFERENCES semen_tank_canisters(id) ON DELETE RESTRICT,
    owner_client_id UUID REFERENCES genetic_clients(id) ON DELETE SET NULL,
    quantity_available INT NOT NULL DEFAULT 0 CHECK (quantity_available >= 0),
    last_movement_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice único composto considerando cliente nulo como próprio
CREATE UNIQUE INDEX IF NOT EXISTS idx_genetic_balances_unique_pos 
ON genetic_inventory_balances (
    farm_id, 
    batch_id, 
    tank_id, 
    canister_id, 
    COALESCE(owner_client_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

CREATE INDEX IF NOT EXISTS idx_genetic_balances_farm_tank ON genetic_inventory_balances(farm_id, tank_id, canister_id);
CREATE INDEX IF NOT EXISTS idx_genetic_balances_qty ON genetic_inventory_balances(quantity_available);

-- 10. Comprovantes de Retirada Emitidos
CREATE TABLE IF NOT EXISTS genetic_withdrawal_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    movement_id UUID NOT NULL REFERENCES genetic_inventory_movements(id) ON DELETE CASCADE,
    receipt_number VARCHAR(100) NOT NULL UNIQUE,
    file_path VARCHAR(500),
    file_hash VARCHAR(255),
    recipient_name VARCHAR(255),
    recipient_document VARCHAR(50),
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    generated_by VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_withdrawal_receipts_farm ON genetic_withdrawal_receipts(farm_id, generated_at DESC);

-- 11. Trilha de Auditoria
CREATE TABLE IF NOT EXISTS genetic_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    user_id UUID,
    user_name VARCHAR(255),
    action VARCHAR(100) NOT NULL,
    entity VARCHAR(100) NOT NULL,
    entity_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address VARCHAR(100),
    user_agent TEXT,
    correlation_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_genetic_audit_farm_entity ON genetic_audit_logs(farm_id, entity, entity_id);

-- ============================================================================
-- FUNÇÕES TRANSACIONAIS DO MOTOR DE ESTOQUE (ACID & ANTI-SALDO-NEGATIVO)
-- ============================================================================

-- A. Entrada de Material
CREATE OR REPLACE FUNCTION fn_process_genetic_inbound(
    p_organization_id UUID,
    p_farm_id UUID,
    p_batch_id UUID,
    p_material_type VARCHAR,
    p_tank_id UUID,
    p_canister_id UUID,
    p_owner_client_id UUID,
    p_quantity INT,
    p_reason VARCHAR,
    p_notes TEXT,
    p_created_by VARCHAR,
    p_occurred_at TIMESTAMPTZ DEFAULT NOW(),
    p_idempotency_key VARCHAR DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_movement_id UUID;
    v_client_uuid UUID;
BEGIN
    IF p_quantity <= 0 THEN
        RAISE EXCEPTION 'A quantidade para entrada deve ser estritamente positiva.';
    END IF;

    -- Verificar idempotência se chave fornecida
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_movement_id FROM genetic_inventory_movements WHERE idempotency_key = p_idempotency_key;
        IF v_movement_id IS NOT NULL THEN
            RETURN v_movement_id;
        END IF;
    END IF;

    -- 1. Inserir movimento no livro razão
    INSERT INTO genetic_inventory_movements (
        organization_id, farm_id, movement_type, material_type,
        batch_id, quantity, owner_client_id,
        destination_tank_id, destination_canister_id,
        occurred_at, reason, notes, idempotency_key, created_by
    ) VALUES (
        p_organization_id, p_farm_id, 'INBOUND', p_material_type,
        p_batch_id, p_quantity, p_owner_client_id,
        p_tank_id, p_canister_id,
        COALESCE(p_occurred_at, NOW()), p_reason, p_notes, p_idempotency_key, p_created_by
    ) RETURNING id INTO v_movement_id;

    -- 2. Atualizar ou criar saldo materializado
    v_client_uuid := COALESCE(p_owner_client_id, '00000000-0000-0000-0000-000000000000'::uuid);

    INSERT INTO genetic_inventory_balances (
        organization_id, farm_id, batch_id, tank_id, canister_id,
        owner_client_id, quantity_available, last_movement_at, version, updated_at
    ) VALUES (
        p_organization_id, p_farm_id, p_batch_id, p_tank_id, p_canister_id,
        p_owner_client_id, p_quantity, COALESCE(p_occurred_at, NOW()), 1, NOW()
    )
    ON CONFLICT (farm_id, batch_id, tank_id, canister_id, COALESCE(owner_client_id, '00000000-0000-0000-0000-000000000000'::uuid))
    DO UPDATE SET
        quantity_available = genetic_inventory_balances.quantity_available + p_quantity,
        last_movement_at = COALESCE(p_occurred_at, NOW()),
        version = genetic_inventory_balances.version + 1,
        updated_at = NOW();

    RETURN v_movement_id;
END;
$$;

-- B. Saída / Retirada com Trava de Saldo e Emissão de Comprovante
CREATE OR REPLACE FUNCTION fn_process_genetic_outbound(
    p_organization_id UUID,
    p_farm_id UUID,
    p_batch_id UUID,
    p_material_type VARCHAR,
    p_tank_id UUID,
    p_canister_id UUID,
    p_owner_client_id UUID,
    p_quantity INT,
    p_reason VARCHAR,
    p_notes TEXT,
    p_reference_type VARCHAR,
    p_reference_id UUID,
    p_recipient_name VARCHAR,
    p_recipient_document VARCHAR,
    p_created_by VARCHAR,
    p_occurred_at TIMESTAMPTZ DEFAULT NOW(),
    p_idempotency_key VARCHAR DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_balance_id UUID;
    v_current_qty INT;
    v_movement_id UUID;
    v_receipt_id UUID;
    v_receipt_number VARCHAR(100);
    v_client_uuid UUID;
BEGIN
    IF p_quantity <= 0 THEN
        RAISE EXCEPTION 'A quantidade para retirada deve ser maior que zero.';
    END IF;

    -- Verificar idempotência
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_movement_id FROM genetic_inventory_movements WHERE idempotency_key = p_idempotency_key;
        IF v_movement_id IS NOT NULL THEN
            SELECT id, receipt_number INTO v_receipt_id, v_receipt_number 
            FROM genetic_withdrawal_receipts WHERE movement_id = v_movement_id;
            RETURN jsonb_build_object('movement_id', v_movement_id, 'receipt_number', v_receipt_number, 'receipt_id', v_receipt_id);
        END IF;
    END IF;

    v_client_uuid := COALESCE(p_owner_client_id, '00000000-0000-0000-0000-000000000000'::uuid);

    -- 1. Buscar e travar o saldo concorrentemente (FOR UPDATE)
    SELECT id, quantity_available INTO v_balance_id, v_current_qty
    FROM genetic_inventory_balances
    WHERE farm_id = p_farm_id
      AND batch_id = p_batch_id
      AND tank_id = p_tank_id
      AND canister_id = p_canister_id
      AND COALESCE(owner_client_id, '00000000-0000-0000-0000-000000000000'::uuid) = v_client_uuid
    FOR UPDATE;

    IF v_balance_id IS NULL THEN
        RAISE EXCEPTION 'Não existe saldo registrado para este lote nesta localização.';
    END IF;

    IF v_current_qty < p_quantity THEN
        RAISE EXCEPTION 'Saldo insuficiente. Disponível: % doses. Solicitado: % doses.', v_current_qty, p_quantity;
    END IF;

    -- 2. Decrementar saldo
    UPDATE genetic_inventory_balances
    SET quantity_available = quantity_available - p_quantity,
        last_movement_at = COALESCE(p_occurred_at, NOW()),
        version = version + 1,
        updated_at = NOW()
    WHERE id = v_balance_id;

    -- 3. Inserir movimento no livro razão
    INSERT INTO genetic_inventory_movements (
        organization_id, farm_id, movement_type, material_type,
        batch_id, quantity, owner_client_id,
        source_tank_id, source_canister_id,
        occurred_at, reason, notes, reference_type, reference_id,
        idempotency_key, created_by
    ) VALUES (
        p_organization_id, p_farm_id, 'OUTBOUND', p_material_type,
        p_batch_id, p_quantity, p_owner_client_id,
        p_tank_id, p_canister_id,
        COALESCE(p_occurred_at, NOW()), p_reason, p_notes, p_reference_type, p_reference_id,
        p_idempotency_key, p_created_by
    ) RETURNING id INTO v_movement_id;

    -- 4. Gerar comprovante de retirada
    v_receipt_number := 'REC-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || UPPER(SUBSTRING(gen_random_uuid()::text, 1, 8));

    INSERT INTO genetic_withdrawal_receipts (
        organization_id, farm_id, movement_id, receipt_number,
        recipient_name, recipient_document, generated_at, generated_by
    ) VALUES (
        p_organization_id, p_farm_id, v_movement_id, v_receipt_number,
        p_recipient_name, p_recipient_document, NOW(), p_created_by
    ) RETURNING id INTO v_receipt_id;

    RETURN jsonb_build_object(
        'movement_id', v_movement_id,
        'receipt_number', v_receipt_number,
        'receipt_id', v_receipt_id,
        'remaining_quantity', v_current_qty - p_quantity
    );
END;
$$;

-- C. Transferência Atômica entre Botijões / Canecas
CREATE OR REPLACE FUNCTION fn_process_genetic_transfer(
    p_organization_id UUID,
    p_farm_id UUID,
    p_batch_id UUID,
    p_material_type VARCHAR,
    p_source_tank_id UUID,
    p_source_canister_id UUID,
    p_dest_tank_id UUID,
    p_dest_canister_id UUID,
    p_owner_client_id UUID,
    p_quantity INT,
    p_reason VARCHAR,
    p_notes TEXT,
    p_created_by VARCHAR,
    p_occurred_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_transfer_group_id UUID := gen_random_uuid();
    v_source_balance_id UUID;
    v_source_qty INT;
    v_client_uuid UUID;
BEGIN
    IF p_quantity <= 0 THEN
        RAISE EXCEPTION 'A quantidade para transferência deve ser maior que zero.';
    END IF;

    IF p_source_tank_id = p_dest_tank_id AND p_source_canister_id = p_dest_canister_id THEN
        RAISE EXCEPTION 'A localização de origem não pode ser idêntica à de destino.';
    END IF;

    v_client_uuid := COALESCE(p_owner_client_id, '00000000-0000-0000-0000-000000000000'::uuid);

    -- 1. Travar e validar saldo da origem
    SELECT id, quantity_available INTO v_source_balance_id, v_source_qty
    FROM genetic_inventory_balances
    WHERE farm_id = p_farm_id
      AND batch_id = p_batch_id
      AND tank_id = p_source_tank_id
      AND canister_id = p_source_canister_id
      AND COALESCE(owner_client_id, '00000000-0000-0000-0000-000000000000'::uuid) = v_client_uuid
    FOR UPDATE;

    IF v_source_balance_id IS NULL THEN
        RAISE EXCEPTION 'Origem não possui registro de saldo para este lote.';
    END IF;

    IF v_source_qty < p_quantity THEN
        RAISE EXCEPTION 'Saldo insuficiente na origem para transferir. Disponível: %, Solicitado: %', v_source_qty, p_quantity;
    END IF;

    -- 2. Debitar na origem
    UPDATE genetic_inventory_balances
    SET quantity_available = quantity_available - p_quantity,
        last_movement_at = COALESCE(p_occurred_at, NOW()),
        version = version + 1,
        updated_at = NOW()
    WHERE id = v_source_balance_id;

    -- 3. Creditar no destino
    INSERT INTO genetic_inventory_balances (
        organization_id, farm_id, batch_id, tank_id, canister_id,
        owner_client_id, quantity_available, last_movement_at, version, updated_at
    ) VALUES (
        p_organization_id, p_farm_id, p_batch_id, p_dest_tank_id, p_dest_canister_id,
        p_owner_client_id, p_quantity, COALESCE(p_occurred_at, NOW()), 1, NOW()
    )
    ON CONFLICT (farm_id, batch_id, tank_id, canister_id, COALESCE(owner_client_id, '00000000-0000-0000-0000-000000000000'::uuid))
    DO UPDATE SET
        quantity_available = genetic_inventory_balances.quantity_available + p_quantity,
        last_movement_at = COALESCE(p_occurred_at, NOW()),
        version = genetic_inventory_balances.version + 1,
        updated_at = NOW();

    -- 4. Registrar as duas movimentações no livro razão compartilhando o transfer_group_id
    INSERT INTO genetic_inventory_movements (
        organization_id, farm_id, movement_type, material_type,
        batch_id, quantity, owner_client_id,
        source_tank_id, source_canister_id,
        destination_tank_id, destination_canister_id,
        transfer_group_id, occurred_at, reason, notes, created_by
    ) VALUES 
    (
        p_organization_id, p_farm_id, 'TRANSFER_OUT', p_material_type,
        p_batch_id, p_quantity, p_owner_client_id,
        p_source_tank_id, p_source_canister_id,
        p_dest_tank_id, p_dest_canister_id,
        v_transfer_group_id, COALESCE(p_occurred_at, NOW()), p_reason, p_notes, p_created_by
    ),
    (
        p_organization_id, p_farm_id, 'TRANSFER_IN', p_material_type,
        p_batch_id, p_quantity, p_owner_client_id,
        p_source_tank_id, p_source_canister_id,
        p_dest_tank_id, p_dest_canister_id,
        v_transfer_group_id, COALESCE(p_occurred_at, NOW()), p_reason, p_notes, p_created_by
    );

    RETURN v_transfer_group_id;
END;
$$;

-- D. Consumo Rastreável e Idempotente em Lotes / Manejos de IATF
CREATE OR REPLACE FUNCTION fn_process_genetic_usage_iatf(
    p_organization_id UUID,
    p_farm_id UUID,
    p_batch_id UUID,
    p_tank_id UUID,
    p_canister_id UUID,
    p_owner_client_id UUID,
    p_quantity INT,
    p_reference_type VARCHAR, -- 'iatf_lots' ou 'animal_managements'
    p_reference_id UUID,
    p_inseminator_name VARCHAR,
    p_notes TEXT,
    p_created_by VARCHAR,
    p_idempotency_key VARCHAR
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_movement_id UUID;
    v_balance_id UUID;
    v_current_qty INT;
    v_client_uuid UUID;
BEGIN
    IF p_quantity <= 0 THEN
        RAISE EXCEPTION 'A quantidade utilizada deve ser positiva.';
    END IF;

    -- Trava idempotente contra duplo desconto do mesmo procedimento/animal
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_movement_id FROM genetic_inventory_movements WHERE idempotency_key = p_idempotency_key;
        IF v_movement_id IS NOT NULL THEN
            RETURN v_movement_id;
        END IF;
    END IF;

    v_client_uuid := COALESCE(p_owner_client_id, '00000000-0000-0000-0000-000000000000'::uuid);

    -- Travar saldo
    SELECT id, quantity_available INTO v_balance_id, v_current_qty
    FROM genetic_inventory_balances
    WHERE farm_id = p_farm_id
      AND batch_id = p_batch_id
      AND tank_id = p_tank_id
      AND canister_id = p_canister_id
      AND COALESCE(owner_client_id, '00000000-0000-0000-0000-000000000000'::uuid) = v_client_uuid
    FOR UPDATE;

    IF v_balance_id IS NULL OR v_current_qty < p_quantity THEN
        RAISE EXCEPTION 'Saldo insuficiente para utilização em IATF. Disponível: %, Solicitado: %', COALESCE(v_current_qty, 0), p_quantity;
    END IF;

    -- Baixar saldo
    UPDATE genetic_inventory_balances
    SET quantity_available = quantity_available - p_quantity,
        last_movement_at = NOW(),
        version = version + 1,
        updated_at = NOW()
    WHERE id = v_balance_id;

    -- Inserir movimento
    INSERT INTO genetic_inventory_movements (
        organization_id, farm_id, movement_type, material_type,
        batch_id, quantity, owner_client_id,
        source_tank_id, source_canister_id,
        occurred_at, reason, notes, reference_type, reference_id,
        idempotency_key, created_by
    ) VALUES (
        p_organization_id, p_farm_id, 'USAGE', 'SEMEN',
        p_batch_id, p_quantity, p_owner_client_id,
        p_tank_id, p_canister_id,
        NOW(), 'Inseminação Artificial (IATF)', 
        COALESCE(p_notes, '') || CASE WHEN p_inseminator_name IS NOT NULL THEN ' | Inseminador: ' || p_inseminator_name ELSE '' END,
        p_reference_type, p_reference_id,
        p_idempotency_key, p_created_by
    ) RETURNING id INTO v_movement_id;

    RETURN v_movement_id;
END;
$$;

-- E. Ajuste de Estoque / Perda com Justificativa Obrigatória
CREATE OR REPLACE FUNCTION fn_process_genetic_adjustment(
    p_organization_id UUID,
    p_farm_id UUID,
    p_batch_id UUID,
    p_material_type VARCHAR,
    p_tank_id UUID,
    p_canister_id UUID,
    p_owner_client_id UUID,
    p_quantity INT,
    p_is_positive BOOLEAN,
    p_is_loss BOOLEAN,
    p_reason VARCHAR,
    p_notes TEXT,
    p_created_by VARCHAR
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_movement_id UUID;
    v_mov_type VARCHAR(30);
    v_balance_id UUID;
    v_current_qty INT;
    v_client_uuid UUID;
BEGIN
    IF p_quantity <= 0 THEN
        RAISE EXCEPTION 'A quantidade deve ser estritamente positiva.';
    END IF;

    IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
        RAISE EXCEPTION 'O motivo do ajuste/perda é obrigatório.';
    END IF;

    IF p_is_loss THEN
        v_mov_type := 'LOSS';
    ELSIF p_is_positive THEN
        v_mov_type := 'ADJUSTMENT_POSITIVE';
    ELSE
        v_mov_type := 'ADJUSTMENT_NEGATIVE';
    END IF;

    v_client_uuid := COALESCE(p_owner_client_id, '00000000-0000-0000-0000-000000000000'::uuid);

    -- Ajustes negativos exigem validação de saldo
    IF NOT p_is_positive THEN
        SELECT id, quantity_available INTO v_balance_id, v_current_qty
        FROM genetic_inventory_balances
        WHERE farm_id = p_farm_id
          AND batch_id = p_batch_id
          AND tank_id = p_tank_id
          AND canister_id = p_canister_id
          AND COALESCE(owner_client_id, '00000000-0000-0000-0000-000000000000'::uuid) = v_client_uuid
        FOR UPDATE;

        IF v_balance_id IS NULL OR v_current_qty < p_quantity THEN
            RAISE EXCEPTION 'Saldo insuficiente para ajuste negativo/perda. Disponível: %, Solicitado: %', COALESCE(v_current_qty, 0), p_quantity;
        END IF;

        UPDATE genetic_inventory_balances
        SET quantity_available = quantity_available - p_quantity,
            last_movement_at = NOW(),
            version = version + 1,
            updated_at = NOW()
        WHERE id = v_balance_id;
    ELSE
        -- Ajuste positivo adiciona saldo
        INSERT INTO genetic_inventory_balances (
            organization_id, farm_id, batch_id, tank_id, canister_id,
            owner_client_id, quantity_available, last_movement_at, version, updated_at
        ) VALUES (
            p_organization_id, p_farm_id, p_batch_id, p_tank_id, p_canister_id,
            p_owner_client_id, p_quantity, NOW(), 1, NOW()
        )
        ON CONFLICT (farm_id, batch_id, tank_id, canister_id, COALESCE(owner_client_id, '00000000-0000-0000-0000-000000000000'::uuid))
        DO UPDATE SET
            quantity_available = genetic_inventory_balances.quantity_available + p_quantity,
            last_movement_at = NOW(),
            version = genetic_inventory_balances.version + 1,
            updated_at = NOW();
    END IF;

    INSERT INTO genetic_inventory_movements (
        organization_id, farm_id, movement_type, material_type,
        batch_id, quantity, owner_client_id,
        source_tank_id, source_canister_id,
        destination_tank_id, destination_canister_id,
        occurred_at, reason, notes, created_by
    ) VALUES (
        p_organization_id, p_farm_id, v_mov_type, p_material_type,
        p_batch_id, p_quantity, p_owner_client_id,
        CASE WHEN NOT p_is_positive THEN p_tank_id ELSE NULL END,
        CASE WHEN NOT p_is_positive THEN p_canister_id ELSE NULL END,
        CASE WHEN p_is_positive THEN p_tank_id ELSE NULL END,
        CASE WHEN p_is_positive THEN p_canister_id ELSE NULL END,
        NOW(), p_reason, p_notes, p_created_by
    ) RETURNING id INTO v_movement_id;

    RETURN v_movement_id;
END;
$$;

-- F. Estorno Seguro de Movimentação (Imutável)
CREATE OR REPLACE FUNCTION fn_process_genetic_reversal(
    p_organization_id UUID,
    p_farm_id UUID,
    p_movement_id UUID,
    p_reason VARCHAR,
    p_created_by VARCHAR
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_orig genetic_inventory_movements%ROWTYPE;
    v_reversal_id UUID;
    v_balance_id UUID;
    v_current_qty INT;
    v_client_uuid UUID;
BEGIN
    IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
        RAISE EXCEPTION 'A justificativa do estorno é obrigatória.';
    END IF;

    SELECT * INTO v_orig FROM genetic_inventory_movements WHERE id = p_movement_id;

    IF v_orig.id IS NULL THEN
        RAISE EXCEPTION 'Movimentação não encontrada.';
    END IF;

    IF v_orig.movement_type = 'REVERSAL' THEN
        RAISE EXCEPTION 'Não é possível estornar um estorno.';
    END IF;

    -- Verificar se já foi estornada
    IF EXISTS (SELECT 1 FROM genetic_inventory_movements WHERE reversed_movement_id = p_movement_id) THEN
        RAISE EXCEPTION 'Esta movimentação já foi estornada anteriormente.';
    END IF;

    v_client_uuid := COALESCE(v_orig.owner_client_id, '00000000-0000-0000-0000-000000000000'::uuid);

    -- Inversão do efeito no saldo de acordo com o tipo original
    IF v_orig.movement_type IN ('INBOUND', 'ADJUSTMENT_POSITIVE') THEN
        -- Estornar uma entrada exige debitar o saldo
        SELECT id, quantity_available INTO v_balance_id, v_current_qty
        FROM genetic_inventory_balances
        WHERE farm_id = p_farm_id
          AND batch_id = v_orig.batch_id
          AND tank_id = v_orig.destination_tank_id
          AND canister_id = v_orig.destination_canister_id
          AND COALESCE(owner_client_id, '00000000-0000-0000-0000-000000000000'::uuid) = v_client_uuid
        FOR UPDATE;

        IF v_balance_id IS NULL OR v_current_qty < v_orig.quantity THEN
            RAISE EXCEPTION 'Não é possível estornar: as doses já foram utilizadas ou movimentadas (saldo remanescente: %).', COALESCE(v_current_qty, 0);
        END IF;

        UPDATE genetic_inventory_balances
        SET quantity_available = quantity_available - v_orig.quantity,
            last_movement_at = NOW(),
            version = version + 1,
            updated_at = NOW()
        WHERE id = v_balance_id;

    ELSIF v_orig.movement_type IN ('OUTBOUND', 'USAGE', 'LOSS', 'ADJUSTMENT_NEGATIVE') THEN
        -- Estornar uma saída credita de volta na localização de origem
        INSERT INTO genetic_inventory_balances (
            organization_id, farm_id, batch_id, tank_id, canister_id,
            owner_client_id, quantity_available, last_movement_at, version, updated_at
        ) VALUES (
            p_organization_id, p_farm_id, v_orig.batch_id, v_orig.source_tank_id, v_orig.source_canister_id,
            v_orig.owner_client_id, v_orig.quantity, NOW(), 1, NOW()
        )
        ON CONFLICT (farm_id, batch_id, tank_id, canister_id, COALESCE(owner_client_id, '00000000-0000-0000-0000-000000000000'::uuid))
        DO UPDATE SET
            quantity_available = genetic_inventory_balances.quantity_available + v_orig.quantity,
            last_movement_at = NOW(),
            version = genetic_inventory_balances.version + 1,
            updated_at = NOW();
    END IF;

    -- Registrar o estorno imutável no livro razão
    INSERT INTO genetic_inventory_movements (
        organization_id, farm_id, movement_type, material_type,
        batch_id, quantity, owner_client_id,
        source_tank_id, source_canister_id,
        destination_tank_id, destination_canister_id,
        reversed_movement_id, occurred_at, reason, notes, created_by
    ) VALUES (
        p_organization_id, p_farm_id, 'REVERSAL', v_orig.material_type,
        v_orig.batch_id, v_orig.quantity, v_orig.owner_client_id,
        v_orig.destination_tank_id, v_orig.destination_canister_id,
        v_orig.source_tank_id, v_orig.source_canister_id,
        p_movement_id, NOW(), p_reason, 'Estorno referente ao movimento ' || p_movement_id::text, p_created_by
    ) RETURNING id INTO v_reversal_id;

    RETURN v_reversal_id;
END;
$$;

-- G. Registro de Medição de Nitrogênio
CREATE OR REPLACE FUNCTION fn_record_nitrogen_measurement(
    p_organization_id UUID,
    p_farm_id UUID,
    p_tank_id UUID,
    p_level_percent NUMERIC,
    p_measured_by VARCHAR,
    p_notes TEXT,
    p_measured_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_measurement_id UUID;
BEGIN
    IF p_level_percent < 0 OR p_level_percent > 100 THEN
        RAISE EXCEPTION 'O nível de nitrogênio deve estar entre 0%% e 100%%.';
    END IF;

    -- 1. Inserir medição no histórico
    INSERT INTO tank_nitrogen_measurements (
        organization_id, farm_id, tank_id, level_percent,
        measured_at, measured_by, notes
    ) VALUES (
        p_organization_id, p_farm_id, p_tank_id, p_level_percent,
        COALESCE(p_measured_at, NOW()), p_measured_by, p_notes
    ) RETURNING id INTO v_measurement_id;

    -- 2. Atualizar nível atual no botijão
    UPDATE semen_tanks
    SET current_nitrogen_level = p_level_percent,
        updated_at = NOW()
    WHERE id = p_tank_id;

    RETURN v_measurement_id;
END;
$$;

-- ============================================================================
-- HABILITAÇÃO DE RLS E POLÍTICAS DE ACESSO
-- ============================================================================

ALTER TABLE genetic_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE genetic_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE semen_tanks ENABLE ROW LEVEL SECURITY;
ALTER TABLE semen_tank_canisters ENABLE ROW LEVEL SECURITY;
ALTER TABLE tank_nitrogen_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE genetic_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE genetic_material_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE genetic_inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE genetic_inventory_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE genetic_withdrawal_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE genetic_audit_logs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    tbl text;
    tables text[] := ARRAY[
        'genetic_centers',
        'genetic_clients',
        'semen_tanks',
        'semen_tank_canisters',
        'tank_nitrogen_measurements',
        'genetic_materials',
        'genetic_material_batches',
        'genetic_inventory_movements',
        'genetic_inventory_balances',
        'genetic_withdrawal_receipts',
        'genetic_audit_logs'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables
    LOOP
        BEGIN
            EXECUTE format('GRANT ALL ON TABLE %I TO anon, authenticated, service_role;', tbl);
            EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', tbl || '_dev_policy', tbl);
            EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO public USING (true) WITH CHECK (true);', tbl || '_dev_policy', tbl);
        EXCEPTION
            WHEN undefined_table THEN
                NULL;
        END;
    END LOOP;
END $$;
