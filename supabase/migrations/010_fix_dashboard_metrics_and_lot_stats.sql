-- Migration 010: Fix dashboard metrics, lot_stats views, and trim farm names

-- 1. Trim trailing/leading spaces in farm names
UPDATE farms SET name = TRIM(name) WHERE LENGTH(name) <> LENGTH(TRIM(name));

-- 2. Drop and recreate lot_stats view with accurate IATF metrics
DROP VIEW IF EXISTS lot_stats CASCADE;

CREATE VIEW lot_stats AS
SELECT 
    l.id,
    l.code,
    l.farm_id,
    l.season_id,
    rs.name AS season_name,
    l.start_date,
    l.ia_planned_date,
    l.dg_planned_date,
    l.responsible_name,
    l.status,
    l.organization_id,
    p.name AS property_name,
    pr.name AS protocol_name,
    TRIM(f.name) AS farm_name,
    count(la.id) AS worked_qty,
    -- Inseminadas: se tiver touro, sêmen, inseminador, DG concluído, OU se o manejo IA foi concluído
    count(la.id) FILTER (WHERE 
        la.bull_id IS NOT NULL 
        OR la.semen_batch_id IS NOT NULL 
        OR (la.inseminator_name IS NOT NULL AND la.inseminator_name <> '')
        OR la.pregnancy_status::text IN ('prenha', 'vazia')
        OR EXISTS (
            SELECT 1 FROM management_events me 
            WHERE me.lot_id = l.id AND me.step_code = 'IA' AND me.status = 'concluido'
        )
    ) AS inseminated_qty,
    -- Diagnosticadas
    count(la.id) FILTER (WHERE la.pregnancy_status::text IN ('prenha', 'vazia')) AS diagnosed_qty,
    -- Prenhas
    count(la.id) FILTER (WHERE la.pregnancy_status::text = 'prenha'::text) AS pregnancies,
    -- Vazias
    count(la.id) FILTER (WHERE la.pregnancy_status::text = 'vazia'::text) AS empty_count,
    -- Aguardando DG (apenas animais que foram inseminados e cujo DG ainda não foi feito)
    count(la.id) FILTER (WHERE 
        (
            la.bull_id IS NOT NULL 
            OR la.semen_batch_id IS NOT NULL 
            OR (la.inseminator_name IS NOT NULL AND la.inseminator_name <> '')
            OR EXISTS (
                SELECT 1 FROM management_events me 
                WHERE me.lot_id = l.id AND me.step_code = 'IA' AND me.status = 'concluido'
            )
        )
        AND (la.pregnancy_status::text = 'pendente'::text OR la.pregnancy_status IS NULL)
    ) AS pending_dg,
    -- Taxa de Prenhez sobre diagnósticos realizados (se houver diagnósticos)
    CASE
        WHEN count(la.id) FILTER (WHERE la.pregnancy_status::text IN ('prenha', 'vazia')) > 0 
        THEN round(
            count(la.id) FILTER (WHERE la.pregnancy_status::text = 'prenha'::text)::numeric / 
            count(la.id) FILTER (WHERE la.pregnancy_status::text IN ('prenha', 'vazia'))::numeric * 100::numeric, 
            2
        )
        ELSE 0::numeric
    END AS pregnancy_rate,
    l.notes
FROM iatf_lots l
    LEFT JOIN properties p ON l.property_id = p.id
    LEFT JOIN protocols pr ON l.protocol_id = pr.id
    LEFT JOIN farms f ON l.farm_id = f.id
    LEFT JOIN reproductive_seasons rs ON l.season_id = rs.id
    LEFT JOIN iatf_lot_animals la ON la.lot_id = l.id
GROUP BY l.id, l.farm_id, l.season_id, rs.name, p.name, pr.name, f.name;

GRANT SELECT ON lot_stats TO anon, authenticated, service_role;

-- 3. Recreate organization_metrics view without cartesian product and with real metric definitions
CREATE OR REPLACE VIEW organization_metrics AS
WITH lot_summary AS (
    SELECT 
        l.organization_id,
        count(DISTINCT l.id) FILTER (WHERE l.status::text IN ('em_andamento', 'planejado', 'ativo')) AS active_lots,
        count(DISTINCT la.animal_id) AS total_animals,
        count(la.id) FILTER (WHERE 
            la.bull_id IS NOT NULL 
            OR la.semen_batch_id IS NOT NULL 
            OR (la.inseminator_name IS NOT NULL AND la.inseminator_name <> '')
            OR la.pregnancy_status::text IN ('prenha', 'vazia')
            OR EXISTS (
                SELECT 1 FROM management_events me 
                WHERE me.lot_id = l.id AND me.step_code = 'IA' AND me.status = 'concluido'
            )
        ) AS total_inseminations,
        count(la.id) FILTER (WHERE la.pregnancy_status::text = 'prenha'::text) AS total_pregnancies,
        count(la.id) FILTER (WHERE la.pregnancy_status::text = 'vazia'::text) AS total_empty,
        count(la.id) FILTER (WHERE la.pregnancy_status::text IN ('prenha', 'vazia')) AS total_diagnoses
    FROM iatf_lots l
    LEFT JOIN iatf_lot_animals la ON la.lot_id = l.id
    GROUP BY l.organization_id
),
losses_summary AS (
    SELECT 
        o.id AS organization_id,
        COALESCE(il_sub.loss_qty, 0) + COALESCE(me_sub.me_loss_qty, 0) AS total_device_losses
    FROM organizations o
    LEFT JOIN (
        SELECT organization_id, sum(quantity) AS loss_qty 
        FROM input_losses 
        WHERE input_type = 'Implante P4' 
        GROUP BY organization_id
    ) il_sub ON il_sub.organization_id = o.id
    LEFT JOIN (
        SELECT organization_id, sum(losses_count) AS me_loss_qty 
        FROM management_events 
        GROUP BY organization_id
    ) me_sub ON me_sub.organization_id = o.id
)
SELECT 
    ls.organization_id,
    ls.active_lots,
    ls.total_animals,
    ls.total_inseminations,
    ls.total_pregnancies,
    ls.total_empty,
    ls.total_diagnoses,
    COALESCE(los.total_device_losses, 0) AS total_device_losses,
    CASE 
        WHEN ls.total_diagnoses > 0 
        THEN round((ls.total_pregnancies::numeric / ls.total_diagnoses::numeric) * 100::numeric, 2)
        ELSE 0::numeric 
    END AS overall_pregnancy_rate
FROM lot_summary ls
LEFT JOIN losses_summary los ON los.organization_id = ls.organization_id;

GRANT SELECT ON organization_metrics TO anon, authenticated, service_role;
