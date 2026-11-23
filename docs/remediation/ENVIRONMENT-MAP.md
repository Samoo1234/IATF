# Mapa de Ambientes e Plano de Isolamento (`ENVIRONMENT-MAP.md`)

**Projeto:** IATF Master (`f:\IATF`)  
**Data:** `2026-11-22`  
**Objetivo:** Documentar o ambiente local, o ambiente remoto operacional e as opções para criação de ambiente **staging isolado** antes de executar qualquer correção de banco ou teste dinâmico com escrita.

---

## 1. Ambiente Local (Estação de Desenvolvimento)

- **Workspace:** `f:\IATF` (Windows)
- **Git:** branch ativa `remediation/iatf-master-audit` (baseada em `main@fbbd651`, sincronizada com `origin/main`)
- **Runtimes instalados:** Node.js `v22.16.0`, npm `10.9.2`
- **Ferramentas ausentes localmente:**
  - `docker`: **não instalado**
  - `supabase` CLI: **não instalada**
- **Variáveis de ambiente configuradas (apenas nomes; valores omitidos):**
  - `.env.example` e `.env.local`:
    - `NEXT_PUBLIC_SUPABASE_URL` — aponta para o projeto Supabase Cloud remoto `"IATF"` (**AMBIENTE OPERACIONAL / PRODUÇÃO**).
    - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — chave pública anônima correspondente ao projeto remoto `"IATF"`.
    - `NEXT_PUBLIC_ORG_ID` — definida em `.env.example` e `.env.local`, porém **não referenciada** em nenhum arquivo de `src/`.
  - `SUPABASE_SERVICE_ROLE_KEY`: **não configurada** em nenhum arquivo `.env*` (e ausente do projeto, pois ainda não existem rotas server-side/Edge Functions).

---

## 2. Ambiente Remoto Conectado (Supabase Cloud — PRODUÇÃO / OPERACIONAL ATIVO)

- **Identificação do projeto no MCP:** Nome `"IATF"`, região `us-west-2`, PostgreSQL `17.6.1.155` (release channel `ga`), status `ACTIVE_HEALTHY`.
- **Classificação:** **AMBIENTE OPERACIONAL ATIVO COM DADOS REAIS** (proibida qualquer alteração, escrita, migration, reset ou teste ativo de invasão/IDOR).
- **Volume atual observado (consulta agregada read-only):**
  - `organizations`: `2` | `auth.users`: `2` | `organization_members`: `2`
  - `farms`: `14` ativas | `properties`: `16` | `veterinarians`: `2`
  - `animals`: `1.870` | `iatf_lots`: `45` | `iatf_lot_animals`: `1.966`
  - `animal_managements`: `906` | `management_events`: `173`
  - `bulls`: `39` | `semen_batches`: `75` | `genetic_centers`: `12` | `genetic_clients`: `9`
  - `semen_tanks`: `6` | `semen_tank_canisters`: `44` | `genetic_materials`: `75` | `genetic_material_batches`: `75` | `genetic_inventory_balances`: `76` | `genetic_inventory_movements`: `670` | `genetic_withdrawal_receipts`: `4`
- **Extensões relevantes ativas (`list_extensions`):** `plpgsql`, `pgcrypto` (1.3), `uuid-ossp` (1.1), `pg_stat_statements` (1.11), `pg_graphql` (1.6.1), `supabase_vault` (0.3.1).
- **Recursos adicionais:** `0` Edge Functions (`list_edge_functions = []`), `0` Supabase Branches (`list_branches = []`), `0` Storage Buckets.
- **Limitação do escopo MCP:** `list_organizations` retornou `[]` e `get_organization` retornou `Forbidden`, indicando que o token MCP atual possui acesso ao projeto `"IATF"`, mas sem permissão administrativa da organização Supabase (billing/criação de projetos ou confirmação de plano).

---

## 3. Opções para Criação de Ambiente Staging Isolado (Gate 0)

Como **não existe nenhum branch ou banco de staging disponível atualmente**, é obrigatório estabelecer um ambiente isolado antes de iniciar o **Lote 0** e os testes dinâmicos com escrita.

| Opção | Descrição | Vantagens | Limitações / Pré-requisitos |
|---|---|---|---|
| **Opção A (Recomendada)** — Projeto Supabase Independente (`IATF-Staging`) | Criar um segundo projeto gratuito/dedicado no painel do Supabase exclusivamente para homologação e testes da remediação. | Isolamento físico e lógico total (URL, `anon_key`, `service_role_key`, Auth e PostgreSQL separados); não depende de plano Pro/Branching; não exige Docker local. | Exige criação pelo usuário no painel Supabase + fornecimento das credenciais de staging em arquivo local separado (ex.: `.env.staging.local`) e acesso MCP/SQL ao novo projeto. |
| **Opção B** — Supabase Branch (`staging`) no projeto `"IATF"` | Utilizar o recurso nativo de Database Branching do Supabase. | Gerenciamento no mesmo painel do projeto. | Requer plano Supabase Pro (sujeito a custo por hora); `get_organization` retornou `Forbidden` no MCP atual; **atenção:** um branch aplica apenas o histórico de `schema_migrations` e **não** replica dados nem objetos criados fora das migrations (`AUD-011`: `input_losses`, triggers, políticas `tenant_*` manuais), exigindo aplicar o baseline DDL schema-only primeiro. |
| **Opção C** — Supabase Local (`localhost`) via Docker + Supabase CLI | Rodar a stack completa do Supabase localmente com `supabase start`. | Custo zero, isolamento offline absoluto e resets instantâneos para testes. | `docker` e `supabase` CLI **não estão instalados** na máquina Windows atual; requer instalação e inicialização prévia pelo usuário. |

> **Regra de Segurança (Seção 3.2):** Nenhuma dessas opções será criada ou modificada automaticamente sem autorização explícita do usuário. Mesmo ao usar branch ou projeto staging, nunca copiar dados reais/PII de produção — utilizar exclusivamente baseline DDL **schema-only** + massa de dados 100% sintética.

---

## 4. Estratégia de Massa de Dados Sintéticos para Staging

Após criação e baseline do staging, os dados de teste serão criados exclusivamente por script idempotente de seed sintético contendo:
- **Organizações sintéticas:** `Org Sintética Alpha` e `Org Sintética Beta`.
- **Contas sintéticas (`@example.test`, senhas descartáveis):**
  - Em `Org Alpha`: `admin.alpha@example.test` (`admin`), `vet.alpha@example.test` (`veterinarian`), `operador.alpha@example.test` (`operator`), `viewer.alpha@example.test` (`viewer`), `inativo.alpha@example.test` (`operator`, `status = 'inactive'`).
  - Em `Org Beta`: `admin.beta@example.test` (`admin`).
- **Dados operacionais fictícios:**
  - `Org Alpha`: 1 fazenda hub genética (`Fazenda Principal Teste Alpha`, `is_genetic_hub = true`), 1 fazenda satélite (`Fazenda Satélite Teste Alpha`), retiros fictícios, estação `2026/2027`, protocolos padrão, 2 touros, 1 botijão com 4 canecas, 2 partidas de sêmen com saldo positivo conhecido e 10 matrizes fictícias distribuídas em lotes para testes D0→D9→IA→DG e offline→online.
  - `Org Beta`: 1 fazenda, 1 botijão e 2 matrizes para validação rigorosa de isolamento cross-tenant (`AUD-002`, `AUD-003`).

---

## 5. Estratégia de Backup, Restauração e Rollback

1. **Snapshot pré-mudança:** Em staging (e obrigatoriamente no painel Supabase antes de qualquer futura janela de produção), confirmar backup automático/PITR e registrar dump `--schema-only` + DDL atual das views, políticas RLS, triggers e funções em `docs/remediation/ROLLBACK-PLAN.md`.
2. **Reversibilidade por lote:** Cada migration corretiva deve ter script de rollback explícito e testado primeiro no staging.
3. **Integridade histórica:** Divergências identificadas na auditoria (`4` partidas negativas em `semen_batches`, diferença de `405` doses, `1.204` vínculos sem `animal_managements`, `2` eventos órfãos, `2` lotes duplicados) **não** serão alteradas ou excluídas automaticamente; receberão relatório diagnóstico e plano de reconciliação para validação humana.
