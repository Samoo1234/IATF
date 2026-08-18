# SCHEMA DO BANCO DE DADOS — SUPABASE POSTGRESQL

## 1. Diretrizes de Arquitetura do Banco de Dados

1. **Chaves Primárias**: UUID v4 gerados via `gen_random_uuid()`.
2. **Isolamento Multi-Tenant**: Coluna `organization_id NOT NULL` em todas as tabelas operacionais com FK para `organizations(id)`.
3. **Timestamps**: Utilização estrita de `timestamptz` com fuso horário `America/Cuiaba` (padrão Brasil/Centro-Oeste).
4. **Soft Delete**: Coluna `deleted_at timestamptz` onde auditoria de exclusão for necessária.
5. **Normalização**: Modelo em 3ª Forma Normal (3FN), sem tabelas dinâmicas por lote ou ano.

---

## 2. Estrutura de Tabelas (DDL)

```sql
-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. ESTRUTURA MULTI-TENANT E ORGANIZAÇÕES
-- ============================================================================

CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) UNIQUE,
    document_number VARCHAR(20),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE organization_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL, -- Referência ao auth.users do Supabase
    role VARCHAR(50) NOT NULL DEFAULT 'operator', -- admin, manager, vet, tech, inseminator, operator, viewer
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, user_id)
);

-- ============================================================================
-- 2. UNIDADES GEOGRÁFICAS E PROPRIEDADES
-- ============================================================================

CREATE TABLE farms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    owner_name VARCHAR(255),
    technical_responsible VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE properties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL, -- Ex: Retiro 01, Invernada A
    code VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 3. ANIMAIS E REPRODUTORES
-- ============================================================================

CREATE TABLE breeds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL, -- Nelore, Angus, Brangus, Braford, Senepol
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE animal_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL, -- Novilha, Primípara, Secundípara, Multípara
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE animals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
    tag_number VARCHAR(100) NOT NULL, -- Brinco / Marcação visual
    rfid_number VARCHAR(100),
    sex VARCHAR(1) NOT NULL DEFAULT 'F', -- F (Fêmea) / M (Macho)
    breed_id UUID REFERENCES breeds(id),
    category_id UUID REFERENCES animal_categories(id),
    birth_date DATE,
    status VARCHAR(50) NOT NULL DEFAULT 'active', -- active, sold, dead, discarded
    reproductive_status VARCHAR(50) DEFAULT 'vazia', -- vazia, inseminada, prenha, descartada
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, farm_id, tag_number)
);

CREATE TABLE bulls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(100), -- Código do touro (ex: NGD 1234)
    registration_number VARCHAR(100),
    breed_id UUID REFERENCES breeds(id),
    owner_central VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 4. ESTOQUE E INSUMOS (SÊMEN, MEDICAMENTOS, DISPOSITIVOS)
-- ============================================================================

CREATE TABLE semen_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    bull_id UUID NOT NULL REFERENCES bulls(id) ON DELETE CASCADE,
    batch_number VARCHAR(100) NOT NULL, -- Número da partida
    supplier_central VARCHAR(255),
    initial_quantity INT NOT NULL DEFAULT 0,
    used_quantity INT NOT NULL DEFAULT 0,
    lost_quantity INT NOT NULL DEFAULT 0,
    current_stock INT GENERATED ALWAYS AS (initial_quantity - used_quantity - lost_quantity) STORED,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE medications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL, -- Benzoato, PGF2a, eCG, Cipionato
    active_ingredient VARCHAR(255),
    unit VARCHAR(20) NOT NULL, -- ml, dose, frasco
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL, -- Implante P4 DIB / PRIMER
    manufacturer VARCHAR(255),
    max_uses INT NOT NULL DEFAULT 3,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 5. PROTOCOLOS REPRODUTIVOS
-- ============================================================================

CREATE TABLE protocols (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL, -- Protocolo 01 (3 Manejos)
    description TEXT,
    number_of_managements INT NOT NULL DEFAULT 3,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE protocol_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    protocol_id UUID NOT NULL REFERENCES protocols(id) ON DELETE CASCADE,
    step_order INT NOT NULL,
    code VARCHAR(20) NOT NULL, -- D0, D7, D9, IA, DG
    name VARCHAR(255) NOT NULL,
    day_offset INT NOT NULL, -- 0, 7, 9, 11, 44
    medication_id UUID REFERENCES medications(id),
    device_id UUID REFERENCES devices(id),
    dosage_instruction TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 6. ESTAÇÕES E LOTES DE IATF
-- ============================================================================

CREATE TABLE reproductive_seasons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL, -- 2025/2026
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE iatf_lots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    season_id UUID NOT NULL REFERENCES reproductive_seasons(id) ON DELETE CASCADE,
    farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    property_id UUID REFERENCES properties(id),
    protocol_id UUID NOT NULL REFERENCES protocols(id),
    code VARCHAR(100) NOT NULL, -- LOTE 01
    name VARCHAR(255),
    start_date DATE NOT NULL, -- Data D0
    ia_planned_date DATE,
    dg_planned_date DATE,
    responsible_user_id UUID,
    status VARCHAR(50) NOT NULL DEFAULT 'planejado', -- planejado, em_andamento, ia_concluida, finalizado, cancelado
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE iatf_lot_animals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lot_id UUID NOT NULL REFERENCES iatf_lots(id) ON DELETE CASCADE,
    animal_id UUID NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
    ecc_ia NUMERIC(3,2), -- Escore de Condição Corporal na IA (ex: 2.75)
    ecc_dg NUMERIC(3,2), -- ECC no DG
    bull_id UUID REFERENCES bulls(id),
    semen_batch_id UUID REFERENCES semen_batches(id),
    inseminator_name VARCHAR(255),
    pregnancy_status VARCHAR(50) DEFAULT 'pendente', -- prenha, vazia, inconclusivo, pendente
    expected_parturition_date DATE, -- Previsão de parto (Data IA + 295 dias)
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(lot_id, animal_id)
);

-- ============================================================================
-- 7. MANEJOS OPERACIONAIS E AGENDA DE CAMPO
-- ============================================================================

CREATE TABLE management_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    lot_id UUID NOT NULL REFERENCES iatf_lots(id) ON DELETE CASCADE,
    step_code VARCHAR(20) NOT NULL, -- D0, D7, D9, IA, DG
    planned_date DATE NOT NULL,
    execution_date DATE,
    start_time TIME,
    end_time TIME,
    animals_worked_count INT DEFAULT 0,
    losses_count INT DEFAULT 0,
    responsible_name VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'pendente', -- pendente, em_andamento, concluido, atrasado
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 8. AUDITORIA E PERDAS DE INSUMOS
-- ============================================================================

CREATE TABLE input_losses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    lot_id UUID REFERENCES iatf_lots(id),
    item_type VARCHAR(50) NOT NULL, -- implante, semen, medicamento
    item_id UUID,
    quantity INT NOT NULL DEFAULT 1,
    reason TEXT NOT NULL, -- Queda de brinco/dispositivo, quebra de palheta, contaminação
    responsible_name VARCHAR(255),
    loss_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID,
    action VARCHAR(100) NOT NULL, -- INSERT, UPDATE, DELETE
    table_name VARCHAR(100) NOT NULL,
    record_id UUID,
    old_data JSONB,
    new_data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 3. Índices de Desempenho Recomendados

```sql
CREATE INDEX idx_animals_org_farm ON animals(organization_id, farm_id);
CREATE INDEX idx_animals_tag ON animals(tag_number);
CREATE INDEX idx_iatf_lots_org_season ON iatf_lots(organization_id, season_id);
CREATE INDEX idx_lot_animals_lot ON iatf_lot_animals(lot_id);
CREATE INDEX idx_lot_animals_animal ON iatf_lot_animals(animal_id);
CREATE INDEX idx_management_events_date ON management_events(planned_date, status);
CREATE INDEX idx_semen_batches_bull ON semen_batches(bull_id);
```
