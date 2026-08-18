# POLÍTICAS DE SEGURANÇA ROW LEVEL SECURITY (RLS) — SUPABASE

## 1. Princípio Fundamental de Isolamento Multi-Tenant

Todas as tabelas de negócio possuem a coluna `organization_id NOT NULL`. O isolamento multi-tenant é garantido no banco PostgreSQL via **Row Level Security (RLS)**, independente de qualquer filtro aplicado no frontend.

---

## 2. Função Helper de Verificação de Membro

```sql
-- Função helper para recuperar as organizações às quais o usuário logado pertence
CREATE OR REPLACE FUNCTION get_user_organizations()
RETURNS SETOF UUID AS $$
BEGIN
    RETURN QUERY
    SELECT organization_id 
    FROM organization_members 
    WHERE user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
```

---

## 3. Definição das Políticas RLS Por Tabela

### 3.1. Tabela `organizations`
```sql
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários podem visualizar sua própria organização"
ON organizations FOR SELECT
USING (id IN (SELECT get_user_organizations()));
```

### 3.2. Tabela `organization_members`
```sql
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membros podem ver outros membros da mesma organização"
ON organization_members FOR SELECT
USING (organization_id IN (SELECT get_user_organizations()));

CREATE POLICY "Apenas administradores podem inserir ou remover membros"
ON organization_members FOR ALL
USING (
    organization_id IN (
        SELECT organization_id FROM organization_members 
        WHERE user_id = auth.uid() AND role = 'admin'
    )
);
```

### 3.3. Tabela `animals`
```sql
ALTER TABLE animals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso de leitura restrito à organização do usuário"
ON animals FOR SELECT
USING (organization_id IN (SELECT get_user_organizations()));

CREATE POLICY "Acesso de escrita restrito a membros autorizados da organização"
ON animals FOR INSERT
WITH CHECK (organization_id IN (SELECT get_user_organizations()));

CREATE POLICY "Atualização restrita à organização do usuário"
ON animals FOR UPDATE
USING (organization_id IN (SELECT get_user_organizations()))
WITH CHECK (organization_id IN (SELECT get_user_organizations()));
```

### 3.4. Tabelas Operacionais (`iatf_lots`, `iatf_lot_animals`, `management_events`, `semen_batches`, `input_losses`)
```sql
-- Aplicação de política padrão de isolamento por organização em todas as tabelas
ALTER TABLE iatf_lots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Isolamento multi-tenant iatf_lots" ON iatf_lots
FOR ALL USING (organization_id IN (SELECT get_user_organizations()));

ALTER TABLE iatf_lot_animals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Isolamento multi-tenant iatf_lot_animals" ON iatf_lot_animals
FOR ALL USING (
    lot_id IN (
        SELECT id FROM iatf_lots WHERE organization_id IN (SELECT get_user_organizations())
    )
);

ALTER TABLE management_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Isolamento multi-tenant management_events" ON management_events
FOR ALL USING (organization_id IN (SELECT get_user_organizations()));

ALTER TABLE input_losses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Isolamento multi-tenant input_losses" ON input_losses
FOR ALL USING (organization_id IN (SELECT get_user_organizations()));
```
