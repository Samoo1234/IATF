-- Migration 011: Clean whitespace in registries and create active 2026/2027 reproductive season

-- 1. Trim whitespace in bulls, breeds, properties, and genetic_centers
UPDATE bulls SET 
  name = TRIM(name), 
  code = CASE WHEN code IS NOT NULL THEN TRIM(code) ELSE NULL END, 
  owner_central = CASE WHEN owner_central IS NOT NULL THEN TRIM(owner_central) ELSE NULL END,
  registration_number = CASE WHEN registration_number IS NOT NULL THEN TRIM(registration_number) ELSE NULL END;

UPDATE breeds SET name = TRIM(name);

UPDATE properties SET name = TRIM(name);

UPDATE genetic_centers SET 
  name = TRIM(name),
  short_name = CASE WHEN short_name IS NOT NULL THEN TRIM(short_name) ELSE NULL END;

-- 2. Setup active reproductive season 2026/2027 for Mastercriareproducao
DO $$
DECLARE
  v_new_season_id UUID;
  v_org_id UUID := '5dc2196a-cafe-4bcc-a367-8416ad85fb67';
BEGIN
  -- Close expired 2025/2026 season
  UPDATE reproductive_seasons 
  SET status = 'closed' 
  WHERE organization_id = v_org_id AND name = 'Estação 2025/2026';

  -- Create or activate 2026/2027 season
  SELECT id INTO v_new_season_id 
  FROM reproductive_seasons 
  WHERE organization_id = v_org_id AND name = 'Estação 2026/2027';

  IF v_new_season_id IS NULL THEN
    INSERT INTO reproductive_seasons (organization_id, name, start_date, end_date, status)
    VALUES (v_org_id, 'Estação 2026/2027', '2026-09-01', '2027-04-30', 'active')
    RETURNING id INTO v_new_season_id;
  ELSE
    UPDATE reproductive_seasons 
    SET status = 'active', start_date = '2026-09-01', end_date = '2027-04-30'
    WHERE id = v_new_season_id;
  END IF;

  -- Reassign lots running in 2026/2027
  UPDATE iatf_lots 
  SET season_id = v_new_season_id 
  WHERE organization_id = v_org_id AND start_date >= '2026-08-01';
END $$;
