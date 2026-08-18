-- Fix RLS Policies for Development / Single-Tenant Mode
DO $$
DECLARE
    tbl text;
    tables text[] := ARRAY[
        'organizations',
        'organization_members',
        'farms',
        'properties',
        'animals',
        'bulls',
        'semen_batches',
        'protocols',
        'protocol_steps',
        'iatf_lots',
        'iatf_lot_animals',
        'management_events',
        'input_losses',
        'inseminator_scores'
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
