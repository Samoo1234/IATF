-- Migration 004: Reproductive Seasons Management and RLS
DO $$
BEGIN
    -- Grant permissions and dev policy on reproductive_seasons
    BEGIN
        GRANT ALL ON TABLE reproductive_seasons TO anon, authenticated, service_role;
        DROP POLICY IF EXISTS reproductive_seasons_dev_policy ON reproductive_seasons;
        CREATE POLICY reproductive_seasons_dev_policy ON reproductive_seasons FOR ALL TO public USING (true) WITH CHECK (true);
    EXCEPTION
        WHEN undefined_table THEN
            NULL;
    END;
END $$;

-- Ensure an active reproductive season exists for dev organization if none exists
INSERT INTO reproductive_seasons (id, organization_id, name, start_date, end_date, status)
SELECT 
    '66666666-6666-6666-6666-666666666601'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    'Estação 2025/2026',
    '2025-10-01'::date,
    '2026-03-31'::date,
    'active'
WHERE NOT EXISTS (
    SELECT 1 FROM reproductive_seasons WHERE organization_id = '11111111-1111-1111-1111-111111111111'::uuid
);

-- Recreate lot_stats view including season_id and season_name
DROP VIEW IF EXISTS lot_stats CASCADE;

CREATE VIEW lot_stats AS
 SELECT l.id,
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
    f.name AS farm_name,
    count(la.id) AS worked_qty,
    count(la.id) FILTER (WHERE la.pregnancy_status::text = 'pendente'::text OR la.pregnancy_status IS NULL) AS pending_dg,
    count(la.id) FILTER (WHERE la.pregnancy_status::text <> 'pendente'::text AND la.pregnancy_status IS NOT NULL) AS inseminated_qty,
    count(la.id) FILTER (WHERE la.pregnancy_status::text = 'prenha'::text) AS pregnancies,
    count(la.id) FILTER (WHERE la.pregnancy_status::text = 'vazia'::text) AS empty_count,
    CASE
        WHEN count(la.id) FILTER (WHERE la.pregnancy_status::text <> 'pendente'::text AND la.pregnancy_status IS NOT NULL) > 0 
        THEN round(count(la.id) FILTER (WHERE la.pregnancy_status::text = 'prenha'::text)::numeric / count(la.id) FILTER (WHERE la.pregnancy_status::text <> 'pendente'::text AND la.pregnancy_status IS NOT NULL)::numeric * 100::numeric, 2)
        ELSE 0::numeric
    END AS pregnancy_rate
 FROM iatf_lots l
   LEFT JOIN properties p ON l.property_id = p.id
   LEFT JOIN protocols pr ON l.protocol_id = pr.id
   LEFT JOIN farms f ON l.farm_id = f.id
   LEFT JOIN reproductive_seasons rs ON l.season_id = rs.id
   LEFT JOIN iatf_lot_animals la ON la.lot_id = l.id
 GROUP BY l.id, l.farm_id, l.season_id, rs.name, p.name, pr.name, f.name;

GRANT SELECT ON lot_stats TO anon, authenticated, service_role;
