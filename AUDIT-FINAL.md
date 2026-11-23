# Relatório de Auditoria Técnica — Sistema IATF Master

## 1. Identificação
- **Projeto:** `iatf-app` (`IATF Master`) — `f:\IATF`
- **Repositório / branch:** `https://github.com/Samoo1234/IATF.git` — branch `main` (`origin/main`), working tree limpo antes da geração deste relatório
- **Data:** `2026-11-22`
- **Responsável pela execução:** Auditoria automatizada (Antigravity — MODO A: Discovery e Auditoria)
- **Ambiente examinado:** Código-fonte local (`f:\IATF`, Node.js `v22.16.0`, npm `10.9.2`) + banco de dados **Supabase Cloud remoto "IATF"** (PostgreSQL `17.6.1.155`, região `us-west-2`, status `ACTIVE_HEALTHY`, sem branches de staging — `list_branches = []`, sem Edge Functions — `list_edge_functions = []`, sem Storage Buckets) — classificado como **ambiente operacional/produção ativo** (2 organizações, 2 usuários `auth.users`, 14 fazendas ativas, 16 propriedades, 1.870 matrizes, 45 lotes IATF, 1.966 vínculos `iatf_lot_animals`, 906 `animal_managements`, 173 `management_events`, 75 `semen_batches`, 6 botijões, 44 canecas, 76 saldos e 670 movimentações genéticas).
- **Versão/commit:** `fbbd651`
- **Skill utilizada:** [`full-system-audit`](file:///f:/IATF/.agent/skills/full-system-audit/SKILL.md)

---

## 2. Resumo executivo
- **Resultado geral:** **NÃO PRONTO PARA PRODUÇÃO MULTI-TENANT / EXPOSIÇÃO PÚBLICA** — o sistema apresenta operação funcional básica, porém possui **4 achados Críticos**, **7 Altos**, **6 Médios**, **2 Baixos** e **2 Informativos** (total: **21 achados**).
- **Riscos críticos:**
  1. [`AUD-001`](#aud-001--execução-anônima-da-rpc-security-definer-create_team_member_user-account-takeover-e-criação-arbitrária-de-administradores): RPC `SECURITY DEFINER` `create_team_member_user` executável pelo papel `anon` (sem autenticação), permitindo criar novos administradores em qualquer organização ou sobrescrever a senha de qualquer usuário existente em `auth.users` (*account takeover* completo).
  2. [`AUD-002`](#aud-002--escalação-de-privilégios-e-invasão-cross-tenant-via-política-tenant_org_members-em-organization_members--auto-cadastro-aberto): Política RLS `tenant_org_members` em `organization_members` permite `INSERT`/`UPDATE` quando `user_id = auth.uid()`, possibilitando que qualquer usuário (inclusive via auto-cadastro aberto em `/login`) se associe como `admin` a qualquer organização.
  3. [`AUD-003`](#aud-003--13-tabelas-com-rls-aberta-using-true-2-views-security-definer-e-12-demais-rpcs-security-definer-expostas-a-anon): **13 tabelas** no schema `public` possuem política RLS permissiva (`USING (true) WITH CHECK (true)` para `{public}`/`anon`), **2 views** `SECURITY DEFINER` (`lot_stats`, `organization_metrics`) acessíveis a `anon` contornam RLS e outras **12 funções** `SECURITY DEFINER` podem ser executadas por `anon` sem verificação de `auth.uid()` ou tenant.
  4. [`AUD-004`](#aud-004--vulnerabilidades-conhecidas-em-dependências-1-critical-em-next-6-high-incluindo-xlsx-sem-correção-oficial): `npm audit` reportou **13 vulnerabilidades** (1 Critical em `next@15.5.23`, 6 High incluindo `xlsx@0.18.5` sem correção oficial, `postcss`, `sharp`, `source-map-js`, `js-yaml`, `brace-expansion`, e 6 Moderate).
- **Principais bloqueios:** Todos os testes dinâmicos autenticados no navegador (`T-14`), testes ativos de autorização/API/PostgREST (`T-15`) e testes ponta a ponta com escrita (`T-16`) estão classificados como **`BLOCKED`** porque o único banco Supabase disponível é o ambiente operacional remoto ativo (`list_branches = []`, sem Supabase CLI/local, sem staging e sem credenciais sintéticas).
- **Áreas não examinadas:** Execução E2E autenticada com escrita, testes dinâmicos de UI/console/responsividade em runtime, configuração de hosting/DNS/CDN/HTTPS (não versionada no repositório) e política de backup/restore/PITR gerenciada pelo painel do Supabase (não exposta via MCP).

---

## 3. Escopo e limitações

| Área | Incluída? | Ambiente/acesso | Limitação |
|---|---|---|---|
| Frontend | Parcial | Código-fonte local (`f:\IATF`) + `tsc` + `eslint` | Análise estática completa de rotas/componentes/PWA/contextos; testes dinâmicos autenticados no navegador `BLOCKED` pelo risco de acionar `SyncEngine` e gravar dados no banco operacional remoto. |
| Backend/API | Parcial | Código-fonte (`src/middleware.ts`, `src/lib/*`) + inspeção live das RPCs via Supabase MCP | Não há API Routes nem Server Actions no projeto; testes ativos de escrita/abuso via PostgREST/RPC marcados como `BLOCKED` para proteger o ambiente ativo. |
| Banco de dados | Sim (somente leitura) | `supabase/migrations/` + Supabase MCP (`list_tables`, `list_migrations`, `list_extensions`, `get_advisors`, consultas agregadas read-only em `pg_catalog`/métricas) | Nenhuma escrita, migration, reset ou exportação de dados pessoais realizada; backup/restore/PITR não inspecionáveis via MCP. |
| Autenticação/autorização | Parcial | `src/middleware.ts`, `src/components/AppShell.tsx`, `src/app/login/page.tsx`, `src/app/team/page.tsx` + `pg_policies`/`pg_proc`/`auth.users` count | Sem criação/uso de contas de teste sintéticas em produção; avaliação por inspeção de código e definições SQL live. |
| Integrações | Sim (estático + MCP) | Código-fonte + `.env.example`/`.env.local` (somente nomes de variáveis) + `list_edge_functions` | Projeto utiliza exclusivamente Supabase Cloud (sem pagamentos, e-mail, WhatsApp, webhooks, storage ou Edge Functions). |
| Segurança | Parcial | Revisão OWASP ASVS/Top 10 sobre código + `npm audit` + `get_advisors(security)` + `role_table_grants` | Sem pentest ativo, fuzzing ou testes destrutivos contra o endpoint remoto. |
| Performance/confiabilidade | Parcial | `get_advisors(performance)` + `get_advisors(health)` + `query_logs` (contagem agregada) + análise de código | Sem testes de carga contra produção e sem medição de bundle/Core Web Vitals em runtime (`next build` não executado para preservar `.next/`). |
| Fluxos ponta a ponta | Mapeado (execução bloqueada) | Fluxos críticos mapeados em código (`D0→D9→IA→DG`, estoque genético, offline→sync, equipe) | Execução ponta a ponta com mutações `BLOCKED` pela ausência de ambiente staging/branch isolado. |

---

## 4. Arquitetura e inventário

### 4.1. Stack e versões efetivas
Confirmado via [package.json](file:///f:/IATF/package.json) e `package-lock.json`:
- **Framework Web:** `next@15.5.23` (App Router, `reactStrictMode: true` em [next.config.mjs](file:///f:/IATF/next.config.mjs))
- **UI & Linguagem:** `react@19.2.8`, `react-dom@19.2.8`, `typescript@5.9.3` (`strict: true` em [tsconfig.json](file:///f:/IATF/tsconfig.json))
- **Estilização & Ícones:** `tailwindcss@4.3.3`, `@tailwindcss/postcss@^4.0.6`, `clsx@^2.1.1`, `tailwind-merge@^3.0.1`, `lucide-react@^0.475.0`
- **Backend Client & Auth SSR:** `@supabase/supabase-js@2.112.3`, `@supabase/ssr@0.5.2`
- **Persistência Offline / PWA:** `dexie@4.4.6` (IndexedDB), Service Worker customizado ([sw.js](file:///f:/IATF/public/sw.js)), Manifesto PWA ([manifest.json](file:///f:/IATF/public/manifest.json))
- **Gráficos e Exportação:** `recharts@2.15.4`, `xlsx@0.18.5` (SheetJS — uso exclusivamente client-side)
- **Linting:** `eslint@9.39.5` + `eslint-config-next@^15.1.7` ([eslint.config.mjs](file:///f:/IATF/eslint.config.mjs))

### 4.2. Arquitetura real vs. documentação
```text
[ Navegador / PWA (Next.js 15 App Router — 100% Client Components) ]
   ├── Middleware (src/middleware.ts) ──► Valida cookie sb-*-auth-token + supabase.auth.getUser()
   ├── RootLayout (src/app/layout.tsx) + AppShell (src/components/AppShell.tsx)
   │      ├── ThemeProvider / FarmProvider / SeasonProvider
   │      └── Gate de sessão client-side (sessionStorage + localStorage)
   ├── Service Worker (public/sw.js) ──► Network-First (navegação) / SWR (assets); ignora supabase.co
   ├── Camada de Domínio & Dados Client-Side
   │      ├── src/lib/db.ts (~10.187 linhas, ~90 funções + queryCache em memória TTL 3–5 min)
   │      ├── src/lib/services/geneticInventoryService.ts (~1.288 linhas, ~22 funções)
   │      └── src/lib/offline/ (offlineDb.ts Dexie v5 [19 stores] + syncEngine.ts [~1.209 linhas])
   └── Exportação local: xlsx (.xlsx) + window.print()
                         │
                         ▼ (HTTPS direto do navegador via NEXT_PUBLIC_SUPABASE_ANON_KEY + JWT)
[ Supabase Cloud Remoto "IATF" (PostgreSQL 17.6.1.155 + GoTrue Auth + PostgREST) ]
   ├── 29 tabelas em public (todas com RLS habilitado, mas 13 abertas para public/anon)
   ├── 2 views (lot_stats, organization_metrics — SECURITY DEFINER por padrão)
   ├── 14 funções em public (13 SECURITY DEFINER executáveis por anon e authenticated)
   ├── 2 triggers em public.iatf_lot_animals + 1 trigger em auth.users + 1 event trigger ensure_rls
   └── 0 Edge Functions / 0 Branches / 0 Storage Buckets
```

**Divergência arquitetural principal:** [API_ARCHITECTURE.md](file:///f:/IATF/API_ARCHITECTURE.md), [USER_ROLES.md](file:///f:/IATF/USER_ROLES.md) e [RLS_POLICIES.md](file:///f:/IATF/RLS_POLICIES.md) descrevem Server Components, Server Actions com validação Zod e RBAC com 7 papéis. Na prática, o sistema possui **0 API Routes (`src/app/api/*`)**, **0 Server Actions (`'use server'`)**, **0 dependências de validação (`zod`)**, e todas as 13 páginas são `'use client'` chamando o Supabase diretamente do navegador.

### 4.3. Inventário Frontend (`src/app/` e `src/components/`)
- **Entry points & shell:** [layout.tsx](file:///f:/IATF/src/app/layout.tsx), [AppShell.tsx](file:///f:/IATF/src/components/AppShell.tsx), [middleware.ts](file:///f:/IATF/src/middleware.ts), [Sidebar.tsx](file:///f:/IATF/src/components/Sidebar.tsx), [Header.tsx](file:///f:/IATF/src/components/Header.tsx), [PWARegistration.tsx](file:///f:/IATF/src/components/PWARegistration.tsx), [PWAInstallPrompt.tsx](file:///f:/IATF/src/components/PWAInstallPrompt.tsx), [SyncStatusBadge.tsx](file:///f:/IATF/src/components/offline/SyncStatusBadge.tsx), [CurralPrepModal.tsx](file:///f:/IATF/src/components/offline/CurralPrepModal.tsx).
- **13 rotas identificadas (todas `'use client'`):**
  1. `/` ([page.tsx](file:///f:/IATF/src/app/page.tsx)): Dashboard operacional (escopo por fazenda ou consolidado).
  2. `/login` ([login/page.tsx](file:///f:/IATF/src/app/login/page.tsx)): Autenticação e auto-cadastro aberto (`signInWithPassword` / `signUp`).
  3. `/registries` ([registries/page.tsx](file:///f:/IATF/src/app/registries/page.tsx)): Cadastros de Fazendas/Retiros (incl. congelamento), Matrizes, Touros/Centrais, Raças/Categorias, Estações e Veterinários.
  4. `/agenda` ([agenda/page.tsx](file:///f:/IATF/src/app/agenda/page.tsx)): Agenda de manejos de lote e eventos avulsos por fazenda.
  5. `/lots` ([lots/page.tsx](file:///f:/IATF/src/app/lots/page.tsx)): Gestão de lotes IATF, troca de protocolo/duração, ressincronização, manejo individual/coletivo ([BatchLotManagementModal.tsx](file:///f:/IATF/src/components/BatchLotManagementModal.tsx)) e checklist por fase.
  6. `/animals` ([animals/page.tsx](file:///f:/IATF/src/app/animals/page.tsx)): Busca paginada de matrizes e histórico.
  7. `/animals/[id]` ([animals/[id]/page.tsx](file:///f:/IATF/src/app/animals/%5Bid%5D/page.tsx)): Ficha individual, edição/inativação/exclusão e [AnimalManagementModal.tsx](file:///f:/IATF/src/components/AnimalManagementModal.tsx).
  8. `/protocols` ([protocols/page.tsx](file:///f:/IATF/src/app/protocols/page.tsx)): Protocolos hormonais e etapas.
  9. `/estoque-semen` ([estoque-semen/page.tsx](file:///f:/IATF/src/app/estoque-semen/page.tsx)) + 11 componentes em `src/components/genetic-inventory/`: Estoque criogênico (botijões, canecas, N₂, saldos, movimentações, clientes em custódia, livro razão, comprovantes, relatórios e busca rápida).
  10. `/inputs` ([inputs/page.tsx](file:///f:/IATF/src/app/inputs/page.tsx)): Redirecionamento client-side para `/estoque-semen`.
  11. `/reports` ([reports/page.tsx](file:///f:/IATF/src/app/reports/page.tsx)): Relatórios gerenciais, gráficos Recharts, exportação `.xlsx` e impressão (`window.print()`).
  12. `/import` ([import/page.tsx](file:///f:/IATF/src/app/import/page.tsx)): Interface simulada (`setTimeout` + dados hardcoded), sem parser `.xlsx` real.
  13. `/team` ([team/page.tsx](file:///f:/IATF/src/app/team/page.tsx)): Cadastro de equipe via RPC e alteração de cargo/status.
- **Arquivos sem importações ativas em `src/`:** [mockData.ts](file:///f:/IATF/src/lib/mockData.ts), [server.ts](file:///f:/IATF/src/lib/supabase/server.ts), [Navigation.tsx](file:///f:/IATF/src/components/Navigation.tsx).
- **Error Boundaries / rotas especiais:** Ausentes (`0` arquivos `error.tsx`, `global-error.tsx`, `loading.tsx`, `not-found.tsx`).

### 4.4. Inventário de Banco de Dados Live (via Supabase MCP)
- **29 tabelas em `public` (todas com `rls_enabled = true`, `rls_forced = false`):**
  - **16 tabelas com política multi-tenant (`tenant_*` via `get_user_org_ids()`):** `organizations` (2), `organization_members` (2), `farms` (14), `properties` (16), `breeds` (18), `animal_categories` (8), `animals` (1.870), `bulls` (39), `semen_batches` (75), `protocols` (6), `protocol_steps` (25), `reproductive_seasons` (3), `iatf_lots` (45), `iatf_lot_animals` (1.966), `management_events` (173), `input_losses` (0).
  - **13 tabelas com política aberta (`USING (true) WITH CHECK (true)` para `{public}`/`anon`):** `animal_managements` (906), `veterinarians` (2), `genetic_centers` (12), `genetic_clients` (9), `semen_tanks` (6), `semen_tank_canisters` (44), `tank_nitrogen_measurements` (0), `genetic_materials` (75), `genetic_material_batches` (75), `genetic_inventory_movements` (670), `genetic_inventory_balances` (76), `genetic_withdrawal_receipts` (4), `genetic_audit_logs` (0).
- **2 Views (`public`):** `lot_stats`, `organization_metrics` (sem `security_invoker = true`, `SELECT` concedido a `anon` e `authenticated`).
- **14 Funções em `public` (todas com `EXECUTE` concedido a `anon` e `authenticated`, exceto onde revogado — nenhuma teve `anon` revogado):**
  - 13 `SECURITY DEFINER`: `create_team_member_user`, `freeze_farm`, `unfreeze_farm`, `get_user_org_ids`, `handle_new_user_onboarding`, `rls_auto_enable` (única com `SET search_path TO 'pg_catalog'`), `fn_process_genetic_inbound`, `fn_process_genetic_outbound`, `fn_process_genetic_transfer`, `fn_process_genetic_usage_iatf`, `fn_process_genetic_adjustment`, `fn_process_genetic_reversal`, `fn_record_nitrogen_measurement`.
  - 2 funções de trigger (`SECURITY INVOKER`): `fn_calculate_expected_parturition`, `fn_handle_semen_batch_usage`.
- **Triggers:** `trg_calculate_expected_parturition` e `trg_handle_semen_batch_usage` em `public.iatf_lot_animals`; `on_auth_user_created` em `auth.users` (`handle_new_user_onboarding()`); event trigger `ensure_rls` (`rls_auto_enable()`).
- **Migrations:** 8 registradas no banco (`list_migrations`) vs. 11 arquivos em `supabase/migrations/`.
- **Logs (últimas 24h via `query_logs`):** 83 `edge_logs`, 14 `auth_logs`, 13 `postgres_logs`, 1 `auth_audit_logs`.

### 4.5. Integrações, Variáveis de Ambiente e Testes
- **Provedores externos:** Exclusivamente Supabase Cloud (`Auth` + `PostgreSQL` + `PostgREST`).
- **Variáveis de ambiente (apenas nomes; valores omitidos):** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_ORG_ID` (definida em [`.env.example`](file:///f:/IATF/.env.example) e `.env.local`, porém não referenciada em `src/`).
- **Testes automatizados / CI/CD:** **0** arquivos de teste, **0** scripts de teste no `package.json`, **0** arquivos de CI/CD ou deploy no repositório.

---

## 5. Matriz de testes

| ID | Área | Teste | Resultado esperado | Status real | Evidência |
|---|---|---|---|---|---|
| `T-01` | Estático / Tipagem | `npx tsc --noEmit --incremental false` | Compilação TypeScript estrita sem erros | `PASS` | `TSC_EXIT=0`, 0 erros reportados |
| `T-02` | Estático / Lint | `npm run lint` (`next lint`) | Sem erros de lint | `PASS` | `LINT_EXIT=0`; 2 warnings `react-hooks/exhaustive-deps` (`lots/page.tsx:763`, `AnimalGeneticLookupModal.tsx:46`) e aviso de depreciação de `next lint` |
| `T-03` | Dependências | `npm audit` | 0 vulnerabilidades críticas/altas | `FAIL` | `AUDIT_EXIT=1`; 13 vulnerabilidades (1 critical `next`, 6 high incl. `xlsx`/`postcss`/`sharp`/`source-map-js`/`js-yaml`/`brace-expansion`, 6 moderate `minimatch`/`@typescript-eslint/*`) |
| `T-04` | Build de produção | `npm run build` | Build Next.js concluído sem erro | `NOT RUN` | Não executado para preservar `.next/` intacto durante auditoria read-only |
| `T-05` | Banco / Segurança | Supabase MCP `get_advisors(security)` | Zero erros ou alertas críticos | `FAIL` | 2 `ERROR` (`security_definer_view`), 14 `WARN` (`function_search_path_mutable`), 13 `WARN` (`anon_security_definer_function_executable`), 13 `WARN` (`authenticated_security_definer_function_executable`), 1 `WARN` (`auth_leaked_password_protection`) |
| `T-06` | Banco / Performance | Supabase MCP `get_advisors(performance)` | Índices adequados e RLS otimizado | `FAIL` | 62 `unindexed_foreign_keys` (`INFO`), 1 `auth_rls_initplan` (`WARN` em `organization_members`), 1 `unused_index` (`idx_gen_mov_transfer`) |
| `T-07` | Banco / Saúde | Supabase MCP `get_advisors(health)` | Projeto saudável | `PASS` | `lints: []`, projeto `ACTIVE_HEALTHY` |
| `T-08` | Banco / RLS & Grants | Inspeção `pg_policies`, `role_table_grants` e `pg_proc` | Isolamento multi-tenant, RBAC e menor privilégio | `FAIL` | 13 tabelas com `USING (true)` para `{public}`, `tenant_org_members` permite self-join, `anon`/`authenticated` com `ALL` incl. `TRUNCATE`/`TRIGGER` em 29 tabelas e `EXECUTE` em 13 `SECURITY DEFINER` |
| `T-09` | Banco / Ledger Genético | Reconciliação agregada `genetic_inventory_movements` vs `genetic_inventory_balances` | Soma líquida do livro razão igual ao saldo materializado | `PASS` | `accurate_ledger_mismatches: 0`, `genetic_balances_negative: 0` (saldo total 3.859 doses em 76 posições e 670 movimentos) |
| `T-10` | Banco / Integridade | Verificação agregada de inconsistências operacionais live | Zero saldos negativos, zero órfãos e sincronia entre módulos | `FAIL` | `4` `semen_batches` negativos (`-511`, `-52`, `-5`, `-1`), diferença de `405` doses entre `semen_batches` (`3.454`) e `genetic_inventory_balances` (`3.859`), `1.204` `iatf_lot_animals` sem `animal_managements`, `2` `management_events` órfãos, `2` códigos de lote duplicados |
| `T-11` | Banco / Migrations | Comparação `list_migrations` live vs `supabase/migrations/` | Histórico idêntico e reproduzível | `FAIL` | 8 migrations registradas no banco vs 11 arquivos diferentes no Git + objetos/triggers criados fora do diretório de migrations |
| `T-12` | Backend / Domínio | Auditoria estática de `db.ts`, `geneticInventoryService.ts`, `syncEngine.ts`, `middleware.ts`, `AppShell.tsx` | Regras de negócio, idempotência e sync consistentes | `FAIL` | Múltiplos defeitos confirmados (`AUD-006`, `AUD-007`, `AUD-008`, `AUD-009`, `AUD-010`, `AUD-012`) |
| `T-13` | Frontend | Auditoria estática das 13 rotas, formulários, PWA e layout | Implementação completa, segura e acessível | `FAIL` | `/import` simulado (`AUD-013`), zoom bloqueado (`AUD-019`), ausência de Error Boundaries, logout incompleto (`AUD-012`) |
| `T-14` | Frontend (Runtime) | Navegação e testes dinâmicos no navegador (`localhost`) | Rotas, console, rede e responsividade validados | `BLOCKED` | Banco configurado em `.env.local` é o ambiente ativo remoto; montar sessão autenticada dispara `syncDownAllData()` e risco de escrita via `SyncEngine` |
| `T-15` | Backend/API (Runtime) | Testes de IDOR/BOLA, RBAC e abuso de RPCs com contas sintéticas | Isolamento validado por tentativas reais | `BLOCKED` | Sem ambiente staging/dev ou contas sintéticas autorizadas (`list_branches = []`) |
| `T-16` | E2E | Jornadas D0→D9→IA→DG, estoque genético e modo curral offline→sync | Fluxo completo sem perda ou duplicação | `BLOCKED` | Proibido mutar registros no banco operacional remoto |
| `T-17` | Integrações | Webhooks, pagamentos, e-mail, WhatsApp, storage | Resiliência e verificação de assinaturas | `N/A` | Nenhuma integração externa além do Supabase Auth/Postgres |
| `T-18` | Regressão automatizada | Execução de suíte unitária/integração/E2E | Cobertura dos fluxos críticos | `NOT RUN` | Inexistente no projeto (`0` testes automatizados) |

---

## 6. Achados

### AUD-001 — Execução anônima da RPC `SECURITY DEFINER` `create_team_member_user` (Account Takeover e Criação Arbitrária de Administradores)
- **Severidade:** Critical
- **Confiança:** Confirmed
- **Componente:** PostgreSQL RPC `public.create_team_member_user` ([008_team_and_farm_freeze.sql](file:///f:/IATF/supabase/migrations/008_team_and_farm_freeze.sql#L49-L179)) e [db.ts](file:///f:/IATF/src/lib/db.ts#L8546-L8578)
- **Status:** Open
- **Evidência reproduzível:**
  - Consulta via Supabase MCP em `pg_proc` confirmou `security_definer = true`, `anon_exec = true`, `auth_exec = true` para `public.create_team_member_user(p_org_id, p_name, p_email, p_password, p_role)`.
  - Advisor oficial do Supabase (`get_advisors(security)`): alerta [`0028_anon_security_definer_function_executable`](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) reportando exposição em `/rest/v1/rpc/create_team_member_user`.
  - O corpo da função não verifica `auth.uid()`, não exige vínculo ou papel `admin` em `p_org_id`, e quando o e-mail já existe em `auth.users` executa `UPDATE auth.users SET encrypted_password = v_enc_password, ...` (definição live e [008_team_and_farm_freeze.sql](file:///f:/IATF/supabase/migrations/008_team_and_farm_freeze.sql#L81-L90)).
- **Impacto:** Comprometimento total da aplicação: qualquer pessoa na internet com a `NEXT_PUBLIC_SUPABASE_ANON_KEY` (pública no bundle do navegador) pode redefinir a senha de administradores existentes ou criar novos usuários com `role = 'admin'` em qualquer organização.
- **Cenário de falha:** Um atacante não autenticado envia `POST /rest/v1/rpc/create_team_member_user` usando a chave anônima pública, obtém o UUID de organização ou e-mail alvo (por exemplo via `organizations` / `lot_stats` expostos) e assume controle administrativo completo da conta e da organização.
- **Atores/dados afetados:** Todas as contas em `auth.users`, `organization_members` e todas as organizações e dados zootécnicos.
- **Correção recomendada (não aplicada):**
  1. Executar imediatamente `REVOKE ALL ON FUNCTION public.create_team_member_user(...) FROM PUBLIC, anon, authenticated;` e remover criação/atualização direta em `auth.users`/`auth.identities` via SQL exposto ao PostgREST.
  2. Migrar a criação de membros da equipe para uma rota Next.js server-side (`/api/team/members`) ou Supabase Edge Function utilizando `SUPABASE_SERVICE_ROLE_KEY` via `supabase.auth.admin.createUser()`, validando autenticação JWT e confirmando no servidor que o chamador é `admin` ativo da organização; proibir sobrescrita de senha de contas já existentes por essa via.
- **Teste de regressão necessário:** Chamadas a `/rest/v1/rpc/create_team_member_user` com token `anon` ou `authenticated` não-admin devem retornar `401`/`403`; tentativa com e-mail já cadastrado deve falhar sem alterar senha.

---

### AUD-002 — Escalação de privilégios e invasão cross-tenant via política `tenant_org_members` + auto-cadastro aberto
- **Severidade:** Critical
- **Confiança:** Confirmed
- **Componente:** Política RLS `tenant_org_members` em `public.organization_members` (live DB) + auto-cadastro em [login/page.tsx](file:///f:/IATF/src/app/login/page.tsx#L26-L36)
- **Status:** Open
- **Evidência reproduzível:**
  - Consulta live em `pg_policies` retornou para `organization_members`:
    - `policyname`: `tenant_org_members`, `cmd`: `ALL`, `roles`: `{public}`
    - `qual` e `with_check`: `((organization_id IN ( SELECT get_user_org_ids() AS get_user_org_ids)) OR (user_id = auth.uid()))`
  - Em [login/page.tsx](file:///f:/IATF/src/app/login/page.tsx#L26-L36) e [login/page.tsx](file:///f:/IATF/src/app/login/page.tsx#L155-L163), a tela de login oferece o botão público *"Cadastre-se"* chamando `supabase.auth.signUp()`.
- **Impacto:** Quebra completa do isolamento multi-tenant e de RBAC. Qualquer usuário autenticado (inclusive um terceiro que se cadastre sozinho na tela de login) pode inserir uma linha em `organization_members` com `user_id = auth.uid()`, `organization_id = <qualquer_org>` e `role = 'admin'`, passando a integrar `get_user_org_ids()` da organização vítima. Um operador comum também pode promover seu próprio `role` via `UPDATE`.
- **Cenário de falha:** Um atacante cria uma conta via `/login` (recebendo inclusive uma org própria via trigger `on_auth_user_created`), descobre o `organization_id` de outro cliente (ex.: consultando a view `lot_stats` ou tabelas com RLS aberta) e executa `INSERT INTO organization_members (organization_id, user_id, role) VALUES (target_org_id, auth.uid(), 'admin')` via PostgREST — operação autorizada pela cláusula `OR (user_id = auth.uid())` no `WITH CHECK`.
- **Atores/dados afetados:** Todas as organizações (`organizations`), membros (`organization_members`) e todas as tabelas protegidas por `get_user_org_ids()`.
- **Correção recomendada (não aplicada):**
  1. Substituir `tenant_org_members` por políticas separadas por comando (`SELECT` permitindo ver membros da própria org ou próprio registro; `INSERT`/`UPDATE`/`DELETE` restritos estritamente a administradores ativos da `organization_id` usando `(SELECT auth.uid())` e nunca `OR user_id = auth.uid()` no `WITH CHECK`).
  2. Avaliar desativar auto-cadastro aberto no Supabase Auth (*Disable Signups*) se o modelo de operação exigir onboarding controlado por administradores, ou remover a opção *"Cadastre-se"* de `/login` conforme regra de negócio.
- **Teste de regressão necessário:** Usuário autenticado de Org A ou operador tentando `INSERT`/`UPDATE` em `organization_members` para Org B ou alterando seu `role` para `admin` deve receber erro de violação de RLS (`42501`).

---

### AUD-003 — 13 tabelas com RLS aberta (`USING (true)`), 2 views `SECURITY DEFINER` e 12 demais RPCs `SECURITY DEFINER` expostas a `anon`
- **Severidade:** Critical
- **Confiança:** Confirmed
- **Componente:** Banco de dados PostgreSQL (`public.*` policies, views e RPCs; [002_fix_rls_dev_policies.sql](file:///f:/IATF/supabase/migrations/002_fix_rls_dev_policies.sql), [006_animal_managements.sql](file:///f:/IATF/supabase/migrations/006_animal_managements.sql), [007_genetic_inventory_module.sql](file:///f:/IATF/supabase/migrations/007_genetic_inventory_module.sql), [008_team_and_farm_freeze.sql](file:///f:/IATF/supabase/migrations/008_team_and_farm_freeze.sql), [010_fix_dashboard_metrics_and_lot_stats.sql](file:///f:/IATF/supabase/migrations/010_fix_dashboard_metrics_and_lot_stats.sql))
- **Status:** Open
- **Evidência reproduzível:**
  - `pg_policies` live mostra 13 tabelas com `qual = 'true'` e `with_check = 'true'` para `roles = {public}` (`cmd = ALL`), incluindo tabelas com 906 manejos (`animal_managements`), dados pessoais/fiscais de clientes e veterinários (`genetic_clients` com telefone/documento/e-mail, `veterinarians` com CRMV/telefone/e-mail), 670 movimentações (`genetic_inventory_movements`) e `genetic_withdrawal_receipts` (documento do recebedor).
  - `get_advisors(security)` reporta **2 ERROR** [`0010_security_definer_view`](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view) para `public.lot_stats` e `public.organization_metrics`; ambas possuem `SELECT` concedido a `anon` (`anon_sel = true`), expondo dados de todas as organizações sem autenticação.
  - `get_advisors(security)` + `pg_proc` confirmam **13 funções `SECURITY DEFINER`** executáveis por `anon` ([`0028_anon_security_definer_function_executable`](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) e [`0029_authenticated_security_definer_function_executable`](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)). Nenhuma das RPCs de negócio (`fn_process_genetic_*`, `fn_record_nitrogen_measurement`, `freeze_farm`, `unfreeze_farm`) valida `auth.uid()` nem se o usuário pertence a `p_organization_id` ou se `p_farm_id` pertence a `p_organization_id`.
- **Impacto:** Qualquer usuário anônimo na internet pode ler, alterar ou apagar registros nas 13 tabelas abertas, consultar métricas/lotes de todas as organizações via `lot_stats`/`organization_metrics` e executar congelamento de fazendas ou movimentações/estornos de sêmen de qualquer tenant via RPC.
- **Cenário de falha:** Requisições HTTP diretas ao endpoint PostgREST (`/rest/v1/animal_managements`, `/rest/v1/genetic_clients`, `/rest/v1/lot_stats`, `/rest/v1/rpc/freeze_farm`, `/rest/v1/rpc/fn_process_genetic_outbound`) apenas com o header `apikey: <NEXT_PUBLIC_SUPABASE_ANON_KEY>` executam com sucesso sem cookie/JWT de sessão.
- **Atores/dados afetados:** Todas as organizações, clientes em custódia, veterinários, fazendas, histórico reprodutivo e estoque criogênico.
- **Correção recomendada (não aplicada):**
  1. Substituir imediatamente as 13 políticas `*_dev_policy` / `"Dev full access..."` por políticas `TO authenticated` filtrando `organization_id IN (SELECT public.get_user_org_ids())`.
  2. Alterar `lot_stats` e `organization_metrics` com `ALTER VIEW ... SET (security_invoker = true);` e revogar `SELECT` de `anon`.
  3. Revogar `EXECUTE` de `anon` em todas as RPCs operacionais/administrativas (`REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon; GRANT EXECUTE ON FUNCTION ... TO authenticated;`).
  4. Dentro de cada RPC `SECURITY DEFINER`, validar `auth.uid() IS NOT NULL`, que `p_organization_id IN (SELECT public.get_user_org_ids())` e que `p_farm_id`/`p_tank_id`/`p_movement_id` pertencem a `p_organization_id`.
- **Teste de regressão necessário:** Requisições com chave `anon` (sem JWT) para qualquer tabela, view ou RPC devem retornar `0` linhas ou `401`/`403`; usuário da Org A chamando RPC ou consultando view com IDs da Org B deve receber erro/vazio.

---

### AUD-004 — Vulnerabilidades conhecidas em dependências (`1` Critical em `next`, `6` High incluindo `xlsx` sem correção oficial)
- **Severidade:** Critical
- **Confiança:** Confirmed
- **Componente:** [package.json](file:///f:/IATF/package.json) e `package-lock.json`
- **Status:** Open
- **Evidência reproduzível:** Execução de `npm audit` (`AUDIT_EXIT=1`) retornou **13 vulnerabilidades (6 moderate, 6 high, 1 critical)**:
  - `next@15.5.23` (`next <=16.3.0-preview.10`): **Critical** — inclui advisories como `GHSA-p293-qw3h-jr36` (RCE em servidores hospedados em Windows), `GHSA-2xp9-vwfh-vxw4` / `GHSA-2464-fhr4-w9xw` (Image Optimization), `GHSA-4jqv-mc3x-m676` / `GHSA-mcj8-r9mp-w47p` (cache poisoning SSG/ISR), `GHSA-f3mh-rxg3-f5g2` (exposição de cookie HttpOnly em Edge runtime), `GHSA-pc58-hwjq-p385`, `GHSA-p3m5-59mp-jv5r`, `GHSA-7qx7-33qx-rqx2`.
  - `xlsx@0.18.5` (`*`): **High** — *Prototype Pollution* (`GHSA-4r6h-8v6p-xvw6`) e *ReDoS* (`GHSA-5pgg-2g8v-p4x9`), marcado como **"No fix available"** no registro npm.
  - Transitivas **High**: `postcss`, `sharp`, `source-map-js`, `js-yaml`, `brace-expansion`.
  - Transitivas **Moderate**: `minimatch` e `@typescript-eslint/*` (ferramentas de dev/lint).
- **Impacto:** Risco crítico caso o servidor Next.js seja exposto em produção na versão atual (especialmente em ambiente Windows ou usando Edge middleware/Image Optimization), além de risco de Prototype Pollution/DoS caso `xlsx@0.18.5` venha a processar planilhas de entrada (como na futura implementação de `/import`).
- **Cenário de falha:** Exploração remota de endpoint Next.js vulnerável na versão `15.5.23` ou travamento/poluição de protótipo no navegador ao parsear arquivo `.xlsx` malicioso.
- **Atores/dados afetados:** Runtime da aplicação web (servidor Next.js) e navegadores de usuários que exportam/importam planilhas.
- **Correção recomendada (não aplicada):**
  1. Atualizar `next`, `eslint-config-next`, `postcss`, `sharp` e dependências transitivas após avaliação de breaking changes (validar compatibilidade com React 19 e Tailwind 4).
  2. Substituir `xlsx` (SheetJS comunitário sem correção no npm) por alternativa mantida (ex.: `exceljs` com validação estrita de input) antes de habilitar upload/leitura de planilhas em `/import`.
- **Teste de regressão necessário:** `npm audit --omit=dev --audit-level=high` deve encerrar com código `0` após atualizações e substituição de `xlsx`; fluxos de exportação em `/reports` e `/estoque-semen` devem continuar gerando arquivos válidos.

---

### AUD-005 — Ausência total de RBAC (banco e frontend) e inativação ineficaz de usuários (`get_user_org_ids()` ignora `status`)
- **Severidade:** High
- **Confiança:** Confirmed
- **Componente:** `public.get_user_org_ids()` (live DB), `organization_members.status`, [team/page.tsx](file:///f:/IATF/src/app/team/page.tsx), [Sidebar.tsx](file:///f:/IATF/src/components/Sidebar.tsx#L301), [db.ts](file:///f:/IATF/src/lib/db.ts#L8580-L8596) e todas as páginas em `src/app/`
- **Status:** Open
- **Evidência reproduzível:**
  - Definição live de `public.get_user_org_ids()`:
    ```sql
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid();
    ```
    Não há filtro `AND status = 'active'`.
  - Nenhuma política RLS nem nenhuma RPC verifica `role` (`admin`, `veterinarian`, `operator` etc.).
  - Em `src/`, nenhuma rota ou função de [db.ts](file:///f:/IATF/src/lib/db.ts) ou [geneticInventoryService.ts](file:///f:/IATF/src/lib/services/geneticInventoryService.ts) consulta o `role` ou `status` do usuário logado. Inclusive [Sidebar.tsx](file:///f:/IATF/src/components/Sidebar.tsx#L301) exibe o rótulo estático `"Admin"` para qualquer usuário autenticado, e `USER_ROLES.md` define 7 perfis (`admin`, `manager`, `vet`, `tech`, `inseminator`, `operator`, `viewer`) enquanto [team/page.tsx](file:///f:/IATF/src/app/team/page.tsx#L28) cria apenas `admin`, `veterinarian` e `operator`.
- **Impacto:**
  1. Um usuário inativado na tela `/team` (`status = 'inactive'`) continua autenticando no Supabase Auth e mantendo acesso total de leitura e escrita a toda a organização via RLS e PostgREST.
  2. Um colaborador cadastrado como `operator` possui exatamente os mesmos poderes de um `admin` ou `veterinarian`: pode excluir matrizes/lotes, congelar fazendas, estornar estoque genético e gerenciar equipe/senhas.
- **Cenário de falha:** Administrador clica em *"Inativar"* em `/team` esperando bloquear o acesso de um ex-colaborador; como o Auth não foi bloqueado (`ban_duration`) e `get_user_org_ids()` não checa `status = 'active'`, o ex-colaborador continua entrando e editando dados normalmente.
- **Atores/dados afetados:** Todos os perfis de usuário e integridade administrativa de cada organização.
- **Correção recomendada (não aplicada):**
  1. Alterar `get_user_org_ids()` para filtrar `AND status = 'active'`, e criar função helper `has_org_role(p_org_id uuid, p_roles text[])`.
  2. Aplicar restrições por papel nas políticas RLS e nas RPCs (ex.: apenas `admin` gerencia equipe/fazendas; apenas `admin`/`veterinarian` lança DG ou estorna estoque; `viewer` somente leitura).
  3. Ao inativar um membro, além de atualizar `organization_members.status = 'inactive'`, revogar sessões / banir temporariamente no Supabase Auth via API administrativa server-side e verificar `status === 'active'` no client shell.
  4. Alinhar os papéis de UI/documentação e remover o badge `"Admin"` hardcoded de `Sidebar.tsx`.
- **Teste de regressão necessário:** Usuário com `status = 'inactive'` não deve conseguir ler/gravar dados via Supabase nem navegar após refresh; usuário `operator` não deve conseguir acessar ações administrativas nem executar RPCs restritas.

---

### AUD-006 — Baixa de sêmen inoperante no manejo individual (`executeStepIA`) e falha silenciosa de inserção + ausência de transações em `executeBatchLotManagementIA`
- **Severidade:** High
- **Confiança:** Confirmed
- **Componente:** [db.ts](file:///f:/IATF/src/lib/db.ts#L7798-L7900) (`executeStepIA`) e [db.ts](file:///f:/IATF/src/lib/db.ts#L9040-L9365) (`executeBatchLotManagementIA`)
- **Status:** Open
- **Evidência reproduzível:**
  - **Bug em `executeStepIA` ([db.ts:7831-7865](file:///f:/IATF/src/lib/db.ts#L7831-L7865)):** Primeiro executa `UPDATE animal_managements SET semen_batch_id = data.semen_batch_id` (linhas 7831–7842) e, **somente depois** (linhas 7857–7863), lê `SELECT semen_batch_id FROM animal_managements WHERE id = managementId` e avalia `const isNewBatch = !existingMgmt?.semen_batch_id || existingMgmt.semen_batch_id !== data.semen_batch_id;`. Como o campo acabou de ser atualizado para `data.semen_batch_id`, `existingMgmt.semen_batch_id === data.semen_batch_id` é sempre verdadeiro e `isNewBatch` é sempre `false` — a baixa em `semen_batches` e no módulo criogênico (`deductGeneticInventoryForSemenBatch`) **nunca é executada**.
  - **Bug em `executeBatchLotManagementIA` ([db.ts:9247-9280](file:///f:/IATF/src/lib/db.ts#L9247-L9280)):** Quando não existe registro prévio em `animal_managements` para a matriz no lote, monta `newMgmtsToInsert` **sem** `farm_id` e **sem** `start_date`, ambas colunas **`NOT NULL`** no schema live (`animal_managements`). O `.insert(newMgmtsToInsert)` na linha 9279 não verifica `{ error }`, falhando silenciosamente no PostgreSQL. Evidência no banco live: **`1.204` de `1.966` vínculos em `iatf_lot_animals` não possuem linha correspondente em `animal_managements`**.
  - **Falta de atomicidade e checagem de erros:** `executeBatchLotManagementIA` realiza updates em `animals`, inserts/updates em `animal_managements`, chunks paralelos de 15 updates em `iatf_lot_animals`, chamadas RPC de estoque genético e update em `management_events` sem verificar `{ error }` nas 6 escritas e sem transação única (falha parcial no meio do lote deixa estoque, animais e evento inconsistentes).
- **Impacto:** Perda silenciosa de rastreabilidade de manejos individuais e ausência de baixa automática de estoque em manejos individuais, além de corrupção parcial em falhas de rede durante manejo coletivo.
- **Cenário de falha:** Veterinário registra IA individual na ficha da matriz (`executeStepIA`): o registro é salvo, mas nenhuma palheta é descontada de `semen_batches` nem de `genetic_inventory_balances`. No manejo em lote (`executeBatchLotManagementIA`), para matrizes adicionadas ao lote sem D0 prévio em `animal_managements`, o insert em `animal_managements` é rejeitado pelo NOT NULL de `farm_id`/`start_date` sem nenhum alerta na UI.
- **Atores/dados afetados:** `animal_managements`, `iatf_lot_animals`, `semen_batches`, `genetic_inventory_balances`, `management_events`.
- **Correção recomendada (não aplicada):**
  1. Em `executeStepIA`, ler `existingMgmt` **antes** de atualizar `animal_managements` e validar `{ error }` em todas as etapas.
  2. Em `executeBatchLotManagementIA`, buscar `farm_id`, `season_id`, `protocol_id` e `start_date` do lote (`iatf_lots`) para preencher `newMgmtsToInsert`, e verificar/retornar erros do Supabase.
  3. Idealmente encapsular os manejos em lote e individuais em RPCs PostgreSQL transacionais para garantir atomicidade *all-or-nothing*.
- **Teste de regressão necessário:** Testar `executeStepIA` verificando decremento de exatamente 1 dose na primeira IA e ausência de dupla baixa ao editar notas; testar `executeBatchLotManagementIA` em lote sem `animal_managements` prévio verificando criação bem-sucedida de todos os registros.

---

### AUD-007 — Dessincronização entre estoque legado (`semen_batches`) e criogênico (`genetic_inventory_balances`) com saldo negativo real no banco
- **Severidade:** High
- **Confiança:** Confirmed
- **Componente:** `public.semen_batches`, trigger `trg_handle_semen_batch_usage`, [db.ts](file:///f:/IATF/src/lib/db.ts#L7671-L7796) (`deductGeneticInventoryForSemenBatch`), [db.ts](file:///f:/IATF/src/lib/db.ts#L5350-L5436) (`deleteLot`), [geneticInventoryService.ts](file:///f:/IATF/src/lib/services/geneticInventoryService.ts#L759-L770) (`processInbound`)
- **Status:** Open
- **Evidência reproduzível:**
  - Inspeção live via Supabase MCP:
    - **`4` registros em `semen_batches` possuem saldo negativo** (`initial_quantity - used_quantity - lost_quantity < 0`): respectivamente **`-511`** (`initial: 40, used: 551`), **`-52`** (`initial: 40, used: 92`), **`-5`** (`initial: 20, used: 25`) e **`-1`** (`initial: 5, used: 6`).
    - Total de palhetas em `semen_batches`: **3.454** vs. total em `genetic_inventory_balances`: **3.859** (diferença líquida de **405 doses** entre os dois modelos de estoque coexistentes).
    - Em `semen_batches`, ao contrário de `genetic_inventory_balances` (que possui `CHECK (quantity_available >= 0)`), não existe nenhuma constraint impedindo saldo negativo.
  - Análise estática de código:
    - `deductGeneticInventoryForSemenBatch` ([db.ts:7767](file:///f:/IATF/src/lib/db.ts#L7767)) gera `p_idempotency_key = \`ia_usage_${...}_${Date.now()}\`` — usar `Date.now()` anula a proteção de idempotência em retentativas.
    - A chamada `await supabase.rpc('fn_process_genetic_usage_iatf', ...)` ([db.ts:7769](file:///f:/IATF/src/lib/db.ts#L7769)) **não desestrutura `{ error }`**, de modo que falhas de saldo insuficiente ou de rede no estoque criogênico são silenciosamente ignoradas enquanto `iatf_lot_animals` e `semen_batches` continuam sendo debitados.
    - `deductGeneticInventoryForSemenBatch` ([db.ts:7739-7758](file:///f:/IATF/src/lib/db.ts#L7739-L7758)) também inclui saldos de **clientes em custódia** (`owner_client_id IS NOT NULL`), podendo consumir sêmen de terceiros durante uma IA da fazenda caso não haja filtro.
    - `processInbound` ([geneticInventoryService.ts:760-770](file:///f:/IATF/src/lib/services/geneticInventoryService.ts#L760-L770)) sempre faz `INSERT` em `semen_batches` em vez de consolidar quando o lote já existe, e não verifica se `payload.batchNumber` está definido (quando reutiliza `batchId` existente).
    - `deleteLot` ([db.ts:5398-5401](file:///f:/IATF/src/lib/db.ts#L5398-L5401)) dispara `trg_handle_semen_batch_usage` devolvendo `used_quantity` em `semen_batches`, mas **não gera estorno (`REVERSAL`)** das saídas `USAGE` em `genetic_inventory_movements`/`genetic_inventory_balances`.
- **Impacto:** Divergência contábil permanente entre o estoque mostrado nos relatórios/seletores de IA (`semen_batches`) e o estoque auditável criogênico (`genetic_inventory_balances`), possibilidade de consumo sem saldo ou de doses pertencentes a terceiros em custódia, e falhas silenciosas de baixa.
- **Cenário de falha:** Usuário executa IA em lote com partida cuja quantidade em `genetic_inventory_balances` é `0` (ou menor que o lote); `fn_process_genetic_usage_iatf` lança exceção no banco, `db.ts:7769` ignora o erro, `trg_handle_semen_batch_usage` incrementa `semen_batches.used_quantity` levando o saldo legado para negativo (ex.: `-511`), e a operação retorna `success: true`.
- **Atores/dados afetados:** `semen_batches`, `genetic_material_batches`, `genetic_inventory_balances`, `genetic_inventory_movements`, `iatf_lot_animals`.
- **Correção recomendada (não aplicada):**
  1. Reconciliar e auditar as 4 partidas negativas e a diferença de 405 doses com a equipe de campo; definir fonte única de verdade (ou vincular `semen_batches` diretamente ao saldo criogênico).
  2. Tornar a chave de idempotência determinística (sem `Date.now()`), checar `{ error }` na RPC `fn_process_genetic_usage_iatf` e filtrar saldos próprios (`owner_client_id IS NULL`) salvo seleção explícita de cliente.
  3. Tratar estorno ou bloqueio de exclusão de lotes que já consumiram sêmen no livro razão criogênico.
- **Teste de regressão necessário:** IA sem saldo criogênico deve abortar/alertar sem negativar `semen_batches`; reenvio da mesma operação deve ser bloqueado pela chave idempotente determinística.

---

### AUD-008 — Múltiplos defeitos estruturais no `SyncEngine` offline (perda de sincronização e erros garantidos no retorno do curral)
- **Severidade:** High
- **Confiança:** Confirmed
- **Componente:** [syncEngine.ts](file:///f:/IATF/src/lib/offline/syncEngine.ts), [offlineDb.ts](file:///f:/IATF/src/lib/offline/offlineDb.ts) e chamadas offline em [db.ts](file:///f:/IATF/src/lib/db.ts)
- **Status:** Open
- **Evidência reproduzível:**
  1. **Injeção de coluna inexistente em `iatf_lot_animals`:** `enqueueMutation` ([syncEngine.ts:160-162](file:///f:/IATF/src/lib/offline/syncEngine.ts#L160-L162)) e `syncNow` ([syncEngine.ts:240-242](file:///f:/IATF/src/lib/offline/syncEngine.ts#L240-L242)) adicionam `payload.organization_id = ...` para qualquer tabela diferente de `'custom_rpc'`. A tabela `iatf_lot_animals` **não possui coluna `organization_id`** (confirmado em `list_tables`), fazendo o PostgREST rejeitar todas as mutações offline de `iatf_lot_animals` (`recordOfflineLotAnimalDG`, `recordOfflineCreateAndAddAnimalToLot`, `executeBatchLotManagementIA` etc.) com erro `PGRST204` (`Could not find the 'organization_id' column`).
  2. **`upsert` parcial sobre tabelas com colunas `NOT NULL`:** `syncNow` ([syncEngine.ts:244-248](file:///f:/IATF/src/lib/offline/syncEngine.ts#L244-L248)) executa `.upsert(payload, { onConflict: 'id' })` para ações `'update'` contendo apenas colunas alteradas (ex.: `d9_executed_at` em `animal_managements` ou `reproductive_status` em `animals`). No PostgreSQL, `INSERT ... ON CONFLICT DO UPDATE` avalia restrições `NOT NULL` dos valores `INSERT` antes de resolver o conflito, falhando em colunas obrigatórias ausentes do payload parcial (`tag_number`/`farm_id` em `animals`, `animal_id`/`start_date`/`farm_id` em `animal_managements`, `lot_id`/`animal_id` em `iatf_lot_animals`, `step_code`/`planned_date` em `management_events`).
  3. **Query inválida em `downloadFarmDataForCurral`:** Linha [syncEngine.ts:1033-1036](file:///f:/IATF/src/lib/offline/syncEngine.ts#L1033-L1036) executa `supabase.from('reproductive_seasons').select('*').eq('farm_id', farmId)`, mas `reproductive_seasons` **não possui coluna `farm_id`** (apenas `organization_id`).
  4. **Colunas inexistentes em `recordOfflineManagement`:** Linhas [syncEngine.ts:985-999](file:///f:/IATF/src/lib/offline/syncEngine.ts#L985-L999) enfileiram `step_code`, `date`, `inseminator`, `bull_name`, `doses_used`, `diagnosis_result` na tabela `animal_managements`, mas nenhuma dessas colunas existe na tabela PostgreSQL `animal_managements`.
  5. **Ausência de sincronização de baixa de sêmen offline:** `recordOfflineStepIA` ([syncEngine.ts:632-634](file:///f:/IATF/src/lib/offline/syncEngine.ts#L632-L634)) e `executeBatchLotManagementIA` offline ([db.ts:9119-9121](file:///f:/IATF/src/lib/db.ts#L9119-L9121)) decrementam apenas o IndexedDB local (`decrementLocalSemenBatch`), sem enfileirar chamada a `fn_process_genetic_usage_iatf` na `sync_queue`.
  6. **Retry infinito sem dead-letter / backoff:** Em caso de erro permanente (4xx/schema), `syncNow` volta o item para `status: 'pending'` ([syncEngine.ts:273-277](file:///f:/IATF/src/lib/offline/syncEngine.ts#L273-L277)) e tenta reenviar a cada 60 segundos indefinidamente ([syncEngine.ts:55-59](file:///f:/IATF/src/lib/offline/syncEngine.ts#L55-L59)); além disso `syncDownAllData` usa `bulkPut` e **não remove** registros excluídos no servidor.
- **Impacto:** Manejamentos feitos no modo curral offline correm alto risco de nunca sincronizar com o servidor ao retornar ao escritório, acumulando itens travados na `sync_queue` e deixando o estoque criogênico desatualizado.
- **Cenário de falha:** Operador ativa o Modo Curral offline, registra DG ou IA no lote e volta ao sinal; o `SyncEngine` executa `upsert` em `iatf_lot_animals` com `organization_id` ou em `animals` sem `tag_number`, o Supabase rejeita repetidamente a cada 60s e os dados permanecem presos apenas no IndexedDB do dispositivo.
- **Atores/dados afetados:** `sync_queue`, `iatf_lot_animals`, `animal_managements`, `animals`, `management_events`, `reproductive_seasons`, `genetic_inventory_balances`.
- **Correção recomendada (não aplicada):**
  1. Para ações `'update'`, executar `.update(payload).eq('id', item.record_id)` em vez de `.upsert(...)`.
  2. Remover injeção cega de `organization_id` em tabelas sem essa coluna (ex.: `iatf_lot_animals`, `protocol_steps`).
  3. Corrigir `downloadFarmDataForCurral` para filtrar `reproductive_seasons` por `organization_id`, corrigir o mapeamento de colunas de `recordOfflineManagement` e enfileirar baixa no estoque genético (`custom_rpc` com `fn_process_genetic_usage_iatf` com chave idempotente fixa gerada no momento do manejo offline).
  4. Implementar limite de tentativas (`MAX_RETRIES`), fila `failed` visível ao operador no `SyncStatusBadge` e estratégia de reconciliação de exclusões no `syncDownAllData`.
- **Teste de regressão necessário:** Simular ciclo completo offline→online (criação de animal, vínculo ao lote, D9, IA com baixa de sêmen e DG) em ambiente staging e validar `pendingCount === 0` e integridade no PostgreSQL.

---

### AUD-009 — Conflito entre `create_team_member_user` e trigger `on_auth_user_created` + fallback inseguro de tenant em `getCurrentOrgId()`
- **Severidade:** High
- **Confiança:** Confirmed
- **Componente:** Trigger `auth.users -> on_auth_user_created` (`public.handle_new_user_onboarding()`), `public.create_team_member_user`, [db.ts](file:///f:/IATF/src/lib/db.ts#L106-L215) (`getCurrentOrgId()`)
- **Status:** Open
- **Evidência reproduzível:**
  - Consulta live em `pg_trigger` confirmou o trigger `on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user_onboarding()`.
  - Quando `create_team_member_user` insere diretamente em `auth.users` ([008_team_and_farm_freeze.sql](file:///f:/IATF/supabase/migrations/008_team_and_farm_freeze.sql#L95-L121)), `on_auth_user_created` dispara **antes** da inserção na org destino (`p_org_id`) e cria automaticamente uma **nova organização**, uma **nova fazenda `"Fazenda Principal ..."`**, uma **estação**, 5 raças, 4 categorias e **um registro em `organization_members` com `role = 'admin'`** para esse usuário na organização recém-criada.
  - Em seguida, `create_team_member_user` insere um **segundo** vínculo do mesmo usuário em `organization_members` (desta vez para `p_org_id` com `p_role`, ex.: `'operator'`).
  - No frontend, `getCurrentOrgId()` ([db.ts:160-165](file:///f:/IATF/src/lib/db.ts#L160-L165)) busca `organization_members` com `.eq('user_id', user.id).limit(1).maybeSingle()` **sem `ORDER BY`**: o usuário passa a pertencer a 2 organizações (uma onde é `admin` fantasma e outra onde é `operator`), podendo abrir o app na organização errada de forma não determinística. Além disso, as linhas [db.ts:176-189](file:///f:/IATF/src/lib/db.ts#L176-L189) fazem fallback para `organizations.select('id').limit(1)` se nenhum membro for retornado, e as linhas [db.ts:151-157](file:///f:/IATF/src/lib/db.ts#L151-L157) reutilizam `localStorage.getItem('iatf_current_org_id')` mesmo se `!user`.
- **Impacto:** Proliferação de organizações e fazendas "fantasmas" a cada membro criado, inconsistência determinística do tenant ativo após login e risco de o operador trabalhar na organização vazia em vez da organização da empresa.
- **Cenário de falha:** Admin cria um colaborador em `/team`; `handle_new_user_onboarding` cria automaticamente uma organização pessoal onde o colaborador é `admin`. Quando o colaborador faz login, `getCurrentOrgId()` pode retornar a organização pessoal vazia em vez da `p_org_id` esperada.
- **Atores/dados afetados:** `auth.users`, `organizations`, `organization_members`, `farms`, `reproductive_seasons`, `breeds`, `animal_categories`.
- **Correção recomendada (não aplicada):**
  1. Ajustar `handle_new_user_onboarding()` para verificar flag explícita em `raw_app_meta_data` (ex.: `skip_onboarding = true` quando criado via convite/equipe) ou mover onboarding para fluxo explícito em vez de trigger incondicional em `auth.users`.
  2. Adicionar seletor/ordenação determinística em `getCurrentOrgId()`, priorizando vínculo ativo explícito, e remover fallbacks perigosos (`organizations.limit(1)` e uso de `storedOrgId` sem usuário online).
- **Teste de regressão necessário:** Criar membro via fluxo de equipe não deve gerar nova organização/fazenda extra; usuário recém-criado deve resolver deterministicamente o `p_org_id` ao qual foi vinculado.

---

### AUD-010 — `fn_process_genetic_reversal` ignora transferências (`TRANSFER_OUT` / `TRANSFER_IN`)
- **Severidade:** High
- **Confiança:** Confirmed
- **Componente:** Função PostgreSQL `public.fn_process_genetic_reversal` (live DB e [007_genetic_inventory_module.sql](file:///f:/IATF/supabase/migrations/007_genetic_inventory_module.sql#L722-L818))
- **Status:** Open
- **Evidência reproduzível:**
  - Definição live e [007_genetic_inventory_module.sql](file:///f:/IATF/supabase/migrations/007_genetic_inventory_module.sql#L762-L799): o bloco condicional trata apenas:
    - `IF v_orig.movement_type IN ('INBOUND', 'ADJUSTMENT_POSITIVE') THEN ...`
    - `ELSIF v_orig.movement_type IN ('OUTBOUND', 'USAGE', 'LOSS', 'ADJUSTMENT_NEGATIVE') THEN ...`
  - Não há ramo `ELSIF` nem rejeição para `'TRANSFER_OUT'` e `'TRANSFER_IN'`. O comando prossegue diretamente para o `INSERT INTO genetic_inventory_movements (... movement_type = 'REVERSAL' ...)` sem ajustar `genetic_inventory_balances` nem exigir `transfer_group_id`.
- **Impacto:** Estornar uma movimentação de transferência grava um registro `REVERSAL` no livro razão sem reverter o saldo no botijão de origem nem no botijão de destino, deixando o estoque físico/materializado divergente da trilha de auditoria.
- **Cenário de falha:** Usuário visualiza uma transferência no Ledger (`/estoque-semen`) e aciona o estorno; a RPC retorna UUID de sucesso e registra `REVERSAL`, mas as doses continuam na caneca de destino sem voltar à origem.
- **Atores/dados afetados:** `genetic_inventory_movements`, `genetic_inventory_balances`.
- **Correção recomendada (não aplicada):** Implementar tratamento atômico para estorno de `transfer_group_id` (validando e debitando destino com `FOR UPDATE`, creditando origem e marcando ambos os movimentos do par como estornados) ou bloquear explicitamente com `RAISE EXCEPTION` caso estorno individual de perna de transferência não seja permitido.
- **Teste de regressão necessário:** Estornar uma transferência deve debitar destino, creditar origem e impedir re-estorno das duas pontas; tentativa sem saldo no destino deve falhar atomicamente.

---

### AUD-011 — Drift severo entre `supabase/migrations/` no Git (11 arquivos) e o schema/histórico live no Supabase (8 migrations)
- **Severidade:** High
- **Confiança:** Confirmed
- **Componente:** `supabase/migrations/` vs histórico `supabase_migrations.schema_migrations` e DDL live no projeto `"IATF"`
- **Status:** Open
- **Evidência reproduzível:**
  - `list_migrations` no banco live retornou **8** versões: `001_initial_schema`, `002_rls_policies`, `003_lot_stats_view`, `004_triggers_and_business_rules`, `fix_management_events_rls`, `fix_all_rls_dev_policies`, `005_veterinarians`, `009_decouple_agenda_from_lots`.
  - O diretório [supabase/migrations/](file:///f:/IATF/supabase/migrations) contém **11** arquivos (`001_initial_schema.sql` a `011_clean_registries_and_active_season.sql`) com nomes e conteúdos divergentes; por exemplo, `006_animal_managements.sql`, `007_genetic_inventory_module.sql`, `008_team_and_farm_freeze.sql`, `010_fix_dashboard_metrics_and_lot_stats.sql` e `011_clean_registries_and_active_season.sql` existem aplicados manualmente no live, porém **não constam** em `schema_migrations`.
  - **Diferenças estruturais confirmadas entre Git e Live:**
    - A tabela `public.input_losses` existe no banco live (com colunas `input_type`, `animal_id`, `recorded_by`), mas **não existe `CREATE TABLE input_losses`** em nenhuma migration do Git.
    - Os triggers `trg_calculate_expected_parturition`, `trg_handle_semen_batch_usage` e `on_auth_user_created` existem no banco live, mas suas definições **não estão versionadas** em `supabase/migrations/`.
    - Políticas `tenant_*` e função `get_user_org_ids()` existem em 16 tabelas no banco live, enquanto no Git a migration `002_fix_rls_dev_policies.sql` e `004` definem `*_dev_policy` aberta.
    - Índice único `uq_genetic_balances` (`UNIQUE NULLS NOT DISTINCT`) e cláusulas `ON CONFLICT` das RPCs `fn_process_genetic_*` no live diferem do DDL em `007_genetic_inventory_module.sql` (que usava índice funcional com `COALESCE`).
    - Migration `011_clean_registries_and_active_season.sql` contém UUID de organização específico embutido diretamente em arquivo de código/migration.
- **Impacto:** Impossibilidade de reconstruir o banco de dados de forma confiável a partir do Git (ex.: ao criar um Supabase Branch de staging ou ambiente de recuperação), alto risco de sobrescrever políticas `tenant_*` ou quebrar RPCs caso as migrations locais sejam executadas.
- **Cenário de falha:** Um desenvolvedor cria um ambiente local ou branch no Supabase executando `supabase/migrations/`: o banco nasce sem `input_losses`, sem os triggers de prenhez/baixa de sêmen/onboarding e com políticas RLS diferentes das de produção.
- **Atores/dados afetados:** Toda a infraestrutura de banco de dados e processo de deploy/rollback.
- **Correção recomendada (não aplicada):** Gerar uma migration/baseline fiel ao schema live validado (após aplicar as correções de segurança do Lote 0), versionar todos os triggers e funções no Git, remover UUIDs específicos de cliente/ambiente de migrations genéricas e adotar fluxo único de `supabase db diff` / `apply_migration`.
- **Teste de regressão necessário:** Subir um branch/banco limpo aplicando apenas as migrations do Git e comparar catálogo (`tables`, `policies`, `functions`, `triggers`, `views`, `constraints`) com o banco de referência.

---

### AUD-012 — Falhas no ciclo de sessão e retenção de dados sensíveis após logout em dispositivos compartilhados
- **Severidade:** Medium
- **Confiança:** Confirmed
- **Componente:** [Sidebar.tsx](file:///f:/IATF/src/components/Sidebar.tsx#L111-L120), [Navigation.tsx](file:///f:/IATF/src/components/Navigation.tsx#L59-L68), [AppShell.tsx](file:///f:/IATF/src/components/AppShell.tsx#L38-L65), [sw.js](file:///f:/IATF/public/sw.js#L48-L68)
- **Status:** Open
- **Evidência reproduzível:**
  - `handleLogout` em [Sidebar.tsx:111-120](file:///f:/IATF/src/components/Sidebar.tsx#L111-L120) remove apenas `sessionStorage.removeItem('iatf_tab_session')` e chama `supabase.auth.signOut()`, mantendo intactos:
    - `localStorage`: `iatf_offline_session_active`, `iatf_current_org_id`, `iatf_active_farm_id`, `iatf_active_season_id`, `iatf_force_offline`, `iatf_offline_genetic_centers` e caches de checklist de lote (`db.ts:9623`).
    - IndexedDB `IATF_Master_Offline_DB` (Dexie com até 5.000 animais/manejos, fazendas, clientes genéticos, veterinários, `audit_log` e `sync_queue`).
    - Cache Storage do Service Worker `iatf-pwa-v2` (que cacheia respostas HTML `200` de rotas navegadas).
  - Em [AppShell.tsx:39-59](file:///f:/IATF/src/components/AppShell.tsx#L39-L59), caso o usuário abra uma nova aba do navegador (`sessionStorage` vazio por aba), `!hasTabSession` avalia como verdadeiro quando online e executa `await supabase.auth.signOut()` e redireciona para `/login`, encerrando a sessão de todas as abas.
  - Em modo offline (`!navigator.onLine`), `iatf_offline_session_active = 'true'` em `localStorage` autoriza acesso à UI em [AppShell.tsx:42-45](file:///f:/IATF/src/components/AppShell.tsx#L42-L45) sem nova validação de credencial.
- **Impacto:** Em tablets/celulares compartilhados no curral, após clicar em *"Sair da Conta"*, dados completos do rebanho e filas pendentes permanecem gravados no dispositivo (acessíveis via modo offline ou DevTools/IndexedDB), e outro usuário logando na sequência pode enxergar `sync_queue` do usuário anterior. Online, abrir link em nova aba desloga o usuário inesperadamente.
- **Cenário de falha:** Veterinário faz logout no tablet da fazenda, mas não limpa IndexedDB; se o tablet perder internet ou for inspecionado localmente, os dados em cache permanecem disponíveis e mutações pendentes na `sync_queue` podem ser enviadas na próxima sessão.
- **Atores/dados afetados:** Sessões de usuários em campo e dados cacheados em `localStorage`/`IndexedDB`/Cache Storage.
- **Correção recomendada (não aplicada):**
  1. No logout, verificar se há itens pendentes em `sync_queue` (alertando antes de descartar ou sincronizando), limpar caches em memória (`clearTenantCache()`), chaves `iatf_*` no `localStorage`, tabelas do `offlineDb` e caches HTML do Service Worker.
  2. Revisar a estratégia de `iatf_tab_session` (preferir `localStorage` ou broadcast entre abas + validação real do cookie/JWT em vez de deslogar usuários que abrem novas abas).
- **Teste de regressão necessário:** Após logout, IndexedDB (`animals`, `lots`, `animal_managements`), `localStorage` operacional e cache HTML devem estar vazios; abrir link do app em nova aba autenticado não deve forçar logout.

---

### AUD-013 — Módulo `/import` exposto como protótipo simulado (`setTimeout`) sem parser nem persistência real
- **Severidade:** Medium
- **Confiança:** Confirmed
- **Componente:** [import/page.tsx](file:///f:/IATF/src/app/import/page.tsx#L6-L135), [Sidebar.tsx](file:///f:/IATF/src/components/Sidebar.tsx#L63)
- **Status:** Open
- **Evidência reproduzível:**
  - [import/page.tsx](file:///f:/IATF/src/app/import/page.tsx#L6-L35) exibe uma tela completa com o título *"Importador Histórico de Planilhas Excel"*, botões *"Analisar Abas & Mapear Entidades"* e *"Executar Migração Transactional"*, porém utiliza apenas um array estático (`sheetsFound`) e dois `setTimeout` (1.200 ms e 1.500 ms) que mudam o estado visual para *"Importação Concluída com Sucesso!"* sem nenhum input de upload, sem ler `.xlsx` e sem gravar nada no Supabase.
  - A rota está visível no menu principal em [Sidebar.tsx:63](file:///f:/IATF/src/components/Sidebar.tsx#L63).
- **Impacto:** Risco operacional alto de um usuário acreditar que uma planilha foi analisada e importada no banco quando nenhuma operação foi realizada.
- **Cenário de falha:** Gestor acessa *"Importação de Dados"* pelo menu lateral, clica em analisar e migrar, recebe confirmação verde *"Importação Concluída com Sucesso!"*, mas nenhum dado entra no banco.
- **Atores/dados afetados:** Usuários administradores/gestores que acessam `/import`.
- **Correção recomendada (não aplicada):** Remover ou ocultar o item `/import` da navegação e sinalizar claramente a rota como *"Em desenvolvimento / Indisponível"* até implementar a leitura real (com biblioteca segura substituindo `xlsx@0.18.5`) e validação transacional descrita em [IMPORT_MAPPING.md](file:///f:/IATF/IMPORT_MAPPING.md).
- **Teste de regressão necessário:** Garantir que o botão não exiba sucesso falso e, após implementação real, testar upload válido e rejeição de arquivo malformado.

---

### AUD-014 — Lacunas de hardening de banco, Auth e HTTP (`search_path` mutável, privilégios excessivos, Leaked Password Protection desativada e ausência de headers de segurança)
- **Severidade:** Medium
- **Confiança:** Confirmed
- **Componente:** PostgreSQL `public` (14 funções e `role_table_grants`), Supabase Auth, [next.config.mjs](file:///f:/IATF/next.config.mjs)
- **Status:** Open
- **Evidência reproduzível:**
  - `get_advisors(security)` reporta **14 WARN** [`0011_function_search_path_mutable`](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable) (todas as funções em `public`, exceto `rls_auto_enable`, não fixam `SET search_path`).
  - `get_advisors(security)` reporta **1 WARN** [`auth_leaked_password_protection`](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) (*Leaked password protection is currently disabled*).
  - Consulta live em `information_schema.role_table_grants` mostra que tanto `anon` quanto `authenticated` detêm **`DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE`** em todas as 29 tabelas e 2 views de `public`.
  - [next.config.mjs](file:///f:/IATF/next.config.mjs) não define `headers()` (`Content-Security-Policy`, `X-Frame-Options` / `frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy`). Além disso, [layout.tsx](file:///f:/IATF/src/app/layout.tsx#L45) utiliza script inline (`dangerouslySetInnerHTML`) para inicialização de tema.
- **Impacto:** Superfície ampliada para hijacking de `search_path` em funções `SECURITY DEFINER`, concessões DDL/DML desnecessárias (`TRUNCATE`, `TRIGGER`, `REFERENCES`) para papéis de API, aceitação de senhas vazadas no Auth e ausência de proteção HTTP contra clickjacking e MIME sniffing.
- **Cenário de falha:** Usuário cadastra senha presente em vazamentos públicos conhecidos (sem bloqueio HIBP) ou aplicação é carregada dentro de `<iframe>` de terceiros por falta de `X-Frame-Options` / CSP.
- **Atores/dados afetados:** Segurança de autenticação, runtime PostgreSQL e sessões no navegador.
- **Correção recomendada (não aplicada):**
  1. Adicionar `SET search_path = public, pg_temp` (ou `pg_catalog, public`) em todas as funções do schema `public` e qualificar referências a objetos.
  2. Revogar privilégios `TRUNCATE`, `TRIGGER`, `REFERENCES` de `anon` e `authenticated` nas tabelas de `public`, bem como revogar `ALL` de `anon` onde não aplicável.
  3. Ativar *Leaked Password Protection* nas configurações de Auth do projeto Supabase.
  4. Configurar `headers()` em `next.config.mjs` com `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY` e política CSP compatível.
- **Teste de regressão necessário:** Reexecutar `get_advisors(security)` confirmando eliminação de `0011` e `auth_leaked_password_protection`; inspecionar headers de resposta HTTP.

---

### AUD-015 — Lacunas de integridade referencial, auditoria vazia e fragilidade da trava de centralização de sêmen
- **Severidade:** Medium
- **Confiança:** Confirmed
- **Componente:** Schema live (`management_events`, `iatf_lots`, `genetic_audit_logs`, `iatf_lot_animals`, `animal_managements`), [geneticInventoryService.ts](file:///f:/IATF/src/lib/services/geneticInventoryService.ts#L260-L287) e [geneticInventoryService.ts](file:///f:/IATF/src/lib/services/geneticInventoryService.ts#L360-L379)
- **Status:** Open
- **Evidência reproduzível:**
  - Consulta agregada no banco live confirmou:
    - **`2` eventos em `management_events`** com `lot_id IS NULL AND farm_id IS NULL` (órfãos sem vínculo nem com lote nem com fazenda).
    - **`2` duplicidades de código de lote** no mesmo `(organization_id, farm_id, season_id, code)` em `iatf_lots` (não há constraint `UNIQUE`).
    - **`genetic_audit_logs` possui `0` registros** apesar de `670` movimentações gravadas em `genetic_inventory_movements` e da regra `RN-11` ([BUSINESS_RULES.md](file:///f:/IATF/BUSINESS_RULES.md#L78-L79)).
    - Ausência de `CHECK` constraints no banco para `reproductive_status`, `pregnancy_status`, `ecc_ia`/`ecc_dg` (1..5), e campos de quantidade de `semen_batches`.
  - A trava de centralização de sêmen (`validateMainFarmSemenLock` em [geneticInventoryService.ts:260-287](file:///f:/IATF/src/lib/services/geneticInventoryService.ts#L260-L287) e [estoque-semen/page.tsx:73](file:///f:/IATF/src/app/estoque-semen/page.tsx#L73)) depende de busca textual `.ilike('name', '%principal%')` na tabela `farms`, é **fail-open** (se `farms` falhar ou retornar erro, o `catch` retorna `{ allowed: true }`), **não existe no PostgreSQL/RPCs**, e não é chamada por `updateTank` ([geneticInventoryService.ts:360](file:///f:/IATF/src/lib/services/geneticInventoryService.ts#L360)) nem por `processReversal` ([geneticInventoryService.ts:907](file:///f:/IATF/src/lib/services/geneticInventoryService.ts#L907)).
- **Impacto:** Dados inconsistentes (eventos órfãos invisíveis em filtros por fazenda, códigos de lote duplicados confundindo equipe de curral), ausência de trilha de auditoria em `genetic_audit_logs`, e possibilidade de contornar a trava da fazenda principal ao renomear uma fazenda ou chamar a RPC diretamente.
- **Cenário de falha:** Usuário cria dois lotes com mesmo código na mesma fazenda/estação ou uma fazenda sem a palavra `"principal"` no nome libera movimentações descentralizadas; alterações de DG em lotes concluídos não geram registros na tabela de auditoria.
- **Atores/dados afetados:** `management_events`, `iatf_lots`, `genetic_audit_logs`, `semen_tanks`, `genetic_inventory_movements`.
- **Correção recomendada (não aplicada):**
  1. Limpar/vincular os 2 eventos órfãos e adicionar constraint `CHECK (lot_id IS NOT NULL OR farm_id IS NOT NULL)` em `management_events`.
  2. Tratar os 2 códigos de lote duplicados e avaliar `UNIQUE (organization_id, farm_id, season_id, code)`.
  3. Substituir heurística `%principal%` por coluna booleana explícita `is_genetic_hub` em `farms`, aplicando a regra no servidor/RPC e tornando a validação fail-closed.
  4. Criar triggers de auditoria reais para `genetic_audit_logs` e alterações de DG concluídos.
- **Teste de regressão necessário:** Tentativa de criar evento sem `lot_id` e `farm_id`, lote duplicado na mesma estação ou movimentação em fazenda não-hub deve ser rejeitada pelo banco.

---

### AUD-016 — Gargalos de performance e escalabilidade (62 FKs sem índice, `auth_rls_initplan`, preload de 15 queries no mount e arquivos monolíticos)
- **Severidade:** Medium
- **Confiança:** Confirmed
- **Componente:** Índices/RLS PostgreSQL (`get_advisors(performance)`), [SyncStatusBadge.tsx](file:///f:/IATF/src/components/offline/SyncStatusBadge.tsx#L37-L41), [syncEngine.ts](file:///f:/IATF/src/lib/offline/syncEngine.ts#L299-L432), [db.ts](file:///f:/IATF/src/lib/db.ts)
- **Status:** Open
- **Evidência reproduzível:**
  - `get_advisors(performance)` identificou:
    - **62 ocorrências** de [`0001_unindexed_foreign_keys`](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys) em chaves estrangeiras de `animals`, `iatf_lots`, `iatf_lot_animals`, `animal_managements`, `management_events`, `semen_batches`, `genetic_inventory_*`, `properties`, etc.
    - **1 WARN** [`0003_auth_rls_initplan`](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan) em `organization_members` (`auth.uid()` reavaliado por linha em vez de `(select auth.uid())`).
    - **1 INFO** [`0005_unused_index`](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index) em `idx_gen_mov_transfer`.
  - No frontend, ao montar o `Header`, [SyncStatusBadge.tsx:37-41](file:///f:/IATF/src/components/offline/SyncStatusBadge.tsx#L37-L41) executa automaticamente `syncEngine.syncDownAllData()`, disparando **15 consultas paralelas** ao Supabase ([syncEngine.ts:308-340](file:///f:/IATF/src/lib/offline/syncEngine.ts#L308-L340)), incluindo `animals` completo da organização, `iatf_lot_animals.limit(5000)` (sem filtro de `organization_id` e truncado em 5.000) e `animal_managements.limit(5000)` — repetindo a cada `syncNow()`.
  - `src/lib/db.ts` concentra **10.187 linhas**, `src/app/lots/page.tsx` **3.598 linhas** e `src/app/registries/page.tsx` **3.141+ linhas** em componentes inteiramente `'use client'`.
- **Impacto:** Degradação progressiva em `DELETE`/`UPDATE` em tabelas pai (por falta de índice nas FKs), consumo elevado de banda/memória móvel no carregamento inicial (especialmente em redes rurais 3G/4G) e truncamento silencioso de registros no cache offline ao ultrapassar 5.000 animais em lote/manejos.
- **Cenário de falha:** À medida que o rebanho cresce para >5.000 vínculos/manejos, cada abertura de página dispara 15 queries grandes competindo com as queries da tela ativa, e o sync offline deixa de baixar os registros mais recentes ou antigos além do limite fixo de 5.000.
- **Atores/dados afetados:** Todas as telas autenticadas, usuários em conexão rural limitada e banco PostgreSQL.
- **Correção recomendada (não aplicada):**
  1. Criar índices nas FKs usadas em joins, filtros e exclusões em cascata (`iatf_lot_animals(animal_id)`, `iatf_lot_animals(bull_id)`, `iatf_lot_animals(semen_batch_id)`, `iatf_lots(farm_id)`, `iatf_lots(season_id)`, `animal_managements(lot_id)`, `animals(farm_id)`, etc.) e envolver `auth.uid()` com `(select auth.uid())` nas políticas RLS.
  2. Substituir o `syncDownAllData()` irrestrito no mount por sincronização incremental (`updated_at > lastSync`) ou paginada sob demanda / via *Preparar para o Curral*, removendo o teto silencioso de `limit(5000)`.
  3. Modularizar `db.ts` por domínio para reduzir tamanho de chunks e facilitar manutenção.
- **Teste de regressão necessário:** Reexecutar `get_advisors(performance)` validando redução das FKs sem índice críticas e ausência de `auth_rls_initplan`; medir requisições iniciais na Network tab em ambiente staging.

---

### AUD-017 — Geração de senha via `Math.random()` e ausência de validação de entrada/rate limiting no servidor
- **Severidade:** Medium
- **Confiança:** Confirmed
- **Componente:** [team/page.tsx](file:///f:/IATF/src/app/team/page.tsx#L50-L59), formulários/serviços em [db.ts](file:///f:/IATF/src/lib/db.ts) e [geneticInventoryService.ts](file:///f:/IATF/src/lib/services/geneticInventoryService.ts)
- **Status:** Open
- **Evidência reproduzível:**
  - [team/page.tsx:51-59](file:///f:/IATF/src/app/team/page.tsx#L51-L59): `generatePassword()` gera senhas iniciais usando `Math.random()`.
  - Nenhuma camada usa biblioteca de validação de schema (`zod` ou similar) no servidor/backend, pois todas as chamadas vão direto do navegador para PostgREST sem camada intermediária de API/Server Action com rate limit próprio.
- **Impacto:** Senhas geradas por `Math.random()` não possuem entropia criptográfica adequada; ausência de camada de API impede rate limiting customizado por operação sensível (ex.: criação de contas, exportações ou RPCs pesadas).
- **Cenário de falha:** Administrador gera senha pelo botão *"Gerar Senha"* em `/team` usando PRNG previsível.
- **Atores/dados afetados:** Contas criadas via `/team` e endpoints de escrita.
- **Correção recomendada (não aplicada):** Substituir `Math.random()` por `crypto.getRandomValues()` em `generatePassword()`, e introduzir validação de entrada (ex.: Zod) em Server Actions / Route Handlers para operações sensíveis.
- **Teste de regressão necessário:** Verificar que `generatePassword()` utiliza `window.crypto.getRandomValues` sem viés de módulo e retorna senha dentro da política mínima.

---

### AUD-018 — Divergência de fuso horário (`America/Sao_Paulo` vs `America/Cuiaba`) e avisos ESLint
- **Severidade:** Low
- **Confiança:** Confirmed
- **Componente:** [dateUtils.ts](file:///f:/IATF/src/lib/dateUtils.ts#L9), [lots/page.tsx](file:///f:/IATF/src/app/lots/page.tsx#L763), [AnimalGeneticLookupModal.tsx](file:///f:/IATF/src/components/genetic-inventory/AnimalGeneticLookupModal.tsx#L46), [package.json](file:///f:/IATF/package.json#L9)
- **Status:** Open
- **Evidência reproduzível:**
  - `TIMEZONE_BRASILIA = 'America/Sao_Paulo'` (UTC-3) em [dateUtils.ts:9](file:///f:/IATF/src/lib/dateUtils.ts#L9), enquanto [BUSINESS_RULES.md](file:///f:/IATF/BUSINESS_RULES.md#L38-L39) e [DATABASE_SCHEMA.md](file:///f:/IATF/DATABASE_SCHEMA.md#L7) especificam `America/Cuiaba` (UTC-4).
  - `npm run lint` reportou 2 avisos `react-hooks/exhaustive-deps` em `src/app/lots/page.tsx:763` (efeito dependente apenas de `lots` chamando `handleSelectLot`) e `src/components/genetic-inventory/AnimalGeneticLookupModal.tsx:46` (efeito chamando `handleSearch` sem incluí-lo nas dependências), além do aviso de depreciação de `next lint` para Next.js 16.
- **Impacto:** Entre 23:00 e 00:00 no horário de Cuiabá (MT), `getTodayDateString()` pode considerar o dia seguinte (horário de Brasília); hooks com dependências omitidas podem capturar closures obsoletas (`farmId` em `AnimalGeneticLookupModal`).
- **Cenário de falha:** Usuário troca de fazenda enquanto o modal de busca genética está montado ou executa manejo à noite em MT com virada de data adiantada em 1 hora.
- **Atores/dados afetados:** Registros de datas de manejo e busca genética no modal.
- **Correção recomendada (não aplicada):** Definir fuso horário configurável por fazenda/organização (padrão conforme regra oficial acordada) e corrigir os dois `useEffect` com `useCallback`/dependências completas.
- **Teste de regressão necessário:** `npm run lint` com 0 warnings; teste unitário de `getTodayDateString` com fuso da fazenda.

---

### AUD-019 — Ausência de Error Boundaries, restrição de zoom de acessibilidade (`WCAG 1.4.4`) e código morto
- **Severidade:** Low
- **Confiança:** Confirmed
- **Componente:** [layout.tsx](file:///f:/IATF/src/app/layout.tsx#L28-L34), `src/app/`, [mockData.ts](file:///f:/IATF/src/lib/mockData.ts), [server.ts](file:///f:/IATF/src/lib/supabase/server.ts), [Navigation.tsx](file:///f:/IATF/src/components/Navigation.tsx)
- **Status:** Open
- **Evidência reproduzível:**
  - Nenhum arquivo `error.tsx`, `global-error.tsx`, `not-found.tsx` ou `loading.tsx` existe em `src/app/`.
  - [layout.tsx:28-34](file:///f:/IATF/src/app/layout.tsx#L28-L34) define `maximumScale: 1, userScalable: false` no `viewport`.
  - Busca global em `src/` retornou **0 referências** a `mockData.ts`, `supabase/server.ts` e `components/Navigation.tsx`, e `NEXT_PUBLIC_ORG_ID` (presente em `.env.example`/`.env.local`) também não é lida em `src/`.
- **Impacto:** Exceções não tratadas em componentes React quebram a tela inteira sem fallback amigável; bloqueio de zoom prejudica usuários com baixa visão em dispositivos móveis; arquivos obsoletos (`Navigation.tsx` inclusive possui links antigos como `/inputs` e ano fixo `2025/2026`) aumentam confusão de manutenção.
- **Cenário de falha:** Erro inesperado de renderização exibe tela branca/erro genérico do Next.js; usuário no celular tenta dar zoom em tabelas densas de lotes e o navegador bloqueia o gesto.
- **Atores/dados afetados:** Todos os usuários finais (especialmente em mobile) e equipe de manutenção.
- **Correção recomendada (não aplicada):** Adicionar `error.tsx` e `not-found.tsx`, remover `maximumScale: 1` e `userScalable: false` do `viewport`, e remover ou arquivar `mockData.ts` e `Navigation.tsx` (e `NEXT_PUBLIC_ORG_ID` de `.env.example` se não utilizada).
- **Teste de regressão necessário:** Forçar erro em componente filho verificando exibição do `error.tsx`; validar zoom por pinça em mobile.

---

### AUD-020 — Ausência de testes automatizados, CI/CD, ambiente de staging e estratégia documentada de backup/restore
- **Severidade:** Informational
- **Confiança:** Confirmed
- **Componente:** Repositório raiz `f:\IATF` e projeto Supabase `"IATF"` (`list_branches = []`)
- **Status:** Open
- **Evidência reproduzível:**
  - 0 arquivos `*test*`/`*spec*` no repositório; `package.json` sem scripts de teste; 0 workflows `.github/workflows` ou configs de deploy; `supabase` CLI não instalada localmente.
  - `list_branches` retornou `[]` — não há branch de desenvolvimento/staging no Supabase para validação segura antes de produção.
- **Impacto:** Regressões críticas (como o bug em `executeStepIA` ou o insert sem `NOT NULL` em `executeBatchLotManagementIA`) chegam diretamente ao ambiente operacional sem rede de segurança; ausência de staging inviabiliza testes dinâmicos seguros.
- **Cenário de falha:** Qualquer ajuste ou migration vai direto para o banco ativo sem execução prévia de testes automatizados nem homologação.
- **Atores/dados afetados:** Todo o ciclo de engenharia e continuidade operacional.
- **Correção recomendada (não aplicada):** Configurar branch de staging no Supabase, adicionar Vitest + Playwright (cobrindo pelo menos regras de cálculo, offline sync e RLS) e workflow CI (`tsc`, `lint`, testes, audit).
- **Teste de regressão necessário:** Pipeline CI verde em Pull Requests antes de merge em `main`.

---

### AUD-021 — Higiene de código: fallback hardcoded de veterinário, supressão `no-explicit-any` e fallback `Math.random()` em ID
- **Severidade:** Informational
- **Confiança:** Confirmed
- **Componente:** [lots/page.tsx](file:///f:/IATF/src/app/lots/page.tsx#L773), [geneticInventoryService.ts](file:///f:/IATF/src/lib/services/geneticInventoryService.ts#L261), [db.ts](file:///f:/IATF/src/lib/db.ts#L8635)
- **Status:** Open
- **Evidência reproduzível:**
  - [lots/page.tsx:773](file:///f:/IATF/src/app/lots/page.tsx#L773) contém fallback com nome específico hardcoded caso a lista de veterinários esteja vazia.
  - [geneticInventoryService.ts:261](file:///f:/IATF/src/lib/services/geneticInventoryService.ts#L261) suprime `@typescript-eslint/no-explicit-any` para o cliente Supabase.
  - [db.ts:8635](file:///f:/IATF/src/lib/db.ts#L8635) usa fallback `'mgmt_' + Date.now() + '_' + Math.random()...` quando `crypto.randomUUID` não está disponível — se enviado a coluna `UUID` do Postgres, será rejeitado.
- **Impacto:** Risco de atribuição incorreta de responsável técnico padrão em novas organizações sem veterinários cadastrados e falha de inserção UUID caso o fallback `mgmt_*` seja acionado em contextos sem `crypto.randomUUID`.
- **Cenário de falha:** Nova organização cria um lote antes de cadastrar veterinário e recebe responsável padrão hardcoded; navegador em contexto não-seguro (HTTP IP local no curral sem HTTPS) não tem `crypto.randomUUID` e gera ID não-UUID rejeitado pelo Postgres.
- **Atores/dados afetados:** Novas organizações e dispositivos acessando em HTTP não-HTTPS.
- **Correção recomendada (não aplicada):** Remover fallback nominal hardcoded (usar string vazia ou dados do usuário autenticado), tipar `SupabaseClient` corretamente e usar gerador UUID v4 válido via `crypto.getRandomValues` no fallback.
- **Teste de regressão necessário:** Garantir geração estritamente no formato UUID v4 em ambiente sem `crypto.randomUUID`.

---

## 7. Segurança e privacidade

Avaliação alinhada ao **OWASP Top 10 / ASVS** (sem exposição de valores de segredos ou PII):

- **A01 — Quebra de Controle de Acesso (`CRÍTICO`):**
  - `organization_members` permite self-assignment/escalação via `tenant_org_members` (`AUD-002`).
  - 13 tabelas operacionais e cadastrais têm política `USING (true)` para `{public}`/`anon`, e 2 views `SECURITY DEFINER` (`lot_stats`, `organization_metrics`) contornam RLS e concedem `SELECT` a `anon` (`AUD-003`).
  - 13 funções `SECURITY DEFINER` são executáveis por `anon` e `authenticated` sem validação de `auth.uid()` nem de organização/fazenda, incluindo `create_team_member_user` (`AUD-001`).
  - Não há RBAC no banco nem na UI; usuários inativos em `organization_members` continuam com acesso total (`AUD-005`).
- **A02 — Falhas Criptográficas / Gerenciamento de Sessão e Segredos (`MÉDIO`):**
  - Positivo: `SUPABASE_SERVICE_ROLE_KEY` **não** está presente em `.env*` nem no bundle client-side; apenas `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` são públicas como esperado.
  - Negativo: `generatePassword()` usa `Math.random()` (`AUD-017`); logout não limpa IndexedDB/`localStorage`/SW em dispositivos compartilhados (`AUD-012`).
- **A04 — Design Inseguro (`ALTO`):**
  - Toda regra crítica e autorização de negócio foi delegada ao frontend (`validateMainFarmSemenLock` baseada em `'%principal%'`, fluxos sem API/Server Actions, criação de usuário com troca de senha direta no DB via RPC).
- **A05 — Configuração Insegura (`MÉDIO`):**
  - `GRANT ALL` (incl. `TRUNCATE`, `TRIGGER`) para `anon`/`authenticated` em 29 tabelas/views; `search_path` mutável em 14 funções; ausência de headers CSP/`X-Frame-Options`/`nosniff` em `next.config.mjs` (`AUD-014`).
- **A06 — Componentes Vulneráveis (`CRÍTICO`):**
  - 13 vulnerabilidades no `npm audit`, com destaque para `next@15.5.23` (**Critical**) e `xlsx@0.18.5` (**High**, sem correção disponível) (`AUD-004`).
- **A07 — Falhas de Autenticação (`CRÍTICO` / `MÉDIO`):**
  - Auto-cadastro público ativo em `/login` combinado com `AUD-002`, sobrescrita arbitrária de senhas via `create_team_member_user` (`AUD-001`) e *Leaked Password Protection* desabilitada no Auth (`AUD-014`).
- **A09 — Falhas de Logging e Monitoramento (`MÉDIO`):**
  - `genetic_audit_logs` possui `0` registros no banco live (`AUD-015`) e não há trilha de auditoria no servidor para alterações de DG/lotes (`audit_logs` documentada em `DATABASE_SCHEMA.md` sequer existe no banco).

---

## 8. Integridade e confiabilidade dos dados

- **Reconciliação do Estoque Genético (`PASS`):** A auditoria SQL agregada entre o livro razão imutável (`genetic_inventory_movements`, 670 registros) e o saldo materializado (`genetic_inventory_balances`, 76 registros, 3.859 doses) apresentou **`0` divergências** e **`0` saldos negativos** (protegidos pela constraint `quantity_available >= 0` e travas `FOR UPDATE`). Contudo, `fn_process_genetic_reversal` não trata estorno de transferências (`AUD-010`).
- **Estoque Legado (`semen_batches`) (`FAIL`):** Sem constraint anti-negativo e sem trava atômica na origem, existem **`4` partidas com saldo negativo** (`-511`, `-52`, `-5`, `-1`) e uma diferença de **405 doses** entre o total calculado em `semen_batches` (3.454 doses) e `genetic_inventory_balances` (3.859 doses). Além disso, `executeStepIA` falha ao disparar a baixa (`AUD-006`) e `deductGeneticInventoryForSemenBatch` usa `Date.now()` na chave idempotente e ignora erros de RPC (`AUD-007`).
- **Consistência IATF (`FAIL`):** Embora não haja divergência de `pregnancy_status` quando ambos existem (`lot_animals_vs_animal_managements_dg_mismatch = 0`), **`1.204` de `1.966` vínculos em `iatf_lot_animals` não têm registro correspondente em `animal_managements`** (agravado por `AUD-006`), há **`2` `management_events` órfãos** (sem `lot_id` e `farm_id`) e **`2` códigos de lote duplicados** na mesma fazenda/estação (`AUD-015`).
- **Confiabilidade Offline (`FAIL`):** Múltiplos bugs no `SyncEngine` impedem o flush seguro de `iatf_lot_animals`, `animals` e `animal_managements` na volta ao modo online (`AUD-008`).
- **Backups e Disaster Recovery:** Não há evidência no repositório nem via MCP da configuração de backup automatizado, retenção ou teste de restore/PITR do Supabase.

---

## 9. Performance e observabilidade

- **Método e limites:** Avaliação somente leitura via `get_advisors(performance)`, `get_advisors(health)`, consulta a `pg_indexes` / `query_logs` (últimas 24h) e inspeção estática do código-fonte. Medições dinâmicas em runtime (bundle size, TTFB, LCP) e testes de carga não foram executados.
- **Achados observados no PostgreSQL:**
  - `get_advisors(health)`: nenhum problema reportado (`lints: []`).
  - `get_advisors(performance)`: **62 chaves estrangeiras sem índice** (`unindexed_foreign_keys`), **1 política com reavaliação por linha** (`auth_rls_initplan` em `organization_members`) e **1 índice sem uso registrado** (`idx_gen_mov_transfer`).
- **Achados observados no Cliente:**
  - `SyncStatusBadge` dispara `syncDownAllData()` automaticamente no mount com **15 queries paralelas**, incluindo leituras de até 5.000 linhas em `iatf_lot_animals` (sem filtro de `organization_id`) e `animal_managements` (`AUD-016`).
  - `db.ts` usa cache SWR em memória (`Map` com TTL de 3–5 minutos), mas páginas grandes (ex.: `lots/page.tsx` com 3.598 linhas) carregam dados pesados no cliente.
- **Observabilidade (`query_logs` 24h):** Registro de atividade básica no Supabase (`83` `edge_logs`, `14` `auth_logs`, `13` `postgres_logs`, `1` `auth_audit_logs`). Na aplicação Next.js não há logs estruturados, *correlation IDs*, *APM/error tracking* (ex.: Sentry) nem endpoint `/api/health`.

---

## 10. Itens bloqueados ou não executados

| Teste | Motivo | Aprovação/acesso necessário |
|---|---|---|
| `T-04` (`npm run build`) | Evitado para não modificar artefatos locais em `.next/` durante modo estritamente read-only | Aprovação explícita para executar build local |
| `T-14` (Testes dinâmicos autenticados no navegador) | O `.env.local` aponta diretamente para o banco operacional ativo; login e abertura do `AppShell` acionam `syncDownAllData()` e `syncNow()` | Criação de branch Supabase (staging) + conta de teste sintética |
| `T-15` (Testes ativos de IDOR/BOLA, RBAC e abuso de RPC) | Risco de alterar ou corromper dados reais de clientes/usuários no banco operacional | Branch/ambiente staging isolado com contas sintéticas por perfil (`admin`, `veterinarian`, `operator`) |
| `T-16` (E2E completo D0→D9→IA→DG, estoque e offline→sync) | Requer operações de escrita e simulação de fila offline sincronizada | Branch/ambiente staging isolado com fazenda/lote de teste |
| `T-18` (Suíte automatizada de testes) | Inexistente no projeto (`0` arquivos de teste) | Autorização para estruturar suíte em MODO B |
| Auditoria de Backup/Restore, Hosting, CDN e DNS | Não exposto no repositório Git nem nas ferramentas MCP disponíveis | Acesso ao painel/configuração do provedor de hospedagem e política de backup do Supabase |

---

## 11. Plano de correção priorizado

| Ordem | Achados | Dependências | Critério de aceite | Risco de regressão |
|---|---|---|---|---|
| **Lote 0 — Contenção Emergencial (Segurança DB/Auth)** | `AUD-001`, `AUD-002`, `AUD-003`, `AUD-005`, `AUD-014` | Nenhuma (prioridade máxima; testar em branch staging antes de aplicar) | 1) `REVOKE EXECUTE` de `anon` nas 13 `SECURITY DEFINER` + validação de `auth.uid()`/tenant/role; 2) remoção de escrita direta em `auth.users` por RPC pública (mover para rota server-side protegida); 3) correção de `tenant_org_members` e fechamento/revisão de self-signup; 4) RLS multi-tenant nas 13 tabelas abertas; 5) `security_invoker = true` em `lot_stats` e `organization_metrics`; 6) filtro `status = 'active'` em `get_user_org_ids()` + RBAC; 7) `search_path` fixo, revogação de `TRUNCATE`/`TRIGGER` e Leaked Password Protection ativa; `get_advisors(security)` sem `ERROR` ou `WARN` críticos. | **Alto** (pode bloquear telas se usuários atuais não estiverem com `organization_members.status = 'active'` ou dependerem de `anon`; validar papéis antes de aplicar) |
| **Lote 1 — Supply Chain, Sessão e Segurança App** | `AUD-004`, `AUD-012`, `AUD-017` | Lote 0 (para fluxo de autenticação/equipe) | 1) Upgrade de `next` e dependências vulneráveis; 2) substituição de `xlsx@0.18.5` por lib segura ou isolamento; 3) logout limpando IndexedDB/`localStorage`/caches SW e correção do fluxo multi-aba; 4) `crypto.getRandomValues` em `generatePassword` e headers HTTP em `next.config.mjs`. | **Médio** (upgrade de Next.js/dependências e mudança de exportação Excel exigem teste completo de build e rotas) |
| **Lote 2 — Integridade de Dados & Domínio IATF/Genética** | `AUD-006`, `AUD-007`, `AUD-009`, `AUD-010`, `AUD-015` | Lote 0 + reconciliação manual dos dados negativos atuais | 1) Correção de `executeStepIA` e `executeBatchLotManagementIA` (preenchendo `farm_id`/`start_date` e checando erros); 2) reconciliação das 4 partidas negativas e das 405 doses entre `semen_batches` e criogênico + idempotência determinística + checagem de erros de RPC; 3) ajuste de `handle_new_user_onboarding` e `getCurrentOrgId()`; 4) tratamento de `TRANSFER_OUT`/`TRANSFER_IN` em `fn_process_genetic_reversal`; 5) correção dos 2 eventos órfãos, lotes duplicados, `is_genetic_hub` e população real de `genetic_audit_logs`. | **Médio/Alto** (altera regras centrais de IA, estoque e onboarding; requer testes E2E em staging) |
| **Lote 3 — Modo Curral Offline & SyncEngine** | `AUD-008` | Lote 2 | 1) `.update()` para mutações de atualização em `syncNow`; 2) remoção de `organization_id` em `iatf_lot_animals`; 3) correção de `downloadFarmDataForCurral` (`reproductive_seasons`) e `recordOfflineManagement`; 4) enfileiramento idempotente de baixa de sêmen offline e política de retry/dead-letter no UI. | **Médio** (afeta apenas fluxo offline/curral; validar ciclo completo offline→online) |
| **Lote 4 — Governança de Migrations, Performance & UX** | `AUD-011`, `AUD-013`, `AUD-016`, `AUD-018`, `AUD-019`, `AUD-020`, `AUD-021` | Lotes 0–3 estabilizados | 1) Reconciliar migrations no Git + criar branch de staging; 2) ocultar ou implementar `/import`; 3) criar índices nas FKs críticas e corrigir `auth_rls_initplan` + revisar `syncDownAllData()`; 4) alinhar timezone, corrigir warnings ESLint, Error Boundaries, zoom de acessibilidade e suíte de testes/CI. | **Baixo** (melhorias incrementais com baixo risco funcional) |

---

## 12. Conclusão

Esta auditoria verificou integralmente o código-fonte em `f:\IATF` (análise estática, tipagem TypeScript, ESLint e `npm audit`) e inspecionou o estado real do banco PostgreSQL 17 no projeto Supabase remoto `"IATF"` via Supabase MCP em modo estritamente somente leitura (`list_tables`, `list_migrations`, `list_extensions`, `list_edge_functions`, `list_branches`, `get_advisors`, consultas agregadas aos catálogos do sistema e `query_logs`).

Permanecem **não validados dinamicamente** (`BLOCKED`) os fluxos autenticados no navegador, chamadas de escrita/autorização em runtime, jornadas ponta a ponta (`D0→D9→IA→DG`, estoque criogênico e sincronização offline), build de produção (`NOT RUN`) e configurações externas de hospedagem e backup/restore.

**Este relatório não representa garantia de ausência total de defeitos**, mas fornece evidência técnica reproduzível para priorizar a contenção imediata das falhas críticas de segurança e integridade antes de qualquer exposição adicional do sistema.

---

## 13. Aprovação para próxima fase
- [ ] Auditoria aceita
- [ ] Correção autorizada para os IDs: `________________________________`
- [ ] Ambiente autorizado (ex.: criar/usar Supabase Branch staging antes de produção): `________________________________`
- [ ] Restrições adicionais: `________________________________`
