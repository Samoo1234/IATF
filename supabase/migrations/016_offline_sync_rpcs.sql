-- ============================================================================
-- MIGRATION 016: RPC ATÔMICA PARA BAIXA OFFLINE DE SÊMEN LEGADO (SYNCENGINE)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_increment_semen_batch_used(
    p_batch_id UUID,
    p_quantity INT DEFAULT 1
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org_id UUID;
BEGIN
    IF p_quantity IS NULL OR p_quantity <= 0 THEN
        RAISE EXCEPTION 'Quantidade inválida para baixa de sêmen.';
    END IF;

    SELECT organization_id INTO v_org_id
    FROM public.semen_batches
    WHERE id = p_batch_id
    FOR UPDATE;

    IF v_org_id IS NULL THEN
        RETURN FALSE;
    END IF;

    IF NOT (v_org_id IN (SELECT public.get_user_org_ids())) THEN
        RAISE EXCEPTION 'Acesso negado à partida de sêmen.';
    END IF;

    UPDATE public.semen_batches
    SET used_quantity = COALESCE(used_quantity, 0) + p_quantity,
        updated_at = NOW()
    WHERE id = p_batch_id;

    RETURN TRUE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_increment_semen_batch_used(UUID, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_increment_semen_batch_used(UUID, INT) TO authenticated, service_role;
