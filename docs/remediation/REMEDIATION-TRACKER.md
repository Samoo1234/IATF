# Rastreador de Remediação (`REMEDIATION-TRACKER.md`)

**Projeto:** IATF Master (`f:\IATF`)  
**Relatório de Origem:** [AUDIT-FINAL.md](file:///f:/IATF/AUDIT-FINAL.md) (commit `fbbd651`)  
**Branch de Remediação:** `remediation/iatf-master-audit`

## Legenda de Status (Seção 7)
- `PENDENTE` — Aguardando início do respectivo lote.
- `EM ANÁLISE` — Em investigação de causa/impacto (somente leitura).
- `EM CORREÇÃO` — Implementação em andamento no lote autorizado.
- `CORRIGIDO` — Alteração implementada, porém ainda sem comprovação completa por testes.
- `VALIDADO` — Correção implementada e testes de regressão aprovados, com evidências registradas.
- `REPROVADO` — Testes demonstraram persistência do problema ou regressão.
- `BLOQUEADO` — Depende de ambiente staging, acesso, credencial ou decisão ainda indisponível.

> **Regra de rastreabilidade:** Alteração de código ou compilação TypeScript (`tsc`) não equivale a validação. Nenhum achado é marcado como `VALIDADO` sem execução e evidência dos testes correspondentes.

---

## Matriz dos 21 Achados Originais

| ID | Severidade original | Status | Causa confirmada | Arquivos alterados | Testes | Evidência |
|---|---|---|---|---|---|---|
| `AUD-001` | Critical | `BLOQUEADO` | RPC `SECURITY DEFINER` `public.create_team_member_user` executável por `anon`/`authenticated` sem checar `auth.uid()` ou papel, escrevendo em `auth.users` e sobrescrevendo senhas existentes. | Nenhum (Fase 0) | `T-05`, `T-08` (Auditoria); testes Lote 0 bloqueados | `pg_proc` live (`anon_exec=true`), `get_advisors(security)` `0028`, `008_team_and_farm_freeze.sql:49-179`. Aguarda staging + aprovação Lote 0 + `SUPABASE_SERVICE_ROLE_KEY` server-side. |
| `AUD-002` | Critical | `BLOQUEADO` | Política `tenant_org_members` em `organization_members` permite `ALL` com `OR (user_id = auth.uid())` em `qual`/`with_check`; `/login` possui `signUp()` aberto. | Nenhum (Fase 0) | `T-08` (Auditoria); testes Lote 0 bloqueados | `pg_policies` live (`tenant_org_members`), `src/app/login/page.tsx:26-36`. Aguarda staging + decisão sobre self-signup + aprovação Lote 0. |
| `AUD-003` | Critical | `BLOQUEADO` | 13 tabelas live com RLS aberta (`USING (true)` para `{public}`), 2 views `SECURITY DEFINER` (`lot_stats`, `organization_metrics`) acessíveis a `anon` e 12 demais RPCs `SECURITY DEFINER` executáveis por `anon` sem checagem de tenant. | Nenhum (Fase 0) | `T-05`, `T-08` (Auditoria); testes Lote 0 bloqueados | `pg_policies`, `pg_class`/`pg_proc`, `get_advisors(security)` `0010`/`0028`/`0029`. Aguarda staging + aprovação Lote 0. |
| `AUD-004` | Critical | `PENDENTE` | `npm audit` reporta 13 vulnerabilidades (1 Critical em `next@15.5.23`, 6 High incluindo `xlsx@0.18.5` sem fix oficial, `postcss`, `sharp`, `source-map-js`, `js-yaml`, `brace-expansion`, 6 Moderate). | Nenhum (Fase 0) | `T-03` (`FAIL` na Auditoria) | `package.json`, `package-lock.json`, saída `npm audit` (`AUDIT_EXIT=1`). Planejado para o Lote 1. |
| `AUD-005` | High | `BLOQUEADO` | Ausência de RBAC no banco e no frontend; `get_user_org_ids()` ignora `organization_members.status = 'inactive'`; `Sidebar.tsx:301` exibe badge fixo `"Admin"`. | Nenhum (Fase 0) | `T-08` (Auditoria); testes Lote 0 bloqueados | Definição live de `get_user_org_ids()`, `src/app/team/page.tsx:28`, `src/components/Sidebar.tsx:301`. Aguarda staging + confirmação de papéis RBAC + aprovação Lote 0. |
| `AUD-006` | High | `BLOQUEADO` | `executeStepIA` atualiza `semen_batch_id` antes de comparar `isNewBatch`; `executeBatchLotManagementIA` omite `farm_id`/`start_date` (`NOT NULL`) em `animal_managements`, silencia erros e não usa transação. | Nenhum (Fase 0) | `T-10`, `T-12` (Auditoria); testes Lote 2 bloqueados | `src/lib/db.ts:7831-7865`, `db.ts:9247-9280`; live DB com `1.204` `iatf_lot_animals` sem `animal_managements`. Requer investigação dos demais `executeBatchLotManagement*` + staging. |
| `AUD-007` | High | `BLOQUEADO` | Estoque legado (`semen_batches`) negativo em 4 partidas (`-511`, `-52`, `-5`, `-1`), diferença de `405` doses vs criogênico, chave idempotente com `Date.now()`, descarte de erro da RPC e `deleteLot` sem estorno criogênico. | Nenhum (Fase 0) | `T-10`, `T-12` (Auditoria); testes Lote 2 bloqueados | `src/lib/db.ts:7767-7769`, `db.ts:5350-5436`, `geneticInventoryService.ts:760-770`, SQL agregado live. Requer relatório diagnóstico prévio + staging. |
| `AUD-008` | High | `BLOQUEADO` | `SyncEngine` injeta `organization_id` em `iatf_lot_animals`, usa `.upsert()` parcial sobre colunas `NOT NULL`, consulta `reproductive_seasons.eq('farm_id', ...)`, usa colunas inexistentes em `recordOfflineManagement`, não enfileira baixa de sêmen e faz retry infinito. | Nenhum (Fase 0) | `T-12` (Auditoria); testes Lote 3 bloqueados | `src/lib/offline/syncEngine.ts:160-162,240-277,632-634,985-1036`, `db.ts:9119-9121`. Aguarda staging (Lote 3). |
| `AUD-009` | High | `BLOQUEADO` | Trigger `on_auth_user_created` (`handle_new_user_onboarding`) cria org/fazenda/admin extra antes da associação em `create_team_member_user`; `getCurrentOrgId()` sem `ORDER BY` e com fallback para `organizations.limit(1)`. | Nenhum (Fase 0) | `T-12` (Auditoria); testes Lote 2 bloqueados | `pg_trigger` live (`on_auth_user_created`), `src/lib/db.ts:151-189`. Aguarda staging + conclusão do Lote 0 (`AUD-001`). |
| `AUD-010` | High | `BLOQUEADO` | `fn_process_genetic_reversal` não possui ramo para `TRANSFER_OUT`/`TRANSFER_IN`, gravando `REVERSAL` no ledger sem reverter saldos de origem/destino. | Nenhum (Fase 0) | `T-12` (Auditoria); testes Lote 2 bloqueados | Definição live de `fn_process_genetic_reversal` e `007_genetic_inventory_module.sql:762-799`. Aguarda staging (Lote 2). |
| `AUD-011` | High | `BLOQUEADO` | Drift severo: `list_migrations` registra 8 migrations vs 11 arquivos diferentes no Git; `input_losses`, triggers e `tenant_*` foram aplicados fora de `supabase/migrations/`. | Nenhum (Fase 0) | `T-11` (`FAIL` na Auditoria) | `list_migrations` MCP vs `supabase/migrations/`. Requer extração schema-only para staging e reconciliação no Lote 4. |
| `AUD-012` | Medium | `PENDENTE` | Logout em `Sidebar.tsx` não limpa `localStorage` offline, IndexedDB nem caches HTML do `sw.js`; `AppShell.tsx:51` força logout ao abrir nova aba via `sessionStorage`. | Nenhum (Fase 0) | `T-12`, `T-13` (Auditoria) | `src/components/Sidebar.tsx:111-120`, `src/components/AppShell.tsx:38-65`, `public/sw.js`. Planejado para Lote 1 (validação dinâmica depende de staging). |
| `AUD-013` | Medium | `PENDENTE` | Rota `/import` exibe análise e importação simuladas via `setTimeout` e dados estáticos sem parser nem escrita real no banco. | Nenhum (Fase 0) | `T-13` (`FAIL` na Auditoria) | `src/app/import/page.tsx:6-135`, `src/components/Sidebar.tsx:63`. Planejado para Lote 4 (aguarda decisão ocultar vs implementar). |
| `AUD-014` | Medium | `BLOQUEADO` | 14 funções com `search_path` mutável, `GRANT ALL` (incl. `TRUNCATE`, `TRIGGER`) para `anon`/`authenticated`, Leaked Password Protection desativada e ausência de headers HTTP de segurança em `next.config.mjs`. | Nenhum (Fase 0) | `T-05`, `T-08` (Auditoria); testes Lote 0 bloqueados | `get_advisors(security)`, `role_table_grants`, `next.config.mjs`. Aguarda staging + aprovação Lote 0. |
| `AUD-015` | Medium | `BLOQUEADO` | `2` `management_events` órfãos, `2` códigos de lote duplicados sem `UNIQUE`, `genetic_audit_logs` com `0` linhas e trava `validateMainFarmSemenLock` baseada em `%principal%`, fail-open e ausente no DB/`updateTank`/`processReversal`. | Nenhum (Fase 0) | `T-10`, `T-12` (Auditoria); testes Lote 2 bloqueados | SQL live + `geneticInventoryService.ts:260-287,360,907`. Requer diagnóstico prévio + staging (Lote 2). |
| `AUD-016` | Medium | `BLOQUEADO` | 62 FKs sem índice, 1 `auth_rls_initplan` em `organization_members`, 1 `unused_index` e `SyncStatusBadge` disparando 15 queries paralelas com `limit(5000)` no mount. | Nenhum (Fase 0) | `T-06` (`FAIL` na Auditoria) | `get_advisors(performance)`, `SyncStatusBadge.tsx:37-41`, `syncEngine.ts:308-340`. Planejado para Lote 4 (depende de staging e Lote 3). |
| `AUD-017` | Medium | `PENDENTE` | `generatePassword()` em `team/page.tsx:55` usa `Math.random()`; ausência de validação de schema server-side e rate limit customizado. | Nenhum (Fase 0) | `T-12` (Auditoria) | `src/app/team/page.tsx:50-59`. Planejado para Lote 1. |
| `AUD-018` | Low | `PENDENTE` | `dateUtils.ts:9` fixa `America/Sao_Paulo` vs `America/Cuiaba` na doc; 2 warnings ESLint `react-hooks/exhaustive-deps` + aviso de depreciação de `next lint`. | Nenhum (Fase 0) | `T-02` (Auditoria) | `src/lib/dateUtils.ts:9`, `lots/page.tsx:763`, `AnimalGeneticLookupModal.tsx:46`. Planejado para Lote 4 (aguarda decisão de fuso). |
| `AUD-019` | Low | `PENDENTE` | Ausência de `error.tsx`/`not-found.tsx`/`loading.tsx`, zoom bloqueado (`userScalable: false`), arquivos/variáveis não utilizados (`mockData.ts`, `supabase/server.ts`, `Navigation.tsx`, `NEXT_PUBLIC_ORG_ID`). | Nenhum (Fase 0) | `T-13` (Auditoria) | `src/app/layout.tsx:28-34`, scan de referências em `src/`. Planejado para Lote 4. |
| `AUD-020` | Informational | `PENDENTE` | Ausência de suíte de testes automatizados, CI/CD, ambiente staging/branches Supabase e documentação de backup/restore. | Nenhum (Fase 0) | `T-18` (`NOT RUN`) | Ausência de arquivos `*test*`/`*spec*`, `.github/workflows` e `list_branches = []`. Planejado para Lote 4 (parcialmente em staging no Gate 0). |
| `AUD-021` | Informational | `PENDENTE` | Fallback hardcoded nominal de veterinário em `lots/page.tsx:773`, supressão `no-explicit-any` em `geneticInventoryService.ts:261` e fallback de ID via `Math.random()` em `db.ts:8635`. | Nenhum (Fase 0) | `T-12` (Auditoria) | `src/app/lots/page.tsx:773`, `geneticInventoryService.ts:261`, `db.ts:8635`. Planejado para Lote 4. |

---

## Achados Complementares (`NEW-001` em diante)

*Nenhum novo achado complementar registrado durante a Fase 0.*
