-- Migration 005: Veterinarians (Médicos Veterinários / Responsáveis Técnicos)
CREATE TABLE IF NOT EXISTS veterinarians (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    crmv VARCHAR(50),
    phone VARCHAR(50),
    email VARCHAR(255),
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Grant permissions and dev RLS policy
DO $$
BEGIN
    BEGIN
        GRANT ALL ON TABLE veterinarians TO anon, authenticated, service_role;
        DROP POLICY IF EXISTS veterinarians_dev_policy ON veterinarians;
        CREATE POLICY veterinarians_dev_policy ON veterinarians FOR ALL TO public USING (true) WITH CHECK (true);
    EXCEPTION
        WHEN undefined_table THEN
            NULL;
    END;
END $$;

-- Insert default veterinarian if none exists
INSERT INTO veterinarians (id, organization_id, name, crmv, phone, email, is_default)
SELECT 
    '77777777-7777-7777-7777-777777777701'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    'MV. DR. SAMOEL DUARTE',
    'CRMV-MT 1234',
    '(65) 99999-0000',
    'samoel@iatfmaster.com.br',
    true
WHERE NOT EXISTS (
    SELECT 1 FROM veterinarians WHERE organization_id = '11111111-1111-1111-1111-111111111111'::uuid
);
