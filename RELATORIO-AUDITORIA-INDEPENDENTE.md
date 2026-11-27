# Relatório de Auditoria Técnica Independente — Sistema IATF Master

## 1. Identificação
- **Projeto:** IATF Master (`f:\IATF`)
- **Repositório / Branch:** `remediation/iatf-master-audit`
- **Commit analisado:** `3e2b54e` (`fix(audit): full cleanup, RBAC/session hardening, ExcelJS migration, real /import, error boundaries, and local SQL migrations 012-014`)
- **Data da auditoria:** `2026-11-27`
- **Responsável pela execução:** Auditor Independente (Antigravity — protocolo `full-system-audit`, Modo A somente leitura)
- **Ambiente examinado:**
  - **Código-fonte local:** `f:\IATF` (leitura integral arquivo por arquivo + `tsc`, `eslint`, `next build`, `npm audit`).
  - **Banco de dados remoto (Supabase Cloud):** projeto `"IATF"` (`skjllqqdhtbrwspwxgqe`, PostgreSQL `17.6.1.155`, região `us-west-2`), classificado como **AMBIENTE OPERACIONAL / PRODUÇÃO ATIVO** — inspecionado exclusivamente com consultas `SELECT` somente leitura em catálogos de sistema (`pg_policies`, `pg_proc`, `pg_class`, `pg_trigger`, `information_schema.columns`, `list_migrations`, `get_advisors`).
- **Regra de segurança aplicada:** Nenhuma linha de código, migration, configuração ou dado de produção foi modificada.

---

## 2. Resumo Executivo
- **Resultado geral:** **REPROVADO PARA PRODUÇÃO SEM CORREÇÕES PRÉVIAS (NO-GO para uso multi-tenant / offline crítico).** Embora o build (`next build`), a tipagem (`tsc --noEmit`) e o linter (`eslint`) passem com código de saída `0`, a auditoria linha por linha revelou **falhas críticas de segurança no banco ao vivo**, **defeitos bloqueantes nas migrations locais não aplicadas (`012`–`014`)**, **quebras estruturais no motor de sincronização offline (`SyncEngine`)**, **falha silenciosa na baixa automática de sêmen (`executeStepIA`)** e **bugs de integridade em fluxos de IATF, estoque genético, importação e relatórios**.
- **Riscos críticos:**
  1. **Banco ao vivo sem isolamento multi-tenant em 13 tabelas e `protocol_steps` sem RLS (`AUD-001`, `AUD-002`):** Políticas `USING (true)` e `GRANT ALL TO anon` expõem dados de clientes, botijões, movimentações, manejos e veterinários para qualquer sessão/chave `anon`.
  2. **Migration local `012` quebraria o sistema se aplicada como está (`AUD-003`):** Ela apaga todas as políticas `*_dev_policy`, mas tenta recriar políticas usando nomes de tabelas inexistentes (`genetic_tanks`, `genetic_canisters`, etc.) e omite `organizations`, `iatf_lot_animals`, `protocol_steps` e `input_losses`, deixando **12+ tabelas com RLS ativo e zero políticas (lockout total)**.
  3. **RPCs `SECURITY DEFINER` vulneráveis a IDOR cross-tenant e takeover de contas (`AUD-004`, `AUD-005`):** `create_team_member_user` e as 7 RPCs do módulo genético executam como `SECURITY DEFINER` sem validar `auth.uid()` nem pertencimento à organização, e com `EXECUTE` concedido a `anon`/`authenticated`.
  4. **Sincronização offline (`SyncEngine`) quebrada por design (`AUD-006`, `AUD-007`):** `syncNow()` usa `.upsert()` em payloads parciais de `update` (violando `NOT NULL`) e injeta `organization_id` na tabela `iatf_lot_animals` (que não possui essa coluna), fazendo **todas** as sincronizações de manejos offline falharem no PostgREST.
- **Principais bloqueios:**
  - Ausência de ambiente **staging** isolado (Docker e Supabase CLI não instalados localmente; `list_branches = []`). Testes dinâmicos de escrita, E2E no navegador e validação de RLS cross-tenant permanecem `BLOCKED`.
- **Áreas não examinadas dinamicamente:** Execução E2E em navegador real, testes de carga, verificação de backups/PITR no painel Supabase (sem acesso administrativo à organização Supabase).

---

## 3. Escopo e Limitações

| Área | Incluída? | Ambiente / Acesso | Limitação |
|---|---|---|---|
| Frontend (`src/app`, `src/components`, `src/context`) | Sim (100% estático) | Código local (`f:\IATF`) | Sem execução E2E interativa no navegador |
| Backend / API (`/api/team/members`, `middleware.ts`) | Sim (100% estático) | Código local | Sem chamadas HTTP com escrita ou `SUPABASE_SERVICE_ROLE_KEY` |
| Banco de Dados (`supabase/migrations/*` + catálogos live) | Sim | Local + Supabase MCP (read-only) | Proibida escrita, aplicação de migrations ou leitura de dados pessoais/PII |
| Autenticação / Autorização / RBAC | Sim | Estático + catálogos `pg_policies`/`pg_proc` | Sem testes dinâmicos multi-usuário por ausência de staging |
| Offline / PWA (`syncEngine`, `offlineDb`, `sw.js`) | Sim (100% estático) | Código local | Sem simulação dinâmica de queda de rede no navegador |
| Segurança e Dependências | Sim | `npm audit`, `next.config.mjs`, código + SQL | Sem pentest ativo ou varredura externa |
| Performance / Confiabilidade | Parcial | Build metrics + análise de queries | Sem profiling em runtime ou testes de carga |

---

## 4. Arquitetura e Inventário

- **Stack principal:** Next.js `15.5.29` (App Router), React `19.2.8`, TypeScript `5.9.3` (`strict: true`), Tailwind CSS `4.3.3`, Supabase (`@supabase/supabase-js@2.112.3`, `@supabase/ssr@0.5.2`), Dexie `4.4.6` (IndexedDB offline), ExcelJS `4.4.0`, Recharts `2.15.4`, Lucide React `0.475.0`.
- **Rotas Next.js (`src/app/`):**
  - `/` (Dashboard), `/login`, `/lots`, `/animals`, `/animals/[id]`, `/agenda`, `/protocols`, `/registries`, `/estoque-semen`, `/inputs` (redirect para `/estoque-semen`), `/import`, `/reports`, `/team`.
  - API Route: `/api/team/members` (`POST`, `PATCH`).
  - Middleware: `src/middleware.ts` (validação de sessão Supabase, status `inactive` e RBAC básico em `/team`).
- **Camada de dados e offline:**
  - `src/lib/db.ts` (10.228 linhas no workspace atual — fachada monolítica para IATF, rebanho, lotes, manejos, cadastros, equipe e cache em memória).
  - `src/lib/services/geneticInventoryService.ts` (1.269 linhas — botijões, canecas, materiais genéticos, saldos, movimentações, comprovantes).
  - `src/lib/offline/offlineDb.ts` (Dexie v4) + `src/lib/offline/syncEngine.ts` (1.209 linhas) + `public/sw.js`.
- **Banco de dados (Supabase PostgreSQL 17):**
  - 30 tabelas/views observadas no schema `public` ao vivo (`animals`, `iatf_lots`, `iatf_lot_animals`, `animal_managements`, `management_events`, `protocols`, `protocol_steps`, `semen_batches`, `bulls`, `farms`, `properties`, `reproductive_seasons`, `veterinarians`, `organizations`, `organization_members`, `input_losses`, 11 tabelas do módulo genético da `007`, views `lot_stats` e `organization_metrics`).
  - **Drift crítico de migrations:** O banco ao vivo registra apenas 8 migrations aplicadas (`001`..`005`, `009`, `fix_management_events_rls`, `fix_all_rls_dev_policies`), enquanto o repositório local possui `001`..`014` + `ROLLBACK_012_014.sql` e tabelas/colunas no banco ao vivo (`input_losses`, `iatf_lots.responsible_name`) que não constam em nenhuma migration.

---

## 5. Matriz de Testes

| ID | Área | Teste | Resultado esperado | Status real | Evidência |
|---|---|---|---|---|---|
| `T-01` | Build/Tipos | `npx tsc --noEmit -p .` | Exit 0, sem erros | **PASS** | `TSC_EXIT=0` (0 erros) |
| `T-02` | Linter | `npx eslint src` | Exit 0, sem erros | **PASS** | `ESLINT_EXIT=0` (warnings suprimidos/ausentes) |
| `T-03` | Build Prod | `npx next build` | Exit 0, 16 rotas geradas | **PASS** | `BUILD_EXIT=0`; alerta de bundle: `/reports` com `913 kB` First Load JS |
| `T-04` | Dependências | `npm audit --omit=dev` | 0 vulnerabilidades High/Critical | **FAIL** | `AUDIT_EXIT=1`: **5 vulnerabilidades** (2 High: `brace-expansion`, `postcss` via `next`; 3 Moderate: `uuid` via `exceljs`) |
| `T-05` | Banco Live | Inspeção RLS, `pg_proc`, `pg_class`, `pg_views` | RLS multi-tenant em todas as tabelas; sem `SECURITY DEFINER` exposto a `anon` | **FAIL** | 13 tabelas com `qual=true`; `anon_exec=true` em 15 funções; `lot_stats`/`organization_metrics` sem `security_invoker` |
| `T-06` | Migrations | Auditoria estática `001`..`014` vs live schema | Sequência aplicável em banco limpo e `012` segura | **FAIL** | `003`/`004`/`005`/`010`/`011`/`014` falham em fresh DB; `012` causa lockout em 12+ tabelas; `ROLLBACK_012_014.sql` falha por dependência |
| `T-07` | Código Fonte | Leitura linha por linha (100% `src/`, `public/`, `supabase/`) | Ausência de bugs graves de lógica, race conditions, IDOR e falhas offline | **FAIL** | 40+ achados confirmados em `db.ts`, `syncEngine.ts`, `lots`, `BatchLotManagementModal`, `registries`, `reports`, `genetic` |
| `T-08` | E2E / Escrita | Testes dinâmicos de fluxos IATF, RLS cross-tenant e Sync offline | Fluxos validados ponta a ponta | **BLOCKED** | Ambiente remoto é produção ativa sem staging/branch isolado |

---

## 6. Achados Consolidados (Ordenados por Severidade)

### Critical

#### AUD-001 — Políticas RLS permissivas (`USING (true)`) e `GRANT ALL TO anon` em produção
- **Severidade:** Critical | **Confiança:** Confirmed | **Status:** Open
- **Componente:** Supabase Live DB (`007_genetic_inventory_module.sql:876-904`, `002_fix_rls_dev_policies.sql:25`, `005_veterinarians.sql:17`)
- **Evidência reproduzível:** Consulta ao vivo em `pg_policies` e `pg_class` confirmou 13 tabelas com política `ALL` para `{public}` com `qual = 'true'` e `with_check = 'true'`: `animal_managements`, `veterinarians`, `genetic_centers`, `genetic_clients`, `semen_tanks`, `semen_tank_canisters`, `tank_nitrogen_measurements`, `genetic_materials`, `genetic_material_batches`, `genetic_inventory_movements`, `genetic_inventory_balances`, `genetic_withdrawal_receipts`, `genetic_audit_logs`. Todas as tabelas têm `anon_sel = true`, `anon_ins = true`, `anon_del = true`.
- **Impacto / Cenário de falha:** Qualquer pessoa com a `NEXT_PUBLIC_SUPABASE_ANON_KEY` (pública no bundle do navegador) pode ler, alterar ou apagar dados de **todas as organizações** nessas 13 tabelas sem sequer estar autenticada.
- **Correção recomendada:** Revogar `ALL` de `anon`, remover todas as políticas `*_dev_policy` / `USING (true)` e aplicar políticas `TO authenticated` filtrando `organization_id IN (SELECT public.get_user_org_ids())`.
- **Teste de regressão:** Tentar `SELECT`/`INSERT`/`DELETE` via cliente anônimo e via usuário da Org B em registros da Org A (esperar 0 linhas / erro `42501`).

#### AUD-002 — Tabela `protocol_steps` sem RLS habilitado e com `GRANT ALL TO anon`
- **Severidade:** Critical | **Confiança:** Confirmed | **Status:** Open
- **Componente:** `supabase/migrations/001_initial_schema.sql:121-130, 198-208`, `002_fix_rls_dev_policies.sql:25`, `012_security_rls_rbac_hardening.sql:109-115`
- **Evidência reproduzível:** `001` não executa `ENABLE ROW LEVEL SECURITY` em `protocol_steps`; `002:25` concede `GRANT ALL ON TABLE protocol_steps TO anon, authenticated, service_role`; `012:109-115` não lista `protocol_steps` em `tables_with_org`. (No banco ao vivo há política `tenant_protocol_steps` criada manualmente fora das migrations, mas em provisionamento pelas migrations a tabela fica totalmente aberta).
- **Impacto / Cenário de falha:** Em qualquer novo ambiente provisionado pelas migrations, `anon` lê, altera e apaga etapas de protocolos de todos os tenants.
- **Correção recomendada:** Habilitar RLS explicitamente em `protocol_steps`, revogar `anon` e vincular política `TO authenticated` via `EXISTS (SELECT 1 FROM protocols p WHERE p.id = protocol_id AND p.organization_id IN (SELECT public.get_user_org_ids()))`.
- **Teste de regressão:** Verificar `pg_class.relrowsecurity = true` e testar acesso cross-tenant após provisionamento limpo.

#### AUD-003 — Migration `012_security_rls_rbac_hardening.sql` causa lockout total de 12+ tabelas se aplicada
- **Severidade:** Critical | **Confiança:** Confirmed | **Status:** Open
- **Componente:** `supabase/migrations/012_security_rls_rbac_hardening.sql:60-77, 106-132`
- **Evidência reproduzível:**
  - Linhas `60-77` removem **todas** as políticas `*_dev_policy` e `qual = 'true'` no schema `public`.
  - Linhas `113-114` listam nomes de tabelas **inexistentes**: `'genetic_tanks'`, `'genetic_canisters'`, `'genetic_inventory_items'`, `'genetic_movements'`, `'genetic_receipts'`.
  - Ficam sem política recriada: `semen_tanks`, `semen_tank_canisters`, `tank_nitrogen_measurements`, `genetic_centers`, `genetic_materials`, `genetic_material_batches`, `genetic_inventory_movements`, `genetic_inventory_balances`, `genetic_withdrawal_receipts`, `genetic_audit_logs`, além de `organizations`, `iatf_lot_animals` e `input_losses`.
- **Impacto / Cenário de falha:** Aplicar a migration `012` (commit `3e2b54e`) em staging ou produção **trava completamente** o módulo de estoque genético, leitura de organizações e vínculos de lotes.
- **Correção recomendada:** Corrigir a lista `tables_with_org` na `012` com os nomes reais das 11 tabelas da `007` + `input_losses`, e criar políticas explícitas para `organizations`, `iatf_lot_animals` e `protocol_steps`.
- **Teste de regressão:** Aplicar `012` em staging e validar `SELECT`/`INSERT`/`UPDATE` em todos os módulos como usuário autenticado.

#### AUD-004 — RPCs `SECURITY DEFINER` sem validação de `auth.uid()`/tenant (IDOR cross-tenant e takeover de conta)
- **Severidade:** Critical | **Confiança:** Confirmed | **Status:** Open
- **Componente:** `supabase/migrations/007_genetic_inventory_module.sql:252-858`, `008_team_and_farm_freeze.sql:49-89`, `src/lib/db.ts:8556`
- **Evidência reproduzível:**
  - Live `pg_proc`: `create_team_member_user` e todas as 7 RPCs `fn_process_genetic_*` / `fn_record_nitrogen_measurement` são `SECURITY DEFINER` com `anon_exec = true`, `auth_exec = true` e `cfg = ''` (`search_path` mutável).
  - `008:79-89`: `create_team_member_user` sobrescreve `encrypted_password` em `auth.users` pelo e-mail sem checar permissão do chamador. `db.ts:8556` ainda mantém `createTeamMemberDirect` chamando essa RPC.
  - `007:744, 854`: `fn_process_genetic_reversal` busca `WHERE id = p_movement_id` e `fn_record_nitrogen_measurement` atualiza `WHERE id = p_tank_id` sem validar `p_organization_id`/`p_farm_id` nem `auth.uid()`. `idempotency_key` em `inbound`/`outbound`/`usage_iatf` também é checada globalmente sem `organization_id`.
- **Impacto / Cenário de falha:** No banco ao vivo, qualquer usuário (ou `anon`) pode tomar conta de qualquer usuário via e-mail ou manipular/estornar saldos genéticos de outras organizações. Mesmo após `012` revogar `anon`, usuários autenticados da Org A continuam podendo atacar a Org B via RPCs genéticas.
- **Correção recomendada:** Remover `create_team_member_user` e `createTeamMemberDirect`; exigir `p_organization_id IN (SELECT public.get_user_org_ids())` e vínculo real de `farm_id`/`tank_id`/`movement_id` no início de cada RPC da `007`; fixar `SET search_path = public, pg_temp` e revogar `EXECUTE` de `anon`.
- **Teste de regressão:** Invocar cada RPC com `p_organization_id` ou `p_movement_id` de outro tenant e validar rejeição (`RAISE EXCEPTION`).

#### AUD-005 — Política de `organization_members` permite auto-associação / escalação e `get_user_org_ids()` ignora `status = 'inactive'`
- **Severidade:** Critical | **Confiança:** Confirmed | **Status:** Open
- **Componente:** Live `pg_policies` (`tenant_org_members`), Live `pg_proc` (`get_user_org_ids`), `src/app/login/page.tsx`, `src/middleware.ts:98-121`
- **Evidência reproduzível:**
  - Política live `tenant_org_members` (`cmd=ALL`): `with_check = ((organization_id IN (SELECT get_user_org_ids())) OR (user_id = auth.uid()))`.
  - Definição live de `get_user_org_ids()`: `SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid();` (não verifica `status = 'active'`).
  - `src/middleware.ts:112-120`: `if (pathname.startsWith('/team') && member && member.role !== 'admin')` dentro de `try { ... } catch {}` (fail-open se `member` for `null` ou a query falhar).
- **Impacto / Cenário de falha:** Um usuário autenticado pode inserir/atualizar sua própria linha em `organization_members` alterando `role = 'admin'` ou `organization_id` (para qualquer UUID), além de colaboradores inativados continuarem com acesso total ao banco via API REST do Supabase.
- **Correção recomendada:** Aplicar a correção da `012` (separando `SELECT` de `INSERT/UPDATE/DELETE` apenas para `is_org_admin`, atualizando `get_user_org_ids()` para exigir `status = 'active'`, e tornando o middleware fail-closed).
- **Teste de regressão:** Tentar `UPDATE organization_members SET role='admin'` como operador e consultar tabelas como usuário `inactive`.

#### AUD-006 — `SyncEngine.syncNow()` usa `.upsert()` em updates parciais e injeta `organization_id` em `iatf_lot_animals`
- **Severidade:** Critical | **Confiança:** Confirmed | **Status:** Open
- **Componente:** `src/lib/offline/syncEngine.ts:160-162, 240-250`
- **Evidência reproduzível:**
  - Linhas `160-162` e `240-242`: injetam `payload.organization_id = finalOrgId` em toda mutação exceto `custom_rpc`. Porém `iatf_lot_animals` **não possui** coluna `organization_id` (confirmado em `001_initial_schema.sql:162-177` e `information_schema.columns` ao vivo).
  - Linhas `244-250`: `if (item.action === 'insert' || item.action === 'update') { await supabase.from(item.table).upsert(payload, { onConflict: 'id' }); }`.
- **Impacto / Cenário de falha:** Toda sincronização offline de `iatf_lot_animals` falha com `PGRST204` (`Could not find the 'organization_id' column`), e toda mutação `'update'` em `animal_managements`, `animals` e `iatf_lots` falha com erro `23502` (`null value in column ... violates not-null constraint`) porque o `INSERT` do `upsert` exige colunas `NOT NULL` ausentes no payload parcial (`farm_id`, `animal_id`, `start_date`, `tag_number`). **O fluxo offline→online principal do curral não sincroniza.**
- **Correção recomendada:** Separar `item.action === 'update'` usando `.update(payload).eq('id', item.record_id)`, e excluir tabelas sem `organization_id` (`iatf_lot_animals`, `protocol_steps`) da injeção automática.
- **Teste de regressão:** Executar D0, D9, IA e DG offline e validar `syncNow()` completo sem erros até esvaziar `sync_queue`.

---

### High

#### AUD-007 — Baixa automática de sêmen em `executeStepIA` (online) nunca executa por comparação pós-UPDATE
- **Severidade:** High | **Confiança:** Confirmed | **Status:** Open
- **Componente:** `src/lib/db.ts:7831-7893`
- **Evidência reproduzível:** `executeStepIA` executa `.update({ semen_batch_id: data.semen_batch_id || null })` em `animal_managements` nas linhas `7831-7842` e **somente depois** lê `existingMgmt.semen_batch_id` nas linhas `7857-7863` para calcular `const isNewBatch = !existingMgmt?.semen_batch_id || existingMgmt.semen_batch_id !== data.semen_batch_id;`.
- **Impacto / Cenário de falha:** Como o novo valor já foi gravado, `isNewBatch` é sempre `false`. A baixa em `semen_batches.used_quantity` e em `deductGeneticInventoryForSemenBatch` **nunca acontece** no manejo individual online.
- **Correção recomendada:** Consultar `existingMgmt.semen_batch_id` **antes** do `update` (ou mover para RPC transacional).
- **Teste de regressão:** Executar `executeStepIA` individual e verificar incremento de `used_quantity` e movimento `USAGE` no razão genético.

#### AUD-008 — Idempotência quebrada (`Date.now()`) e erros ignorados em `deductGeneticInventoryForSemenBatch`
- **Severidade:** High | **Confiança:** Confirmed | **Status:** Open
- **Componente:** `src/lib/db.ts:7760-7791`
- **Evidência reproduzível:** Linha `7767`: `const idempotencyKey = \`ia_usage_${params.referenceType}_${params.referenceId}_${bal.id}_${Date.now()}\`;`. Linha `7769`: `await supabase.rpc('fn_process_genetic_usage_iatf', ...)` sem capturar `{ error }`.
- **Impacto / Cenário de falha:** O sufixo `Date.now()` anula a chave de idempotência no banco (permitindo dupla baixa em retries), e falhas da RPC (ex.: saldo insuficiente) são silenciadas, retornando `true` mesmo sem deduzir doses.
- **Correção recomendada:** Remover `Date.now()` da chave de idempotência, capturar `{ error }` da RPC e retornar `false` se houver falha ou `remainingToDeduct > 0`.

#### AUD-009 — Baixa de sêmen da IA offline é apenas local e some após `syncNow()`
- **Severidade:** High | **Confiança:** Confirmed | **Status:** Open
- **Componente:** `src/lib/offline/syncEngine.ts:599-701, 437-462`
- **Evidência reproduzível:** `decrementLocalSemenBatch` (linha `633`) altera apenas o Dexie local; nenhuma mutação para `semen_batches` ou `fn_process_genetic_usage_iatf` é enfileirada na `sync_queue`. Ao voltar online, `syncDownAllData()` (linha `284`) sobrescreve `offlineDb.semen_batches` com os valores antigos do servidor.
- **Impacto / Cenário de falha:** Doses consumidas no curral sem internet nunca são descontadas no servidor.
- **Correção recomendada:** Enfileirar uma mutação `custom_rpc` idempotente para realizar a baixa de sêmen no servidor durante o `syncNow()`.

#### AUD-010 — `rescheduleManagementEvent` offline omite `animal_managements` e online não é atômico
- **Severidade:** High | **Confiança:** Confirmed | **Status:** Open
- **Componente:** `src/lib/db.ts:1663-1704, 1742-1760, 1825-2001`
- **Evidência reproduzível:** No modo offline, `offlineDb.animal_managements.update(...)` é chamado sem `syncEngine.enqueueMutation`, e no reagendamento de `IA` a `expected_parturition_date` não é recalculada. No modo online, múltiplos `update` sequenciais em `iatf_lots`, `animal_managements` e `management_events` ocorrem sem checar `{ error }` e sem atualizar `offlineDb`.
- **Impacto / Cenário de falha:** Dessincronização entre agenda do lote e fichas individuais das matrizes após reagendamentos.
- **Correção recomendada:** Enfileirar mutações de `animal_managements` offline e consolidar o reagendamento online em RPC transacional.

#### AUD-011 — `recordOfflineManagement` e `downloadFarmDataForCurral` usam schema incompatível com o banco
- **Severidade:** High | **Confiança:** Confirmed | **Status:** Open
- **Componente:** `src/lib/offline/syncEngine.ts:959-1000, 1033-1036`, `src/lib/db.ts:4416-4424`
- **Evidência reproduzível:**
  - `recordOfflineManagement` (`syncEngine.ts:965-987`) envia colunas inexistentes em `animal_managements` (`step_code`, `date`, `inseminator`, `bull_name`, `doses_used`, `diagnosis_result`) e omite `start_date` (`NOT NULL`).
  - `downloadFarmDataForCurral` (`syncEngine.ts:1035`) e `createLotOffline` (`db.ts:4419`) filtram/enviam `farm_id` em `reproductive_seasons` (coluna inexistente no banco).
- **Impacto / Cenário de falha:** DG direto offline e criação de estação offline nunca sincronizam; "Preparar para o Curral" retorna estações vazias.
- **Correção recomendada:** Alinhar os payloads com as colunas reais de `animal_managements` e `reproductive_seasons` (`organization_id`).

#### AUD-012 — Itens presos em `'processing'` e loop infinito de retries na `sync_queue`
- **Severidade:** High | **Confiança:** Confirmed | **Status:** Open
- **Componente:** `src/lib/offline/syncEngine.ts:134-143, 219-281`
- **Evidência reproduzível:** `syncNow()` marca o item como `'processing'` (`237`) e só busca `'pending'` (`220`). Em erro (`273`), volta para `'pending'` sem limite de `retry_count`.
- **Impacto / Cenário de falha:** Se o navegador fechar durante o sync, o manejo fica preso em `'processing'` para sempre (perda silenciosa de dados); erros 4xx ficam em loop infinito a cada 60s.
- **Correção recomendada:** Recuperar itens `'processing'` órfãos no início de `syncNow()` e mover para `'failed'` após N tentativas.

#### AUD-013 — `executeStepDG` e `recordDirectDG` sobrescrevem `iatf_lot_animals` de todos os lotes do animal
- **Severidade:** High | **Confiança:** Confirmed | **Status:** Open
- **Componente:** `src/lib/db.ts:7980-7988, 8157-8165`
- **Evidência reproduzível:** `.from('iatf_lot_animals').update({ pregnancy_status: ... }).eq('animal_id', data.animal_id)` sem `.eq('lot_id', ...)`.
- **Impacto / Cenário de falha:** Matrizes que passaram por ressincronização têm o resultado de todos os lotes anteriores sobrescrito pelo DG atual.
- **Correção recomendada:** Filtrar obrigatoriamente por `.eq('lot_id', lotId)`.

#### AUD-014 — `executeBatchLotManagementD0` / `D9` silenciam erros e `BatchLotManagementModal` descarta edições no salvamento parcial
- **Severidade:** High | **Confiança:** Confirmed | **Status:** Open
- **Componente:** `src/lib/db.ts:8742-8854, 8979-9040`, `src/components/BatchLotManagementModal.tsx:174-290, 576, 627`, `src/app/lots/page.tsx:3342-3350`
- **Evidência reproduzível:**
  - `db.ts`: `executeBatchLotManagementD0` e `D9` não verificam `{ error }` nos updates/inserts em `animals`, `animal_managements`, `management_events` e `iatf_lots`.
  - `BatchLotManagementModal.tsx:174-290`: `useEffect` depende de `[isOpen, lot, lotAnimals, initialStepCode]`. Ao salvar 1 linha (`handleSaveSingleIaRow` / `handleSaveSingleDgRow`), `onSuccess()` atualiza `lot` e `lotAnimals`, reiniciando o modal e **apagando edições não salvas das outras linhas**.
- **Impacto / Cenário de falha:** Perda silenciosa de dados digitados no tronco e risco de lote marcado como concluído sem manejos gravados.
- **Correção recomendada:** Inicializar o modal apenas na abertura (`isOpen` `false -> true` ou mudança de `lot.id`) e checar `{ error }` em todas as escritas de lote.

#### AUD-015 — Modo offline quebra filtragem de sêmen por touro e troca de touro padrão mantém partida anterior
- **Severidade:** High | **Confiança:** Confirmed | **Status:** Open
- **Componente:** `src/components/BatchLotManagementModal.tsx:273-301, 1438-1447`, `src/lib/db.ts:2037-2045`
- **Evidência reproduzível:**
  - `getSemenBatches()` offline (`db.ts:2037-2045`) retorna `bulls: { name, code }` omitindo `bull_id` e `bulls.id`, fazendo o filtro do modal retornar `[]` ("Sem estoque") para todos os touros no curral offline.
  - `BatchLotManagementModal.tsx:293-301`: ao trocar para um touro sem partidas cadastradas, `if (matchBatch) setIaDefaultBatchId(matchBatch.id)` não limpa o `iaDefaultBatchId` anterior, vinculando **Touro B + Partida do Touro A**.
- **Impacto / Cenário de falha:** Bloqueio de IA no modo offline e corrupção de paternidade/estoque em massa no modo online.
- **Correção recomendada:** Incluir `bull_id` no retorno offline de `getSemenBatches()` e limpar `setIaDefaultBatchId('')` quando `!matchBatch`.

#### AUD-016 — Entrada rápida no tronco (`handleQuickChuteAdd`) marca `IA` ou `DG` sem touro/diagnóstico
- **Severidade:** High | **Confiança:** Confirmed | **Status:** Open
- **Componente:** `src/app/lots/page.tsx:826-838, 873-895`
- **Evidência reproduzível:** `const targetPhase = activePhaseCode || 'D0'; await handleToggleAnimalStepCheck(existingInLot.animal_id, targetPhase, true);`
- **Impacto / Cenário de falha:** Com o foco na aba `IA` ou `DG`, bipar um brinco na barra rápida marca a matriz como `inseminada` sem touro/sêmen/baixa de dose ou como **`prenha`** sem exame.
- **Correção recomendada:** Restringir marcação rápida automática às etapas de protocolo (`D0`, `D7`, `D8`, `D9`).

#### AUD-017 — Estorno genético (`fn_process_genetic_reversal`) ignora `TRANSFER_OUT`/`TRANSFER_IN` e tem race condition
- **Severidade:** High | **Confiança:** Confirmed | **Status:** Open
- **Componente:** `supabase/migrations/007_genetic_inventory_module.sql:744-814`, `src/components/genetic-inventory/MovementsLedgerView.tsx:179`
- **Evidência reproduzível:** `fn_process_genetic_reversal` trata apenas `INBOUND`, `ADJUSTMENT_POSITIVE`, `OUTBOUND`, `USAGE`, `LOSS` e `ADJUSTMENT_NEGATIVE`. Ao estornar `TRANSFER_OUT`/`TRANSFER_IN`, grava `REVERSAL` no livro-razão sem alterar `genetic_inventory_balances`. Também não usa `FOR UPDATE` em `v_orig` nem `UNIQUE` em `reversed_movement_id`.
- **Impacto / Cenário de falha:** Divergência permanente entre razão e saldo em transferências estornadas e risco de duplo estorno concorrente.
- **Correção recomendada:** Implementar estorno atômico do par de transferência (com ordenação de locks) ou bloquear estorno parcial, usando `FOR UPDATE` + índice único parcial em `reversed_movement_id`.

#### AUD-018 — `MovementWizard` envia `cryopreservation` inválido no cadastro de embriões e `processInbound`/`createTank` não são atômicos
- **Severidade:** High | **Confiança:** Confirmed | **Status:** Open
- **Componente:** `src/components/genetic-inventory/MovementWizard.tsx:649-652`, `supabase/migrations/007_genetic_inventory_module.sql:104`, `src/lib/services/geneticInventoryService.ts:316-353, 683-771`
- **Evidência reproduzível:** A tabela `genetic_materials` exige `CHECK (cryopreservation IN ('DT', 'VT', 'nao_aplicavel'))`, mas a UI envia `'vitrificacao'`, `'congelamento_lento'` ou `'fresco'`. Em `createTank` e `processInbound`, falhas em canecas, lotes ou `semen_batches` são ignoradas ou deixam registros pai órfãos.
- **Impacto / Cenário de falha:** Cadastro de embriões falha no banco; falhas parciais criam botijões sem canecas e lotes genéticos órfãos.
- **Correção recomendada:** Alinhar o `<select>` ao `CHECK` constraint (ou migrar a constraint) e encapsular `createTank` / `processInbound` em RPCs transacionais.

#### AUD-019 — Fallback direto em `freezeFarm`/`unfreezeFarm`, edição offline de etapas em `updateProtocol` e `'local-org'`
- **Severidade:** High | **Confiança:** Confirmed | **Status:** Open
- **Componente:** `src/lib/db.ts:3545-3575, 4563-4568, 5180-5263, 5596-5669`
- **Evidência reproduzível:**
  - `freezeFarm`/`unfreezeFarm` fazem fallback para `UPDATE farms` direto mesmo quando a RPC falha por erro de autorização (contornando `is_org_admin` da `013`).
  - `updateProtocol` offline salva `protocol_steps` no Dexie mas enfileira apenas `protocols` (perda silenciosa das etapas ao sincronizar).
  - `updateLotProtocol` e `updateProtocol` online deletam etapas/eventos sem checar `{ error }` antes de reinserir.
  - `createLot` e `updateLotProtocol` usam fallback `'local-org'` (não-UUID), provocando erro `22P02` e forçando modo offline global.

#### AUD-020 — Importação Excel (`/import`) trata falhas de `createAnimal` como sucesso e grava `'empty'` em vez de `'vazia'`
- **Severidade:** High | **Confiança:** Confirmed | **Status:** Open
- **Componente:** `src/app/import/page.tsx:211-224`
- **Evidência reproduzível:** `const res = await createAnimal({...}); if (res) { imported++; }` — como `res` é um objeto `{ success, error }`, `if (res)` é sempre verdadeiro mesmo quando `res.success === false`. Além disso, envia `reproductive_status: 'empty'`, incompatível com `'vazia'` usado em todo o sistema.
- **Impacto / Cenário de falha:** Planilhas com erros ou brincos duplicados exibem 100% de sucesso, e matrizes importadas ficam com status `'empty'` fora das métricas.
- **Correção recomendada:** Checar `if (res.success)` e gravar `reproductive_status: 'vazia'`.

#### AUD-021 — Abertura de manejo em `/registries` omite `farm_id` e atalho em `/animals` mantém `editingAnimalId`
- **Severidade:** High | **Confiança:** Confirmed | **Status:** Open
- **Componente:** `src/app/registries/page.tsx:80-87, 1318`, `src/app/animals/page.tsx:556-560`
- **Evidência reproduzível:** `registries/page.tsx:1318` chama `handleOpenAnimalMgmt(a.id, a.tag_number)` omitindo `a.farm_id` (cai para `activeFarmId`); `animals/page.tsx:556` abre criação rápida sem limpar `editingAnimalId`, podendo sobrescrever a última matriz editada.

#### AUD-022 — Relatórios, Dashboard e `FichaRelatorioFinalView` distorcem KPIs e ignoram filtros de estação/fazenda
- **Severidade:** High | **Confiança:** Confirmed | **Status:** Open
- **Componente:** `src/lib/db.ts:8288-8397`, `src/app/page.tsx:36-71, 565-570`, `src/app/reports/page.tsx:90-96, 285-316, 834-904`, `src/components/FichaRelatorioFinalView.tsx:111-118, 193-207`
- **Evidência reproduzível:**
  - `getLotCategoryReports` (`db.ts:8288-8397`) não filtra `iatf_lots.organization_id`, não tem paginação (>1000 linhas truncadas) e considera `'pendente'` (truthy) como `isInseminated = true`.
  - Dashboard (`page.tsx:565`): botão "Ver Todas" chama `handleSelectFarm('all')` (no-op em `FarmContext`), mantendo `viewScope = 'farm'`; KPIs ignoram `activeSeason`.
  - `/reports`: ignora `selectedSeasonId` em `lotes_geral` e `targetFarm` em `semen`.
  - `FichaRelatorioFinalView`: classifica animais sem DG (`pendente`/nulo) como `Não Prenha / Vazia`, distorcendo a taxa de prenhez do laudo.

#### AUD-023 — Migrations `003`, `004`, `005`, `010`, `011`, `014` falham em banco limpo e `ROLLBACK_012_014.sql` falha na execução
- **Severidade:** High | **Confiança:** Confirmed | **Status:** Open
- **Componente:** `supabase/migrations/003..014`, `ROLLBACK_012_014.sql`
- **Evidência reproduzível:**
  - `003:11`, `004:40`, `010:19` referenciam `iatf_lots.responsible_name` (não criada nas migrations).
  - `010:108` consulta `input_losses` (tabela não criada nas migrations).
  - `004`, `005`, `011` inserem seeds com `organization_id` hardcoded sem verificar existência.
  - `014:13` cria índice em `animal_managements(organization_id, execution_date DESC)` — coluna `execution_date` **não existe** em `animal_managements`.
  - `ROLLBACK_012_014.sql:23` executa `DROP FUNCTION is_org_admin` antes de dropar as políticas e funções que dependem dela.

#### AUD-024 — Vazamento local entre tenants e ausência de filtro `organization_id` em leituras/mutações
- **Severidade:** High | **Confiança:** Confirmed | **Status:** Open
- **Componente:** `src/lib/db.ts` (múltiplas linhas: `151-212`, `331-2640`, `3313-6183`, `6258-7138`, `4012-5412`, `7617-8595`), `src/lib/services/geneticInventoryService.ts:360-540, 938-1162`
- **Evidência reproduzível:**
  - `getCurrentOrgId()` faz fallback para `localStorage` mesmo quando `!user`.
  - Quase todas as leituras de `offlineDb` (`lots`, `animals`, `bulls`, `farms`, `protocols`, `seasons`, `veterinarians`, `semen_batches`) executam `.toArray()` sem filtrar `organization_id`.
  - `updateBull`, `deleteBull`, `updateGeneticCenter`, `deleteGeneticCenter`, `updateLotCode`, `updateLotNotes`, `updateLotProtocol`, `deleteLot`, `executeStepD0/D9/IA/DG`, `getGeneticCenters`, `updateTank`, `getInventoryBalances` dependem exclusivamente de RLS e omitem `.eq('organization_id', orgId)`.

#### AUD-025 — `handle_new_user_onboarding()` cria organização duplicada mesmo com a migration `013`
- **Severidade:** High | **Confiança:** Confirmed | **Status:** Open
- **Componente:** `src/app/api/team/members/route.ts:91-116`, `supabase/migrations/013_data_integrity_and_main_farm_flag.sql:65-78`
- **Evidência reproduzível:** `POST /api/team/members` chama `admin.auth.admin.createUser(...)` na linha `91` e só insere em `organization_members` na linha `106`. Como o trigger `on_auth_user_created` (`AFTER INSERT ON auth.users`) dispara na linha `91`, a checagem `IF EXISTS (SELECT 1 FROM public.organization_members WHERE user_id = NEW.id)` da `013:76` ainda será `FALSE`, criando uma organização, fazenda e vínculo `admin` extras para cada membro convidado.
- **Correção recomendada:** Passar flag em `user_metadata` (ex.: `skip_onboarding: true`) ao chamar `admin.auth.admin.createUser` e verificá-la em `handle_new_user_onboarding()`.

---

### Medium

| ID | Título | Componente / Arquivo:Linha | Impacto / Evidência |
|---|---|---|---|
| `AUD-026` | Vulnerabilidades conhecidas em dependências (`npm audit`) | `package.json`, `package-lock.json` | 2 High (`brace-expansion`, `postcss` via `next@15.5.29`) e 3 Moderate (`uuid` via `exceljs@4.4.0`). |
| `AUD-027` | Consultas Supabase sem paginação (truncamento silencioso em 1000 linhas) | `db.ts:405, 597, 1287, 2080, 2294, 3813`, `syncEngine.ts:324-421`, `geneticInventoryService.ts:52-153, 494-540`, `registries/page.tsx:166` | PostgREST limita respostas a 1000 linhas por padrão (`max_rows`), truncando animais, lotes, eventos e saldos em rebanhos grandes. |
| `AUD-028` | Trava de "Fazenda Principal" frágil (`ilike('%principal%')`) e fail-open | `geneticInventoryService.ts:260-287`, `estoque-semen/page.tsx:73-74` | Ignora `is_main_farm` (da `013`), retorna `{ allowed: true }` em erro de query e falta em `updateTank` e `processReversal`. |
| `AUD-029` | Cache em memória com chaves incompatíveis e sem isolamento por tenant | `db.ts:525` (`lot_${id}`), `db.ts:8291` (`lot_cat_report_*`), `db.ts:5476` (`cachedFarms`), `db.ts:4123` (`localStorage` centrais) | `invalidateCache('lots')` não invalida `getLotById` nem `getLotCategoryReports`; `cachedFarms` não isola por `orgId`. |
| `AUD-030` | `getAvailableAnimalsForLot` aplica `.limit(100)` antes de filtrar animais do lote | `src/lib/db.ts:919-925` | Se os primeiros 100 brincos já estiverem no lote, retorna lista vazia mesmo havendo animais disponíveis. |
| `AUD-031` | Service Worker cacheia HTML autenticado e logout não limpa `caches` | `public/sw.js:3-10, 49-71`, `src/components/Sidebar.tsx:120-145` | Em dispositivos compartilhados, HTML cacheado pode vazar entre sessões após logout. |
| `AUD-032` | Criação de usuário em `/api/team/members` sem rollback e `PATCH` sem checar 0 linhas | `src/app/api/team/members/route.ts:91-126, 181-191` | Falha no `upsert` deixa usuário órfão em `auth.users` (causando `409`); `PATCH` com ID inválido retorna `200`. |
| `AUD-033` | Multi-org ambíguo em `organization_members` (`limit(1).maybeSingle()`) | `src/middleware.ts:98-103`, `src/app/api/team/members/route.ts:18-23` | Usuário em >1 organização pode cair na organização errada para checagem de `role`/`status`. |
| `AUD-034` | `DEFAULT_BREEDS` com IDs não-UUID e dados pessoais hardcoded em produção | `db.ts:6-17, 6844-6923`, `lots/page.tsx:244`, `BatchLotManagementModal.tsx:99`, `MovementWizard.tsx:119`, `registries/page.tsx:636` | `breed-nelore` quebra FK UUID no Postgres; `'MV. DR. SAMOEL DUARTE'` e auto-INSERT em `getVeterinarians` vazam em novos tenants. |
| `AUD-035` | Bugs de fuso horário (`new Date(str)`) e gráficos (`setMonth`) | `lots/page.tsx:111, 185`, `AnimalManagementModal.tsx:224-226`, `MovementWizard.tsx:257, 276, 324`, `geneticInventoryService.ts:160` | `new Date('YYYY-MM-DD')` vira 21:00 do dia anterior em UTC-3; `setMonth` nos dias 29–31 pula fevereiro. |
| `AUD-036` | Bugs de estado/UX com risco de erro operacional em modais e telas | `lots/page.tsx` (`useEffect([lots])`, race em `handleSelectLot`, checks otimistas sem rollback, `try/finally` ausente), `AnimalManagementModal.tsx:116-188` (estado residual), `registries/page.tsx` (erros atrás do backdrop `z-50`), `estoque-semen/page.tsx:127` (spinner infinito sem fazenda), `agenda/page.tsx:150` (fetch duplo), `protocols/page.tsx` (sem `try/finally`), `team/page.tsx:128-165` (`fetch` sem `try/catch`) | Travamento de spinners, perda silenciosa de erros, estado da matriz anterior vazando para a próxima e reabertura forçada de modais. |
| `AUD-037` | `downloadFarmDataForCurral` não normaliza `ear_tag` e falta idempotência em transfer/adjustment | `syncEngine.ts:1101-1108`, `007_genetic_inventory_module.sql:431-533, 619-719` | Índices locais de `ear_tag` falham após preparo offline; transferências concorrentes opostas têm risco de deadlock e ausência de `p_idempotency_key`. |
| `AUD-038` | `GRANT ALL/SELECT` para `anon` não revogados na `012` e `handle_new_user_onboarding` sem `CREATE TRIGGER` nas migrations | `012_security_rls_rbac_hardening.sql`, `013_data_integrity_and_main_farm_flag.sql:65-105` | Violação de menor privilégio e falha de onboarding em provisionamento limpo. |

---

### Low / Informational

| ID | Título | Componente / Arquivo:Linha | Resumo |
|---|---|---|---|
| `AUD-039` | Inconsistências de UI, labels, sanitização e timers sem cleanup | `BatchLotManagementModal.tsx:60-67` (`D7`/`D8` gravados como `D9`), `Sidebar.tsx:221, 328` (badge `Admin` fixo), `team/page.tsx:488` (`Mínimo 6` vs validação 8), `PWAInstallPrompt.tsx:37-50` (listener leak iOS), `lots/page.tsx`, `registries/page.tsx`, `agenda/page.tsx` (`setTimeout` sem cleanup), `excelFichaRelatorioExport.ts:339-343` (`lotName` sem sanitizar + `revokeObjectURL` síncrono), `animals/[id]/page.tsx:189, 330` (`alert()` nativo e data crua) | Defeitos localizados sem comprometimento estrutural imediato. |
| `AUD-040` | Ausência de suíte de testes automatizados, CI/CD, CSP e ambiente staging | Repositório raiz, `next.config.mjs` | Zero arquivos `*test*`/`*spec*`, sem pipeline de CI e sem `Content-Security-Policy` configurada. |

---

## 7. Segurança e Privacidade
- **Controles positivos observados:**
  - Ausência total de `dangerouslySetInnerHTML`, `innerHTML` ou `document.write` em toda a base `src/` revisada (sem vetores óbvios de XSS DOM).
  - `next.config.mjs` define `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` e `HSTS`.
  - `/api/team/members` implementa checagem de sessão (`getUser()`), papel `admin` ativo, proteção contra rebaixamento/inativação do último admin e bloqueio de sobrescrita de contas existentes (`409`).
  - `.gitignore` protege `.env*` e não há segredos hardcoded no código-fonte.
- **Principais exposições confirmadas:** Banco ao vivo exposto por políticas `USING (true)` e `GRANT ALL TO anon` (`AUD-001`), RPCs `SECURITY DEFINER` sem validação de tenant/usuário (`AUD-004`), `get_user_org_ids()` aceitando inativos (`AUD-005`), fallback de `orgId` em `localStorage` e leitura de IndexedDB sem isolamento de tenant (`AUD-024`), além de cache HTML autenticado no Service Worker (`AUD-031`).

## 8. Integridade e Confiabilidade dos Dados
- **Offline (`SyncEngine` + Dexie):** O mecanismo atual de sincronização **não é utilizável com segurança em produção** devido a `AUD-006` (`.upsert()` parcial + `organization_id` em `iatf_lot_animals`), `AUD-009` (perda da baixa de sêmen), `AUD-010`/`AUD-011`/`AUD-019` (omissão de `animal_managements`/`protocol_steps`, schema inválido no DG direto e `reproductive_seasons.farm_id`) e `AUD-012` (itens presos em `'processing'`).
- **Estoque Genético e IATF:** Falha na baixa automática de `executeStepIA` (`AUD-007`), idempotência quebrada por `Date.now()` (`AUD-008`), estorno de transferências sem reversão de saldo (`AUD-017`), `CHECK` de embriões incompatível (`AUD-018`) e operações multi-etapa sem transação (`AUD-014`, `AUD-018`, `AUD-019`).
- **Migrations e Schema:** Drift significativo entre `supabase/migrations/` e o banco ao vivo (`AUD-003`, `AUD-023`).

## 9. Performance e Observabilidade
- **Build & Bundle:** `npx next build` gerou 16 rotas com sucesso. Destaque de atenção para `/reports` com **`913 kB`** de First Load JS (323 kB da rota, puxado por `exceljs` + `recharts` no bundle cliente) e `/estoque-semen` com **`627 kB`**.
- **Queries e Rede:** Múltiplas consultas sem paginação sujeitas ao teto padrão de 1000 linhas do PostgREST (`AUD-027`), N+1 em `rescheduleManagementEvent`, `createLot` e `/import`, e invalidação global de cache (`invalidateCache()` sem prefixo) no serviço genético.
- **Observabilidade:** Ausência de logging estruturado, correlation IDs, monitoramento de erros em produção ou health check dedicado.

## 10. Itens Bloqueados ou Não Executados

| Teste | Motivo | Aprovação / Acesso necessário |
|---|---|---|
| Validação dinâmica de RLS multi-tenant e RPCs | Banco conectado é produção ativa; sem staging/branch | Criação de projeto staging isolado + massa sintética |
| Testes E2E de fluxo completo (D0→D9→IA→DG, offline→online, `/import`) | Evitar criação/corrupção de registros reais em produção | Ambiente staging + credenciais sintéticas |
| Verificação de backup/PITR e plano Supabase | `get_organization` retornou `Forbidden` no MCP | Acesso administrativo no painel Supabase |

## 11. Plano de Correção Priorizado (Não Aplicado)

| Ordem | Lote / Foco | Achados cobertos | Dependências | Critério de aceite |
|---|---|---|---|---|
| **1** | **Gate 0 — Staging Isolado** | Bloqueio `T-08` | Criação de projeto Supabase Staging | Baseline schema-only + seeds sintéticos funcionando |
| **2** | **Lote 1 — Segurança Crítica DB & Auth** | `AUD-001`, `AUD-002`, `AUD-003`, `AUD-004`, `AUD-005`, `AUD-025`, `AUD-032`, `AUD-033`, `AUD-038` | Gate 0 | Corrigir `012`/`013`/`014` antes de aplicar; `anon` bloqueado em todas as tabelas/RPCs; isolamento cross-tenant validado; `/team` fail-closed |
| **3** | **Lote 2 — Integridade IATF, Sêmen & Genética** | `AUD-007`, `AUD-008`, `AUD-013`, `AUD-014`, `AUD-015`, `AUD-016`, `AUD-017`, `AUD-018`, `AUD-019`, `AUD-028` | Lote 1 | Baixa de sêmen funcionando em IA individual e lote; estorno de transferência atômico; modal preserva edições parciais; cadastro de embriões funcionando |
| **4** | **Lote 3 — Motor Offline & Isolamento Local** | `AUD-006`, `AUD-009`, `AUD-010`, `AUD-011`, `AUD-012`, `AUD-024`, `AUD-029`, `AUD-031`, `AUD-037` | Lote 2 | Fluxo D0→D9→IA→DG→baixa de sêmen offline sincroniza 100% ao reconectar; Dexie/Cache Storage isolados por `orgId` e limpos no logout |
| **5** | **Lote 4 — Importação, Relatórios, Migrations & Qualidade** | `AUD-020`, `AUD-021`, `AUD-022`, `AUD-023`, `AUD-026`, `AUD-027`, `AUD-030`, `AUD-034`, `AUD-035`, `AUD-036`, `AUD-039`, `AUD-040` | Lotes 1–3 | `/import` validado; KPIs de Dashboard/Relatórios/`FichaRelatorioFinalView` consistentes; migrations aplicam em fresh DB; paginação >1000 linhas |

## 12. Conclusão
Esta auditoria verificou integralmente os arquivos de código-fonte (`src/`, `public/`, `supabase/migrations/`, configurações) e os metadados estruturais do banco ao vivo em modo estritamente somente leitura. **A aprovação de compilação/lint (`tsc`, `eslint`, `next build`) não reflete a segurança nem a integridade funcional do sistema:** existem vulnerabilidades críticas ativas no banco em produção, uma migration corretiva local (`012`) que causaria indisponibilidade total se aplicada sem ajustes, e falhas estruturais no modo offline e na baixa de sêmen. Nenhum sistema pode ser declarado livre de defeitos apenas por inspeção estática; após a execução dos lotes de correção em staging, será indispensável executar validação dinâmica ponta a ponta (Modo C).

## 13. Aprovação para Próxima Fase
- [ ] Auditoria aceita
- [ ] Correção autorizada para os IDs: `_________________`
- [ ] Ambiente autorizado: `staging` (obrigatório antes de produção)
- [ ] Restrições adicionais: `_________________`
