-- Migration 003: Add farm_id to lot_stats view
DROP VIEW IF EXISTS lot_stats CASCADE;

CREATE VIEW lot_stats AS
 SELECT l.id,
    l.code,
    l.farm_id,
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
   LEFT JOIN iatf_lot_animals la ON la.lot_id = l.id
 GROUP BY l.id, l.farm_id, p.name, pr.name, f.name;

GRANT SELECT ON lot_stats TO anon, authenticated, service_role;
