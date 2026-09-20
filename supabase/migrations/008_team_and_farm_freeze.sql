-- ============================================================================
-- MIGRAÇÃO 008: GESTÃO DE EQUIPE (USUÁRIOS DIRETOS) & CONGELAMENTO DE FAZENDAS
-- ============================================================================

-- 1. Status de Fazendas (Ativa vs Congelada)
ALTER TABLE farms ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active';
CREATE INDEX IF NOT EXISTS idx_farms_org_status ON farms(organization_id, status);

-- 2. Atualização da tabela organization_members
ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS display_name VARCHAR(255);
ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active';

-- Popula dados existentes de membros
UPDATE organization_members om
SET email = u.email,
    display_name = COALESCE(u.raw_user_meta_data->>'name', split_part(u.email, '@', 1))
FROM auth.users u
WHERE om.user_id = u.id AND (om.email IS NULL OR om.display_name IS NULL);

-- 3. Funções de Congelar / Descongelar Fazenda
CREATE OR REPLACE FUNCTION freeze_farm(p_farm_id UUID, p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE farms
    SET status = 'frozen', updated_at = NOW()
    WHERE id = p_farm_id AND organization_id = p_org_id;
    RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION unfreeze_farm(p_farm_id UUID, p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE farms
    SET status = 'active', updated_at = NOW()
    WHERE id = p_farm_id AND organization_id = p_org_id;
    RETURN FOUND;
END;
$$;

-- 4. Função para Criar Usuário Diretamente e Vincular à Equipe (Sem E-mail de Confirmação)
CREATE OR REPLACE FUNCTION create_team_member_user(
    p_org_id UUID,
    p_name VARCHAR(255),
    p_email VARCHAR(255),
    p_password VARCHAR(255),
    p_role VARCHAR(50) DEFAULT 'operator'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_existing_id UUID;
    v_enc_password TEXT;
BEGIN
    -- Validações básicas
    IF p_email IS NULL OR trim(p_email) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'E-mail não pode ser vazio');
    END IF;

    IF p_password IS NULL OR length(p_password) < 6 THEN
        RETURN jsonb_build_object('success', false, 'error', 'A senha deve conter no mínimo 6 caracteres');
    END IF;

    -- Normaliza email
    p_email := lower(trim(p_email));
    v_enc_password := crypt(p_password, gen_salt('bf'));

    -- Verifica se o usuário já existe no auth.users
    SELECT id INTO v_existing_id FROM auth.users WHERE lower(email) = p_email LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
        v_user_id := v_existing_id;
        -- Atualiza senha e metadata do usuário existente para garantir acesso imediato
        UPDATE auth.users
        SET encrypted_password = v_enc_password,
            raw_user_meta_data = jsonb_build_object('name', p_name, 'display_name', p_name),
            email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
            updated_at = NOW()
        WHERE id = v_user_id;
    ELSE
        -- Gera novo ID de usuário
        v_user_id := gen_random_uuid();

        -- Criação no auth.users
        INSERT INTO auth.users (
            id,
            instance_id,
            email,
            encrypted_password,
            email_confirmed_at,
            raw_app_meta_data,
            raw_user_meta_data,
            created_at,
            updated_at,
            role,
            aud,
            confirmation_token
        ) VALUES (
            v_user_id,
            '00000000-0000-0000-0000-000000000000'::uuid,
            p_email,
            v_enc_password,
            NOW(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            jsonb_build_object('name', p_name, 'display_name', p_name),
            NOW(),
            NOW(),
            'authenticated',
            'authenticated',
            ''
        );

        -- Criação no auth.identities
        INSERT INTO auth.identities (
            id,
            user_id,
            identity_data,
            provider,
            provider_id,
            last_sign_in_at,
            created_at,
            updated_at
        ) VALUES (
            v_user_id,
            v_user_id,
            jsonb_build_object('sub', v_user_id::text, 'email', p_email),
            'email',
            v_user_id::text,
            NOW(),
            NOW(),
            NOW()
        );
    END IF;

    -- Vincula à organização
    INSERT INTO organization_members (
        organization_id,
        user_id,
        role,
        display_name,
        email,
        status,
        created_at
    ) VALUES (
        p_org_id,
        v_user_id,
        p_role,
        p_name,
        p_email,
        'active',
        NOW()
    )
    ON CONFLICT (organization_id, user_id) DO UPDATE
    SET role = EXCLUDED.role,
        display_name = EXCLUDED.display_name,
        email = EXCLUDED.email,
        status = 'active';

    RETURN jsonb_build_object(
        'success', true,
        'user_id', v_user_id,
        'email', p_email,
        'role', p_role,
        'display_name', p_name
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
