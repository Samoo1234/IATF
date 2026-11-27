-- ============================================================================
-- MIGRATION 015: HARDENING DAS RPCS DO ESTOQUE GENÉTICO (TENANT + ESTORNO)
-- ============================================================================

-- Índice único para impedir duplo estorno concorrente de uma mesma movimentação
CREATE UNIQUE INDEX IF NOT EXISTS uq_genetic_movements_reversed_id
  ON public.genetic_inventory_movements (reversed_movement_id)
  WHERE reversed_movement_id IS NOT NULL;

-- Função auxiliar interna de validação de tenant + fazenda
CREATE OR REPLACE FUNCTION public.assert_org_farm_access(p_org_id UUID, p_farm_id UUID)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT (p_org_id IN (SELECT public.get_user_org_ids())) THEN
    RAISE EXCEPTION 'Acesso negado à organização.';
  END IF;

  IF p_farm_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.farms WHERE id = p_farm_id AND organization_id = p_org_id
  ) THEN
    RAISE EXCEPTION 'Fazenda não pertence à organização informada.';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assert_org_farm_access(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_org_farm_access(UUID, UUID) TO authenticated, service_role;

-- A. Entrada de Material
CREATE OR REPLACE FUNCTION public.fn_process_genetic_inbound(
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
SET search_path = public, pg_temp
AS $$
DECLARE
    v_movement_id UUID;
BEGIN
    PERFORM public.assert_org_farm_access(p_organization_id, p_farm_id);

    IF p_quantity <= 0 THEN
        RAISE EXCEPTION 'A quantidade para entrada deve ser estritamente positiva.';
    END IF;

    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_movement_id
        FROM public.genetic_inventory_movements
        WHERE idempotency_key = p_idempotency_key
          AND organization_id = p_organization_id;
        IF v_movement_id IS NOT NULL THEN
            RETURN v_movement_id;
        END IF;
    END IF;

    INSERT INTO public.genetic_inventory_movements (
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

    INSERT INTO public.genetic_inventory_balances (
        organization_id, farm_id, batch_id, tank_id, canister_id,
        owner_client_id, quantity_available, last_movement_at, version, updated_at
    ) VALUES (
        p_organization_id, p_farm_id, p_batch_id, p_tank_id, p_canister_id,
        p_owner_client_id, p_quantity, COALESCE(p_occurred_at, NOW()), 1, NOW()
    )
    ON CONFLICT (farm_id, batch_id, tank_id, canister_id, COALESCE(owner_client_id, '00000000-0000-0000-0000-000000000000'::uuid))
    DO UPDATE SET
        quantity_available = public.genetic_inventory_balances.quantity_available + p_quantity,
        last_movement_at = COALESCE(p_occurred_at, NOW()),
        version = public.genetic_inventory_balances.version + 1,
        updated_at = NOW();

    RETURN v_movement_id;
END;
$$;

-- B. Saída / Retirada
CREATE OR REPLACE FUNCTION public.fn_process_genetic_outbound(
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
SET search_path = public, pg_temp
AS $$
DECLARE
    v_balance_id UUID;
    v_current_qty INT;
    v_movement_id UUID;
    v_receipt_id UUID;
    v_receipt_number VARCHAR(100);
    v_client_uuid UUID;
BEGIN
    PERFORM public.assert_org_farm_access(p_organization_id, p_farm_id);

    IF p_quantity <= 0 THEN
        RAISE EXCEPTION 'A quantidade para retirada deve ser maior que zero.';
    END IF;

    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_movement_id
        FROM public.genetic_inventory_movements
        WHERE idempotency_key = p_idempotency_key
          AND organization_id = p_organization_id;
        IF v_movement_id IS NOT NULL THEN
            SELECT id, receipt_number INTO v_receipt_id, v_receipt_number
            FROM public.genetic_withdrawal_receipts WHERE movement_id = v_movement_id;
            RETURN jsonb_build_object('movement_id', v_movement_id, 'receipt_number', v_receipt_number, 'receipt_id', v_receipt_id);
        END IF;
    END IF;

    v_client_uuid := COALESCE(p_owner_client_id, '00000000-0000-0000-0000-000000000000'::uuid);

    SELECT id, quantity_available INTO v_balance_id, v_current_qty
    FROM public.genetic_inventory_balances
    WHERE organization_id = p_organization_id
      AND farm_id = p_farm_id
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

    UPDATE public.genetic_inventory_balances
    SET quantity_available = quantity_available - p_quantity,
        last_movement_at = COALESCE(p_occurred_at, NOW()),
        version = version + 1,
        updated_at = NOW()
    WHERE id = v_balance_id;

    INSERT INTO public.genetic_inventory_movements (
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

    v_receipt_number := 'REC-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || UPPER(SUBSTRING(gen_random_uuid()::text, 1, 8));

    INSERT INTO public.genetic_withdrawal_receipts (
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

-- C. Transferência Atômica
CREATE OR REPLACE FUNCTION public.fn_process_genetic_transfer(
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
SET search_path = public, pg_temp
AS $$
DECLARE
    v_transfer_group_id UUID := gen_random_uuid();
    v_source_balance_id UUID;
    v_source_qty INT;
    v_client_uuid UUID;
BEGIN
    PERFORM public.assert_org_farm_access(p_organization_id, p_farm_id);

    IF p_quantity <= 0 THEN
        RAISE EXCEPTION 'A quantidade para transferência deve ser maior que zero.';
    END IF;

    IF p_source_tank_id = p_dest_tank_id AND p_source_canister_id = p_dest_canister_id THEN
        RAISE EXCEPTION 'A localização de origem não pode ser idêntica à de destino.';
    END IF;

    v_client_uuid := COALESCE(p_owner_client_id, '00000000-0000-0000-0000-000000000000'::uuid);

    SELECT id, quantity_available INTO v_source_balance_id, v_source_qty
    FROM public.genetic_inventory_balances
    WHERE organization_id = p_organization_id
      AND farm_id = p_farm_id
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

    UPDATE public.genetic_inventory_balances
    SET quantity_available = quantity_available - p_quantity,
        last_movement_at = COALESCE(p_occurred_at, NOW()),
        version = version + 1,
        updated_at = NOW()
    WHERE id = v_source_balance_id;

    INSERT INTO public.genetic_inventory_balances (
        organization_id, farm_id, batch_id, tank_id, canister_id,
        owner_client_id, quantity_available, last_movement_at, version, updated_at
    ) VALUES (
        p_organization_id, p_farm_id, p_batch_id, p_dest_tank_id, p_dest_canister_id,
        p_owner_client_id, p_quantity, COALESCE(p_occurred_at, NOW()), 1, NOW()
    )
    ON CONFLICT (farm_id, batch_id, tank_id, canister_id, COALESCE(owner_client_id, '00000000-0000-0000-0000-000000000000'::uuid))
    DO UPDATE SET
        quantity_available = public.genetic_inventory_balances.quantity_available + p_quantity,
        last_movement_at = COALESCE(p_occurred_at, NOW()),
        version = public.genetic_inventory_balances.version + 1,
        updated_at = NOW();

    INSERT INTO public.genetic_inventory_movements (
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

-- D. Consumo Rastreável IATF
CREATE OR REPLACE FUNCTION public.fn_process_genetic_usage_iatf(
    p_organization_id UUID,
    p_farm_id UUID,
    p_batch_id UUID,
    p_tank_id UUID,
    p_canister_id UUID,
    p_owner_client_id UUID,
    p_quantity INT,
    p_reference_type VARCHAR,
    p_reference_id UUID,
    p_inseminator_name VARCHAR,
    p_notes TEXT,
    p_created_by VARCHAR,
    p_idempotency_key VARCHAR
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_movement_id UUID;
    v_balance_id UUID;
    v_current_qty INT;
    v_client_uuid UUID;
BEGIN
    PERFORM public.assert_org_farm_access(p_organization_id, p_farm_id);

    IF p_quantity <= 0 THEN
        RAISE EXCEPTION 'A quantidade utilizada deve ser positiva.';
    END IF;

    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_movement_id
        FROM public.genetic_inventory_movements
        WHERE idempotency_key = p_idempotency_key
          AND organization_id = p_organization_id;
        IF v_movement_id IS NOT NULL THEN
            RETURN v_movement_id;
        END IF;
    END IF;

    v_client_uuid := COALESCE(p_owner_client_id, '00000000-0000-0000-0000-000000000000'::uuid);

    SELECT id, quantity_available INTO v_balance_id, v_current_qty
    FROM public.genetic_inventory_balances
    WHERE organization_id = p_organization_id
      AND farm_id = p_farm_id
      AND batch_id = p_batch_id
      AND tank_id = p_tank_id
      AND canister_id = p_canister_id
      AND COALESCE(owner_client_id, '00000000-0000-0000-0000-000000000000'::uuid) = v_client_uuid
    FOR UPDATE;

    IF v_balance_id IS NULL OR v_current_qty < p_quantity THEN
        RAISE EXCEPTION 'Saldo insuficiente para utilização em IATF. Disponível: %, Solicitado: %', COALESCE(v_current_qty, 0), p_quantity;
    END IF;

    UPDATE public.genetic_inventory_balances
    SET quantity_available = quantity_available - p_quantity,
        last_movement_at = NOW(),
        version = version + 1,
        updated_at = NOW()
    WHERE id = v_balance_id;

    INSERT INTO public.genetic_inventory_movements (
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

-- E. Ajuste / Perda
CREATE OR REPLACE FUNCTION public.fn_process_genetic_adjustment(
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
SET search_path = public, pg_temp
AS $$
DECLARE
    v_movement_id UUID;
    v_mov_type VARCHAR(30);
    v_balance_id UUID;
    v_current_qty INT;
    v_client_uuid UUID;
BEGIN
    PERFORM public.assert_org_farm_access(p_organization_id, p_farm_id);

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

    IF NOT p_is_positive THEN
        SELECT id, quantity_available INTO v_balance_id, v_current_qty
        FROM public.genetic_inventory_balances
        WHERE organization_id = p_organization_id
          AND farm_id = p_farm_id
          AND batch_id = p_batch_id
          AND tank_id = p_tank_id
          AND canister_id = p_canister_id
          AND COALESCE(owner_client_id, '00000000-0000-0000-0000-000000000000'::uuid) = v_client_uuid
        FOR UPDATE;

        IF v_balance_id IS NULL OR v_current_qty < p_quantity THEN
            RAISE EXCEPTION 'Saldo insuficiente para ajuste negativo/perda. Disponível: %, Solicitado: %', COALESCE(v_current_qty, 0), p_quantity;
        END IF;

        UPDATE public.genetic_inventory_balances
        SET quantity_available = quantity_available - p_quantity,
            last_movement_at = NOW(),
            version = version + 1,
            updated_at = NOW()
        WHERE id = v_balance_id;
    ELSE
        INSERT INTO public.genetic_inventory_balances (
            organization_id, farm_id, batch_id, tank_id, canister_id,
            owner_client_id, quantity_available, last_movement_at, version, updated_at
        ) VALUES (
            p_organization_id, p_farm_id, p_batch_id, p_tank_id, p_canister_id,
            p_owner_client_id, p_quantity, NOW(), 1, NOW()
        )
        ON CONFLICT (farm_id, batch_id, tank_id, canister_id, COALESCE(owner_client_id, '00000000-0000-0000-0000-000000000000'::uuid))
        DO UPDATE SET
            quantity_available = public.genetic_inventory_balances.quantity_available + p_quantity,
            last_movement_at = NOW(),
            version = public.genetic_inventory_balances.version + 1,
            updated_at = NOW();
    END IF;

    INSERT INTO public.genetic_inventory_movements (
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

-- F. Estorno Seguro (com isolamento de tenant, FOR UPDATE e suporte a TRANSFER_OUT/TRANSFER_IN)
CREATE OR REPLACE FUNCTION public.fn_process_genetic_reversal(
    p_organization_id UUID,
    p_farm_id UUID,
    p_movement_id UUID,
    p_reason VARCHAR,
    p_created_by VARCHAR
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_orig public.genetic_inventory_movements%ROWTYPE;
    v_reversal_id UUID;
    v_balance_id UUID;
    v_current_qty INT;
    v_client_uuid UUID;
BEGIN
    PERFORM public.assert_org_farm_access(p_organization_id, p_farm_id);

    IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
        RAISE EXCEPTION 'A justificativa do estorno é obrigatória.';
    END IF;

    SELECT * INTO v_orig
    FROM public.genetic_inventory_movements
    WHERE id = p_movement_id
      AND organization_id = p_organization_id
      AND farm_id = p_farm_id
    FOR UPDATE;

    IF v_orig.id IS NULL THEN
        RAISE EXCEPTION 'Movimentação não encontrada para esta organização/fazenda.';
    END IF;

    IF v_orig.movement_type = 'REVERSAL' THEN
        RAISE EXCEPTION 'Não é possível estornar um estorno.';
    END IF;

    IF EXISTS (SELECT 1 FROM public.genetic_inventory_movements WHERE reversed_movement_id = p_movement_id) THEN
        RAISE EXCEPTION 'Esta movimentação já foi estornada anteriormente.';
    END IF;

    v_client_uuid := COALESCE(v_orig.owner_client_id, '00000000-0000-0000-0000-000000000000'::uuid);

    IF v_orig.movement_type IN ('INBOUND', 'ADJUSTMENT_POSITIVE') THEN
        SELECT id, quantity_available INTO v_balance_id, v_current_qty
        FROM public.genetic_inventory_balances
        WHERE organization_id = p_organization_id
          AND farm_id = p_farm_id
          AND batch_id = v_orig.batch_id
          AND tank_id = v_orig.destination_tank_id
          AND canister_id = v_orig.destination_canister_id
          AND COALESCE(owner_client_id, '00000000-0000-0000-0000-000000000000'::uuid) = v_client_uuid
        FOR UPDATE;

        IF v_balance_id IS NULL OR v_current_qty < v_orig.quantity THEN
            RAISE EXCEPTION 'Não é possível estornar: as doses já foram utilizadas ou movimentadas (saldo remanescente: %).', COALESCE(v_current_qty, 0);
        END IF;

        UPDATE public.genetic_inventory_balances
        SET quantity_available = quantity_available - v_orig.quantity,
            last_movement_at = NOW(),
            version = version + 1,
            updated_at = NOW()
        WHERE id = v_balance_id;

    ELSIF v_orig.movement_type IN ('OUTBOUND', 'USAGE', 'LOSS', 'ADJUSTMENT_NEGATIVE') THEN
        INSERT INTO public.genetic_inventory_balances (
            organization_id, farm_id, batch_id, tank_id, canister_id,
            owner_client_id, quantity_available, last_movement_at, version, updated_at
        ) VALUES (
            p_organization_id, p_farm_id, v_orig.batch_id, v_orig.source_tank_id, v_orig.source_canister_id,
            v_orig.owner_client_id, v_orig.quantity, NOW(), 1, NOW()
        )
        ON CONFLICT (farm_id, batch_id, tank_id, canister_id, COALESCE(owner_client_id, '00000000-0000-0000-0000-000000000000'::uuid))
        DO UPDATE SET
            quantity_available = public.genetic_inventory_balances.quantity_available + v_orig.quantity,
            last_movement_at = NOW(),
            version = public.genetic_inventory_balances.version + 1,
            updated_at = NOW();

    ELSIF v_orig.movement_type IN ('TRANSFER_OUT', 'TRANSFER_IN') THEN
        -- Reverte transferência debitando destino e creditando origem atomicamente
        SELECT id, quantity_available INTO v_balance_id, v_current_qty
        FROM public.genetic_inventory_balances
        WHERE organization_id = p_organization_id
          AND farm_id = p_farm_id
          AND batch_id = v_orig.batch_id
          AND tank_id = v_orig.destination_tank_id
          AND canister_id = v_orig.destination_canister_id
          AND COALESCE(owner_client_id, '00000000-0000-0000-0000-000000000000'::uuid) = v_client_uuid
        FOR UPDATE;

        IF v_balance_id IS NULL OR v_current_qty < v_orig.quantity THEN
            RAISE EXCEPTION 'Não é possível estornar transferência: saldo no destino insuficiente (%).', COALESCE(v_current_qty, 0);
        END IF;

        UPDATE public.genetic_inventory_balances
        SET quantity_available = quantity_available - v_orig.quantity,
            last_movement_at = NOW(),
            version = version + 1,
            updated_at = NOW()
        WHERE id = v_balance_id;

        INSERT INTO public.genetic_inventory_balances (
            organization_id, farm_id, batch_id, tank_id, canister_id,
            owner_client_id, quantity_available, last_movement_at, version, updated_at
        ) VALUES (
            p_organization_id, p_farm_id, v_orig.batch_id, v_orig.source_tank_id, v_orig.source_canister_id,
            v_orig.owner_client_id, v_orig.quantity, NOW(), 1, NOW()
        )
        ON CONFLICT (farm_id, batch_id, tank_id, canister_id, COALESCE(owner_client_id, '00000000-0000-0000-0000-000000000000'::uuid))
        DO UPDATE SET
            quantity_available = public.genetic_inventory_balances.quantity_available + v_orig.quantity,
            last_movement_at = NOW(),
            version = public.genetic_inventory_balances.version + 1,
            updated_at = NOW();
    END IF;

    INSERT INTO public.genetic_inventory_movements (
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
CREATE OR REPLACE FUNCTION public.fn_record_nitrogen_measurement(
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
SET search_path = public, pg_temp
AS $$
DECLARE
    v_measurement_id UUID;
BEGIN
    PERFORM public.assert_org_farm_access(p_organization_id, p_farm_id);

    IF p_level_percent < 0 OR p_level_percent > 100 THEN
        RAISE EXCEPTION 'O nível de nitrogênio deve estar entre 0%% e 100%%.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.semen_tanks
        WHERE id = p_tank_id AND organization_id = p_organization_id AND farm_id = p_farm_id
    ) THEN
        RAISE EXCEPTION 'Botijão não encontrado para esta organização/fazenda.';
    END IF;

    INSERT INTO public.tank_nitrogen_measurements (
        organization_id, farm_id, tank_id, level_percent,
        measured_at, measured_by, notes
    ) VALUES (
        p_organization_id, p_farm_id, p_tank_id, p_level_percent,
        COALESCE(p_measured_at, NOW()), p_measured_by, p_notes
    ) RETURNING id INTO v_measurement_id;

    UPDATE public.semen_tanks
    SET current_nitrogen_level = p_level_percent,
        updated_at = NOW()
    WHERE id = p_tank_id
      AND organization_id = p_organization_id
      AND farm_id = p_farm_id;

    RETURN v_measurement_id;
END;
$$;

-- Garantir permissões apenas para authenticated e service_role
DO $$
DECLARE
  fn_name TEXT;
  fn_names TEXT[] := ARRAY[
    'fn_process_genetic_inbound',
    'fn_process_genetic_outbound',
    'fn_process_genetic_transfer',
    'fn_process_genetic_usage_iatf',
    'fn_process_genetic_adjustment',
    'fn_process_genetic_reversal',
    'fn_record_nitrogen_measurement'
  ];
  r RECORD;
BEGIN
  FOREACH fn_name IN ARRAY fn_names LOOP
    FOR r IN
      SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = fn_name
    LOOP
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
    END LOOP;
  END LOOP;
END $$;
