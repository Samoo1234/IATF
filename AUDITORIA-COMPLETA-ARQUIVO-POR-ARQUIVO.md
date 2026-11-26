# AUDITORIA TÉCNICA COMPLETA — LINHA POR LINHA, ARQUIVO POR ARQUIVO (IATF MASTER)

- **Data da Auditoria:** 26/11/2026 11:29 (America/Sao_Paulo)
- **Repositório / Diretório:** `f:\IATF` (`https://github.com/Samoo1234/IATF.git`)
- **Branch / Commit Auditado:** `main` @ `9340c1c` (`feat(reports): implement Ficha Relatorio Final with ExcelJS export, A4 print layout, and role-based Master Cria branding`)
- **Modo de Execução:** **Somente Leitura (MODE A — Discovery & Audit)** — nenhuma alteração foi feita em código-fonte, migrations, schema ou dados operacionais.
- **Cobertura:** **100% dos arquivos auditáveis** (configurações, middleware, PWA, layout, contextos, utilitários, tipos, 11 migrations SQL + seed + 9 documentos de arquitetura, `src/lib/db.ts` integral em 3 blocos de linhas 1–10.225, engine offline/sync, serviço de estoque criogênico, exportador ExcelJS, 23 componentes de UI e todas as 13 páginas App Router).

> [!CAUTION]
> **Veredito de Prontidão:** **NÃO APTO PARA PRODUÇÃO MULTI-TENANT SEM REMEDIAÇÃO PRÉVIA.** A auditoria confirmou brechas **CRÍTICAS** de segurança (criação/redefinição arbitrária de contas via RPC `SECURITY DEFINER`, RLS permissiva e escalação de privilégios em `organization_members`, ausência de RBAC efetivo no frontend e backend, sessão offline/cookie bypassável), **erros operacionais graves** (baixa de sêmen quebrada no manejo individual/lote, divergência entre estoque legado `semen_batches` e estoque criogênico `genetic_inventory_items`, página `/import` 100% simulada, bugs recém-introduzidos na `FichaRelatorioFinalView` e `excelFichaRelatorioExport.ts`), **divergências severas entre migrations locais e banco remoto** e **múltiplas quebras de ligação entre fluxos de trabalho**.

## Sumário
1. [Resumo Quantitativo e Mapa de Severidade](#1-resumo-quantitativo-e-mapa-de-severidade)
2. [Síntese Executiva Transversal (Os 4 Eixos da Auditoria)](#2-síntese-executiva-transversal-os-4-eixos-da-auditoria)
   - [2.1. Possíveis Brechas de Segurança (Críticas e Altas)](#21-possíveis-brechas-de-segurança-críticas-e-altas)
   - [2.2. Principais Erros e Bugs Operacionais](#22-principais-erros-e-bugs-operacionais)
   - [2.3. Principais Divergências (Schema, Migrations, Tipos, Regras, Offline vs Online)](#23-principais-divergências-schema-migrations-tipos-regras-offline-vs-online)
   - [2.4. Mapa de Falta de Ligação nos Fluxos de Trabalho](#24-mapa-de-falta-de-ligação-nos-fluxos-de-trabalho)
3. [Evidências Estáticas e Banco Remoto (ESLint, npm audit, Supabase Advisors e Drift de Migrations)](#3-evidências-estáticas-e-banco-remoto)
4. [Índice Geral Arquivo por Arquivo](#4-índice-geral-arquivo-por-arquivo)
5. [Auditoria Detalhada Arquivo por Arquivo, Linha por Linha (Lotes 01 a 11)](#5-auditoria-detalhada-arquivo-por-arquivo-linha-por-linha)

## 1. Resumo Quantitativo e Mapa de Severidade

| Severidade do Arquivo / Módulo | Quantidade de Entradas Auditadas |
|---|---:|
| **CRÍTICO** | 23 |
| **ALTO** | 21 |
| **MÉDIO** | 28 |
| **BAIXO** | 7 |
| **OK / INFORMATIVO** | 5 |
| **TOTAL DE SEÇÕES AUDITADAS** | **84** |

## 2. Síntese Executiva Transversal (Os 4 Eixos da Auditoria)

### 2.1. Possíveis Brechas de Segurança (Críticas e Altas)
1. **Criação e sequestro arbitrário de contas (`supabase/migrations/008_team_and_farm_freeze.sql`, `src/lib/db.ts`, `src/app/team/page.tsx`)**: A RPC `create_team_member_user` é `SECURITY DEFINER` sem validação de `auth.uid()`, sem checagem de role `admin` nem pertencimento à organização `p_org_id`, e ainda **sobrescreve a senha (`encrypted_password`)** de usuários já existentes em `auth.users`. Qualquer usuário (ou `anon` caso o grant não seja revogado) pode criar/tomar conta de qualquer e-mail e virar `admin` em qualquer organização.
2. **Isolamento multi-tenant quebrado em RLS e Views (`002_fix_rls_dev_policies.sql`, `001`–`010`, Supabase Advisors)**: Políticas permissivas (`USING (true)` / `WITH CHECK (true)`), `organization_members` permitindo auto-escalação de papel ou inserção arbitrária, views com comportamento `SECURITY DEFINER` e funções `SECURITY DEFINER` com `search_path` mutável e executáveis por `anon`/`authenticated`.
3. **Ausência de RBAC efetivo no Frontend e Backend (`src/middleware.ts`, `src/components/AppShell.tsx`, `src/app/team/page.tsx`, `src/lib/db.ts`)**: Nenhuma rota ou função verifica `role` (`admin`, `veterinarian`, `operator`) ou `status = 'inactive'`. Colaboradores desativados continuam autenticados e com acesso total; `operator` acessa `/team` e pode alterar papéis ou criar admins.
4. **Bypass de autenticação por cookie/sessionStorage e modo offline (`src/middleware.ts`, `src/components/AppShell.tsx`, `src/lib/offline/offlineDb.ts`)**: O `middleware.ts` permite acesso se `sb-*-auth-token` existir ou em caminhos de fallback, `AppShell` confia em `localStorage('iatf_offline_session_active')` e `sessionStorage('iatf_tab_session')`, e o logout não limpa IndexedDB (`offlineDb`) nem caches em memória, vazando dados de um tenant para outro no mesmo dispositivo.
5. **Vulnerabilidades conhecidas em dependências de produção (`package.json`, `npm audit --omit=dev`)**: **8 vulnerabilidades em produção** (1 **Critical** em `next`, 5 **High** em `xlsx`, `sharp`, `postcss`, `brace-expansion`, `source-map-js`, e 2 **Moderate** em `exceljs` e `uuid` — sendo `exceljs` recém-adicionada no commit `9340c1c`).
6. **Autorização/Branding baseada em string no cliente (`src/lib/db.ts:getCurrentUserRoleAndTenant`, `src/components/FichaRelatorioFinalView.tsx`)**: A checagem `isMasterCria` usa substring em `email` e `orgName` no cliente, sem validação server-side; além disso, `src/app/team/page.tsx` gera senhas fracas com `Math.random()` em vez de `crypto.getRandomValues()`.

### 2.2. Principais Erros e Bugs Operacionais
1. **Baixa de sêmen quebrada e dessincronizada (`src/lib/db.ts`, `src/components/AnimalManagementModal.tsx`, `src/components/BatchLotManagementModal.tsx`)**: Múltiplos caminhos de manejo individual (`saveAnimalManagement`) e em lote (`saveBatchLotManagement`) falham ou divergem ao debitar doses, alternando entre o estoque legado (`semen_batches`) e o estoque criogênico (`genetic_inventory_items`) sem transação atômica.
2. **Tela `/import` 100% simulada (`src/app/import/page.tsx`)**: Usa `setTimeout` com barra de progresso fictícia e nunca lê o arquivo Excel nem grava nenhum registro no banco, embora seja exibida no menu principal como ferramenta funcional.
3. **Estorno de transferências genéticas incorreto (`src/lib/services/geneticInventoryService.ts`)**: `reverseMovement` não trata adequadamente transferências entre botijões/canecas/clientes (origem + destino) nem protege contra estorno duplo concorrente.
4. **Bugs na recém-adicionada `FichaRelatorioFinalView.tsx` e `reports/page.tsx`**:
   - Na `FichaRelatorioFinalView.tsx`, a busca de `isMasterCria` e `produtor` pode exibir fallback hardcoded `'RAMIRO ANTÔNIO DAVI'` / `'FAZENDA SÃO LUCAS'` no Excel/tela se o campo estiver vazio.
   - `DATA I.A` e `DATA D.G` exibem sempre `ia_planned_date` / `dg_planned_date` do lote, ignorando datas reais de execução individual (`animal_managements` / `management_events`).
   - Na exportação Excel (`excelFichaRelatorioExport.ts`), a largura/mesclagem da linha 7 (`Observações`) coloca o texto em `A7:E7` (estreito) e deixa `F7:R7` vazio, podendo truncar observações longas; e o botão superior `Exportar Excel (.xlsx)` em `reports/page.tsx` não exporta a aba `ficha_final` (cai no `else` e exporta `Estoque_Semen`!).
5. **Memory/State & Race Conditions em Páginas Grandes (`src/app/lots/page.tsx`, `src/app/registries/page.tsx`, `src/app/agenda/page.tsx`, `src/app/animals/[id]/page.tsx`)**: Efeitos sem cancelamento/abort, dependências faltantes em `useEffect` (confirmadas pelo ESLint), `Math.random()` para geração de IDs temporários, e parsing de datas sujeito a deslocamento de fuso horário (`new Date().toISOString().slice(0,10)` misturado com `dateUtils.ts`).
6. **SyncEngine Offline (`src/lib/offline/syncEngine.ts`, `offlineDb.ts`)**: Fila de sincronização sem backoff/dead-letter adequado, risco de duplicação por ausência de chaves de idempotência reais em todas as mutações, limites de pull (`limit`) truncando rebanhos grandes silenciosamente e divergências de schema entre tabelas Dexie e Supabase.

### 2.3. Principais Divergências (Schema, Migrations, Tipos, Regras, Offline vs Online)
1. **Drift grave entre `supabase/migrations/` (Git) e `schema_migrations` (Banco Remoto)**: O Git possui 11 arquivos (`001` a `011`), enquanto o banco remoto registra 8 entradas com nomes/ordens diferentes (`001_initial_schema`, `002_rls_policies`, `003_lot_stats_view`, `004_triggers_and_business_rules`, `fix_management_events_rls`, `fix_all_rls_dev_policies`, `005_veterinarians`, `009_decouple_agenda_from_lots`). Migrations `006`, `007`, `008`, `010`, `011` foram aplicadas fora do histórico padrão ou divergem do Git.
2. **Dois sistemas de estoque de sêmen paralelos**: `semen_batches` (legado, ainda consumido por `reports/page.tsx`, `db.ts` e parte dos manejos) vs. `genetic_inventory_items` / `genetic_movements` (novo módulo criogênico em `/estoque-semen`). Não há reconciliação automática garantida entre os dois saldos.
3. **Documentação de Arquitetura (`DATABASE_SCHEMA.md`, `RLS_POLICIES.md`, `USER_ROLES.md`, `API_ARCHITECTURE.md`) obsoleta**: Descreve tabelas, políticas RLS, papéis (`owner`/`viewer` vs `admin`/`veterinarian`/`operator`) e endpoints API REST que não existem ou divergem do código atual (que fala direto com Supabase via client SDK).
4. **Tipos TypeScript (`src/lib/types/iatf.ts`, `genetic-inventory.ts`) vs interfaces duplicadas em `src/lib/db.ts`**: Interfaces centrais (`Animal`, `Lot`, `LotAnimal`, `SemenBatch`, etc.) estão redeclaradas com campos diferentes em `db.ts` e `types/iatf.ts`, com uso frequente de `any` / `as unknown as`.
5. **Trava de Fazenda Principal baseada em substring de nome**: `geneticInventoryService.ts` e `estoque-semen/page.tsx` detectam a fazenda principal verificando `name.toLowerCase().includes('principal')` em vez de uma coluna booleana (`is_main_farm`) no banco — renomear a fazenda quebra toda a regra de centralização de sêmen.

### 2.4. Mapa de Falta de Ligação nos Fluxos de Trabalho
| Fluxo de Trabalho | Onde Quebra / Falta Ligação | Impacto Operacional |
|---|---|---|
| **Manejo (D0 / D8 / IA / DG) → Estoque Criogênico** | `AnimalManagementModal` / `BatchLotManagementModal` / `db.ts` atualizam parcialmente `semen_batches` ou falham na integração com `genetic_inventory_items` | Saldo de botijão/caneca não reflete doses usadas no curral; risco de estoque negativo ou fantasma |
| **Relatórios (`/reports`) → Botão Superior `Exportar Excel`** | Em `src/app/reports/page.tsx`, quando `activeTab === 'ficha_final'`, o botão superior `handleExportExcel` cai no branch `else` e exporta `Estoque_Semen` em vez da Ficha Final | Usuário clica no botão principal de Excel e baixa o relatório errado |
| **Relatórios (`FichaRelatorioFinalView`) → Filtros Globais de `/reports`** | A aba `ficha_final` ignora `selectedFarmId`, `selectedSeasonId` e `selectedCategory` da barra de filtros globais de `/reports` (usa `lots` brutos) | Inconsistência visual entre os filtros selecionados no topo e os lotes/animais exibidos |
| **Menu `/import` → Banco de Dados** | `src/app/import/page.tsx` apenas simula progresso com `setTimeout` e descarta o arquivo | Fluxo de importação de planilhas totalmente desconectado do backend |
| **Gestão de Equipe (`/team`) → Sessão & Permissões** | Alterar `role` ou desativar membro (`status = 'inactive'`) não revoga sessão ativa, nem bloqueia rotas/ações no middleware ou RLS | Usuário demitido/inativado continua operando normalmente |
| **Troca de Fazenda/Estação (`FarmContext`/`SeasonContext`) → Caches & Telas** | Caches em memória (`db.ts`) e IndexedDB (`offlineDb.ts`) nem sempre invalidam ou filtram por fazenda/estação em todas as abas; eventos `iatf_farm_changed` não são ouvidos por todas as páginas | Dados da fazenda anterior piscam ou permanecem carregados após troca de contexto |
| **Logout (`Sidebar.tsx`) → Offline Storage & Outras Abas** | Logout chama `supabase.auth.signOut()` mas não limpa `offlineDb` (IndexedDB), caches de módulo em `db.ts` nem notifica outras abas | Vazamento de dados em dispositivos compartilhados e estado zumbi entre abas |
| **Congelamento de Fazenda (`freeze_farm`) → Operações de Escrita** | `freeze_farm` marca `farms.status = 'frozen'`, mas quase nenhuma operação de escrita (lotes, manejos, animais, estoque) valida se a fazenda está congelada | Fazenda congelada continua recebendo lançamentos normalmente |
| **Agenda (`/agenda`) ↔ Lotes (`/lots`) ↔ Prontuário (`/animals/[id]`)** | Ações de desacoplamento (`009_decouple_agenda_from_lots.sql`) deixaram eventos órfãos e estados de etapa (`D0`, `IA`, `DG`) que podem divergir entre `management_events`, `animal_managements` e `iatf_lot_animals` | Calendário mostra etapa pendente enquanto lote/animal já foi finalizado (ou vice-versa) |
| **Código Morto / Legado** | `src/components/Navigation.tsx` e `src/lib/mockData.ts` permanecem no repositório sem uso ativo; `/inputs` apenas redireciona para `/estoque-semen` | Manutenção confusa e risco de referência acidental a mocks |

## 3. Evidências Estáticas e Banco Remoto

### 3.1. ESLint (`npm run lint`)
- **Status:** Concluiu com **0 erros** e **3 avisos** (além do aviso de depreciação do `next lint` no Next.js 16):
  1. `src/app/lots/page.tsx:763:6` — `react-hooks/exhaustive-deps` (dependência faltante `handleSelectLot`)
  2. `src/components/FichaRelatorioFinalView.tsx:374:15` — `@next/next/no-img-element` (`<img>` usado para renderização base64 de impressão)
  3. `src/components/genetic-inventory/AnimalGeneticLookupModal.tsx:46:6` — `react-hooks/exhaustive-deps` (dependência faltante `handleSearch`)

### 3.2. Auditoria de Dependências de Produção (`npm audit --omit=dev`)
- **Resumo:** `{'info': 0, 'low': 0, 'moderate': 2, 'high': 5, 'critical': 1, 'total': 8}`

| Pacote | Severidade | Faixa Afetada | Correção Disponível |
|---|---|---|---|
| `brace-expansion` | **HIGH** | `<=1.1.20` | `Sim` |
| `exceljs` | **MODERATE** | `>=3.5.0` | `{'name': 'exceljs', 'version': '3.4.0', 'isSemVerMajor': True}` |
| `next` | **CRITICAL** | `<=16.3.0-preview.10` | `Sim` |
| `postcss` | **HIGH** | `<=8.5.22` | `Sim` |
| `sharp` | **HIGH** | `<=0.35.5-rc.1` | `Sim` |
| `source-map-js` | **HIGH** | `1.0.0 - 1.2.1` | `Sim` |
| `uuid` | **MODERATE** | `<11.1.1` | `{'name': 'exceljs', 'version': '3.4.0', 'isSemVerMajor': True}` |
| `xlsx` | **HIGH** | `*` | `Não` |

### 3.3. Supabase Advisors ao Vivo (Projeto `skjllqqdhtbrwspwxgqe` — Somente Leitura)
#### Security Advisors
| Nível | Regra | Título | Descrição |
|---|---|---|---|
| **ERROR** | `security_definer_view` | Security Definer View | Detects views defined with the SECURITY DEFINER property. These views enforce Postgres permissions and row level security policies (RLS) of the view creator, rather than that of the querying user |
| **WARN** | `function_search_path_mutable` | Function Search Path Mutable | Detects functions where the search_path parameter is not set. |
| **WARN** | `anon_security_definer_function_executable` | Public Can Execute SECURITY DEFINER Function | Detects `SECURITY DEFINER` functions that are callable without signing in. Revoke `EXECUTE`, switch the function to `SECURITY INVOKER`, or move it out of your exposed API schema if it is not meant to be public. |
| **WARN** | `authenticated_security_definer_function_executable` | Signed-In Users Can Execute SECURITY DEFINER Function | Detects `SECURITY DEFINER` functions that are callable by signed-in users. Revoke `EXECUTE`, switch the function to `SECURITY INVOKER`, or move it out of your exposed API schema if signed-in users should not call it. |
| **WARN** | `auth_leaked_password_protection` | Leaked Password Protection Disabled | Leaked password protection is currently disabled. |

#### Performance Advisors
| Nível | Regra | Título | Descrição |
|---|---|---|---|
| **INFO** | `unindexed_foreign_keys` | Unindexed foreign keys | Identifies foreign key constraints without a covering index, which can impact database performance. |
| **WARN** | `auth_rls_initplan` | Auth RLS Initialization Plan | Detects if calls to \`current_setting()\` and \`auth.<function>()\` in RLS policies are being unnecessarily re-evaluated for each row |
| **INFO** | `unused_index` | Unused Index | Detects if an index has never been used and may be a candidate for removal. |

### 3.4. Drift de Migrations (Git vs. Supabase Remoto)
- **Migrations no Git (`supabase/migrations/`):** `001` a `011` (11 arquivos) + `supabase/seed.sql`.
- **Migrations registradas no Supabase Remoto (`list_migrations`):** `001_initial_schema`, `002_rls_policies`, `003_lot_stats_view`, `004_triggers_and_business_rules`, `fix_management_events_rls`, `fix_all_rls_dev_policies`, `005_veterinarians`, `009_decouple_agenda_from_lots` (8 registros).
- **Divergência confirmada:** Os arquivos `002`–`004`, `006`, `007`, `008`, `010` e `011` do repositório não correspondem 1:1 ao histórico de migrations aplicado no banco remoto.

## 4. Índice Geral Arquivo por Arquivo

| Lote | Arquivo / Escopo | Status |
|---:|---|---|
| 01 | `package.json` | **CRÍTICO** |
| 01 | `next.config.mjs` | **MÉDIO** |
| 01 | `tsconfig.json` | **OK / INFORMATIVO** |
| 01 | `eslint.config.mjs` | **OK / INFORMATIVO** |
| 01 | `postcss.config.mjs` | **OK / INFORMATIVO** |
| 01 | `.env.example` | **BAIXO** |
| 01 | `.gitignore` | **BAIXO** |
| 01 | `public/manifest.json` | **OK / INFORMATIVO** |
| 01 | `public/sw.js` | **ALTO** |
| 01 | `src/middleware.ts` | **CRÍTICO** |
| 01 | `src/app/layout.tsx` | **MÉDIO** |
| 01 | `src/app/globals.css` | **ALTO** |
| 01 | `src/context/FarmContext.tsx` | **ALTO** |
| 01 | `src/context/SeasonContext.tsx` | **ALTO** |
| 01 | `src/context/ThemeContext.tsx` | **MÉDIO** |
| 01 | `src/lib/supabase/client.ts` | **MÉDIO** |
| 01 | `src/lib/supabase/server.ts` | **MÉDIO** |
| 01 | `src/lib/dateUtils.ts` | **MÉDIO** |
| 01 | `src/lib/mockData.ts` | **MÉDIO** |
| 01 | `src/lib/types/iatf.ts` | **ALTO** |
| 01 | `src/lib/types/genetic-inventory.ts` | **BAIXO** |
| 02 | `supabase/migrations/001_initial_schema.sql` | **CRÍTICO** |
| 02 | `supabase/migrations/002_fix_rls_dev_policies.sql` | **CRÍTICO** |
| 02 | `supabase/migrations/003_add_farm_id_to_lot_stats.sql` | **CRÍTICO** |
| 02 | `supabase/migrations/004_reproductive_seasons_mgmt.sql` | **CRÍTICO** |
| 02 | `supabase/migrations/005_veterinarians.sql` | **CRÍTICO** |
| 02 | `supabase/migrations/006_animal_managements.sql` | **CRÍTICO** |
| 02 | `supabase/migrations/007_genetic_inventory_module.sql` | **CRÍTICO** |
| 02 | `supabase/migrations/008_team_and_farm_freeze.sql` | **CRÍTICO** |
| 02 | `supabase/migrations/009_decouple_agenda_from_lots.sql` | **MÉDIO** |
| 02 | `supabase/migrations/010_fix_dashboard_metrics_and_lot_stats.sql` | **CRÍTICO** |
| 02 | `supabase/migrations/011_clean_registries_and_active_season.sql` | **ALTO** |
| 02 | `supabase/seed.sql` | **MÉDIO** |
| 02 | `DATABASE_SCHEMA.md` | **ALTO** |
| 02 | `RLS_POLICIES.md` | **CRÍTICO** |
| 02 | `BUSINESS_RULES.md` | **ALTO** |
| 02 | `USER_ROLES.md` | **ALTO** |
| 02 | `CALCULATIONS.md` | **MÉDIO** |
| 02 | `API_ARCHITECTURE.md` | **BAIXO** |
| 02 | `DOMAIN_MODEL.md` | **MÉDIO** |
| 02 | `MODULES.md` | **MÉDIO** |
| 02 | `IMPORT_MAPPING.md` | **ALTO** |
| 03 | `src/lib/db.ts` | **CRÍTICO** |
| 06 | `src/lib/offline/offlineDb.ts` | **ALTO** |
| 06 | `src/lib/offline/syncEngine.ts` | **CRÍTICO** |
| 06 | `src/lib/services/geneticInventoryService.ts` | **CRÍTICO** |
| 06 | `src/lib/excelFichaRelatorioExport.ts` | **MÉDIO** |
| 07 | `src/components/AppShell.tsx` | **CRÍTICO** |
| 07 | `src/components/Header.tsx` | **MÉDIO** |
| 07 | `src/components/Sidebar.tsx` | **ALTO** |
| 07 | `src/components/Navigation.tsx` | **MÉDIO** |
| 07 | `src/components/PWAInstallPrompt.tsx` | **MÉDIO** |
| 07 | `src/components/PWARegistration.tsx` | **BAIXO** |
| 07 | `src/components/ThemeToggle.tsx` | **BAIXO** |
| 07 | `src/components/offline/CurralPrepModal.tsx` | **MÉDIO** |
| 07 | `src/components/offline/SyncStatusBadge.tsx` | **MÉDIO** |
| 07 | `src/components/AnimalManagementModal.tsx` | **ALTO** |
| 07 | `src/components/BatchLotManagementModal.tsx` | **CRÍTICO** |
| 08 | `src/components/genetic-inventory/AnimalGeneticLookupModal.tsx` | **MÉDIO** |
| 08 | `src/components/genetic-inventory/CanisterVisualMap.tsx` | **MÉDIO** |
| 08 | `src/components/genetic-inventory/ClientsView.tsx` | **MÉDIO** |
| 08 | `src/components/genetic-inventory/GeneticDashboardView.tsx` | **MÉDIO** |
| 08 | `src/components/genetic-inventory/InventoryTableView.tsx` | **MÉDIO** |
| 08 | `src/components/genetic-inventory/MovementWizard.tsx` | **CRÍTICO** |
| 08 | `src/components/genetic-inventory/MovementsLedgerView.tsx` | **ALTO** |
| 08 | `src/components/genetic-inventory/ReceiptViewerModal.tsx` | **MÉDIO** |
| 08 | `src/components/genetic-inventory/ReceiptsView.tsx` | **MÉDIO** |
| 08 | `src/components/genetic-inventory/ReportsView.tsx` | **MÉDIO** |
| 08 | `src/components/genetic-inventory/TanksView.tsx` | **MÉDIO** |
| 09 | `src/app/page.tsx` | **ALTO** |
| 09 | `src/app/login/page.tsx` | **ALTO** |
| 09 | `src/app/team/page.tsx` | **CRÍTICO** |
| 09 | `src/app/import/page.tsx` | **CRÍTICO** |
| 09 | `src/app/inputs/page.tsx` | **OK / INFORMATIVO** |
| 09 | `src/app/protocols/page.tsx` | **MÉDIO** |
| 09 | `src/app/estoque-semen/page.tsx` | **ALTO** |
| 09 | `src/app/reports/page.tsx` | **CRÍTICO** |
| 09 | `src/components/FichaRelatorioFinalView.tsx` | **CRÍTICO** |
| 09 | `src/components/masterCriaLogoBase64.ts` | **BAIXO** |
| 10 | `src/app/agenda/page.tsx` | **ALTO** |
| 10 | `src/app/animals/page.tsx` | **ALTO** |
| 10 | `src/app/animals/[id]/page.tsx` | **CRÍTICO** |
| 11 | `src/app/lots/page.tsx` | **ALTO** |
| 11 | `src/app/registries/page.tsx` | **ALTO** |

## 5. Auditoria Detalhada Arquivo por Arquivo, Linha por Linha

> A seguir constam os relatórios integrais de cada um dos 11 lotes auditados, preservando todas as referências de arquivo e número de linha (`Lxxx`).

---

### Lote 01 — Config, Middleware, PWA, Layout, Contexts, Tipos e Utilitários

### Relatório de Auditoria Técnica — Lote 01
**Escopo:** Config, Middleware, PWA, Layout, Contexts, Tipos e Utilitários (21 arquivos)  
**Modo:** Somente leitura, baseado 100% em evidências de código-fonte.

---

#### Resumo Executivo do Lote 01

| Status | Quantidade | Arquivos |
|---|---|---|
| **CRÍTICO** | 2 | `package.json`, `src/middleware.ts` |
| **ALTO** | 5 | `public/sw.js`, `src/app/globals.css`, `src/context/FarmContext.tsx`, `src/context/SeasonContext.tsx`, `src/lib/types/iatf.ts` |
| **MÉDIO** | 7 | `next.config.mjs`, `src/app/layout.tsx`, `src/context/ThemeContext.tsx`, `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/lib/dateUtils.ts`, `src/lib/mockData.ts` |
| **BAIXO** | 3 | `.env.example`, `.gitignore`, `src/lib/types/genetic-inventory.ts` |
| **OK / INFORMATIVO** | 4 | `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`, `public/manifest.json` |

---

#### Análise Detalhada Arquivo por Arquivo

##### 1. `package.json`
- **Arquivo**: `package.json` — 37 linhas — Manifesto de dependências e scripts npm do projeto Next.js 15.
- **Status**: `CRÍTICO`
- **Erros e Bugs**:
  - `package.json:L5-L10`: Ausência de scripts de validação automatizada (`typecheck` / `tsc --noEmit` e `test`), impedindo gate básico de regressão em CI/build.
- **Divergências**:
  - `package.json:L16, L23`: Duas bibliotecas distintas para manipulação de planilhas Excel (`exceljs` `^4.4.0` e `xlsx` `^0.18.5`) coexistem no projeto (`exceljs` usada em `src/lib/excelFichaRelatorioExport.ts:L1`, enquanto `xlsx` é usada em `src/app/reports/page.tsx:L46`, `src/components/genetic-inventory/ReportsView.tsx:L15` e `src/lib/services/geneticInventoryService.ts:L20`), aumentando bundle client-side e superfície de risco.
- **Falta de Ligação nos Fluxos de Trabalho**:
  - Nenhum achado relevante além da ausência de scripts de teste/typecheck.
- **Possíveis Brechas de Segurança**:
  - `package.json:L18`: `"next": "^15.1.7"` — A versão `15.1.7` (se instalada sem atualização para `>=15.2.3`) é vulnerável à **CVE-2025-29927** (bypass completo de `src/middleware.ts` via cabeçalho HTTP `x-middleware-subrequest`), impactando diretamente o controle de autenticação das rotas protegidas.
  - `package.json:L23`: `"xlsx": "^0.18.5"` — Versão legada do SheetJS com vulnerabilidades conhecidas de alto impacto (Prototype Pollution — GHSA-4r6h-8v6p-xvw6 e ReDoS — GHSA-5pgg-2g8v-p4x9), sem correção no registro npm público para o pacote `xlsx`.

---

##### 2. `next.config.mjs`
- **Arquivo**: `next.config.mjs` — 6 linhas — Configuração do runtime e build do Next.js.
- **Status**: `MÉDIO`
- **Erros e Bugs**:
  - Nenhum achado relevante.
- **Divergências**:
  - Nenhum achado relevante.
- **Falta de Ligação nos Fluxos de Trabalho**:
  - `next.config.mjs:L2-L4`: Não configura `headers()` com `Cache-Control: no-cache, no-store, must-revalidate` para `/sw.js`, o que pode atrasar a detecção de atualizações do Service Worker em navegadores/CDNs que aplicam cache heurístico em arquivos de `public/`.
- **Possíveis Brechas de Segurança**:
  - `next.config.mjs:L2-L4`: Ausência total de cabeçalhos HTTP de segurança (`Content-Security-Policy`, `X-Frame-Options` / `frame-ancestors`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Strict-Transport-Security`, `Permissions-Policy`), deixando a aplicação exposta a clickjacking, MIME sniffing e ausência de defesa em profundidade contra XSS.

---

##### 3. `tsconfig.json`
- **Arquivo**: `tsconfig.json` — 27 linhas — Configuração do compilador TypeScript.
- **Status**: `OK / INFORMATIVO`
- **Erros e Bugs**:
  - Nenhum achado relevante (`strict: true` habilitado em `L7`, `isolatedModules: true` em `L13`).
- **Divergências**:
  - Nenhum achado relevante.
- **Falta de Ligação nos Fluxos de Trabalho**:
  - Nenhum achado relevante.
- **Possíveis Brechas de Segurança**:
  - Nenhum achado relevante.

---

##### 4. `eslint.config.mjs`
- **Arquivo**: `eslint.config.mjs` — 16 linhas — Configuração Flat Config do ESLint com presets do Next.js e TypeScript.
- **Status**: `OK / INFORMATIVO`
- **Erros e Bugs**:
  - Nenhum achado relevante.
- **Divergências**:
  - Nenhum achado relevante.
- **Falta de Ligação nos Fluxos de Trabalho**:
  - `eslint.config.mjs:L12-L14`: Não declara `ignores` explícitos para `.next/**` ou `public/sw.js` (funciona via `next lint`, mas pode gerar falsos positivos se `eslint` for invocado diretamente).
- **Possíveis Brechas de Segurança**:
  - Nenhum achado relevante.

---

##### 5. `postcss.config.mjs`
- **Arquivo**: `postcss.config.mjs` — 7 linhas — Configuração do PostCSS para Tailwind CSS v4.
- **Status**: `OK / INFORMATIVO`
- **Erros e Bugs**:
  - Nenhum achado relevante.
- **Divergências**:
  - Nenhum achado relevante.
- **Falta de Ligação nos Fluxos de Trabalho**:
  - Nenhum achado relevante.
- **Possíveis Brechas de Segurança**:
  - Nenhum achado relevante.

---

##### 6. `.env.example`
- **Arquivo**: `.env.example` — 6 linhas — Template de variáveis de ambiente exigidas pela aplicação.
- **Status**: `BAIXO`
- **Erros e Bugs**:
  - Nenhum achado relevante.
- **Divergências**:
  - `.env.example:L6`: Declara `NEXT_PUBLIC_ORG_ID`, porém nenhuma linha em `src/` referencia `NEXT_PUBLIC_ORG_ID` (a resolução multi-tenant atual é dinâmica via usuário autenticado em `src/lib/db.ts`). A variável é obsoleta e pode induzir operadores a acreditarem que o tenant é fixado por variável de ambiente.
- **Falta de Ligação nos Fluxos de Trabalho**:
  - `.env.example:L6`: Variável de ambiente órfã sem consumidor no código.
- **Possíveis Brechas de Segurança**:
  - Nenhum achado relevante (contém apenas valores placeholder).

---

##### 7. `.gitignore`
- **Arquivo**: `.gitignore` — 39 linhas — Regras de exclusão do controle de versão Git.
- **Status**: `BAIXO`
- **Erros e Bugs**:
  - Nenhum achado relevante.
- **Divergências**:
  - Nenhum achado relevante.
- **Falta de Ligação nos Fluxos de Trabalho**:
  - Nenhum achado relevante.
- **Possíveis Brechas de Segurança**:
  - `.gitignore:L27-L28`: Ignora `.env*.local` e `.env`, mas não ignora `.env.production`, `.env.development` ou `.env.staging` (sem sufixo `.local`). Caso alguém crie esses arquivos com chaves reais, eles podem ser commitados acidentalmente.

---

##### 8. `public/manifest.json`
- **Arquivo**: `public/manifest.json` — 38 linhas — Manifesto PWA (nome, ícones, cores e modo standalone).
- **Status**: `OK / INFORMATIVO`
- **Erros e Bugs**:
  - Nenhum achado relevante (todos os 4 arquivos de ícone referenciados em `L14, L20, L26, L32` foram confirmados existentes em `public/icons/`).
- **Divergências**:
  - `public/manifest.json:L31-L35`: Inclui `apple-touch-icon.png` (180x180) na lista `icons` do Web App Manifest sem atributo `purpose`; inofensivo, porém redundante pois iOS utiliza a tag `apple-touch-icon` já definida em `src/app/layout.tsx:L22-L24`.
- **Falta de Ligação nos Fluxos de Trabalho**:
  - Nenhum achado relevante.
- **Possíveis Brechas de Segurança**:
  - Nenhum achado relevante.

---

##### 9. `public/sw.js`
- **Arquivo**: `public/sw.js` — 99 linhas — Service Worker PWA responsável por precache, navegação offline e estratégia Stale-While-Revalidate de assets.
- **Status**: `ALTO`
- **Erros e Bugs**:
  - `public/sw.js:L4, L15-L17, L63`: `STATIC_PRECACHE` inclui `'/'`. Como `/` é uma rota protegida por `src/middleware.ts:L26-L30`, se o Service Worker for instalado antes do login (por exemplo, enquanto o usuário visita `/login`), `cache.add('/')` segue o redirect 307 e armazena o HTML da tela `/login` sob a chave `'/'`. Posteriormente, quando o operador estiver autenticado e entrar em modo offline, o fallback `caches.match('/')` (`L63`) servirá a tela de login em vez do shell da aplicação.
  - `public/sw.js:L82-L96`: No bloco Stale-While-Revalidate, o `.catch(() => cachedResponse)` em `L93` retorna `undefined` quando o recurso ainda não está em cache e o dispositivo está offline. `return cachedResponse || fetchPromise` (`L95`) faz `event.respondWith()` receber `Promise<undefined>`, o que lança `TypeError` no Service Worker em vez de retornar uma `Response` de erro válida (ex.: `Response.error()` ou `new Response('', { status: 503 })`).
  - `public/sw.js:L73-L97`: Não verifica `request.method === 'GET'` antes de executar `cache.put(request, responseClone)` (`L88`). Qualquer requisição não-GET com `destination` correspondente lançaria exceção assíncrona no `cache.put`.
- **Divergências**:
  - `public/sw.js:L43`: O bypass de API usa `url.origin.includes('supabase.co')`. Caso o ambiente utilize domínio customizado do Supabase ou instância self-hosted, esse filtro falha.
- **Falta de Ligação nos Fluxos de Trabalho**:
  - `public/sw.js:L48-L59`: Não há listener de `message` (ex.: `CLEAR_CACHE`) acionado no logout (`signOut`) para expurgar páginas HTML cacheadas da sessão anterior.
- **Possíveis Brechas de Segurança**:
  - `public/sw.js:L48-L67`: Cacheia respostas HTML de rotas autenticadas (`request.mode === 'navigate'`) em `CACHE_NAME` sem checar cabeçalhos `Cache-Control: private` / `no-store` e sem limpar o cache ao encerrar sessão. Em dispositivos compartilhados no curral (múltiplos operadores ou organizações), um usuário seguinte em modo offline pode receber HTML cacheado de uma sessão anterior.

---

##### 10. `src/middleware.ts`
- **Arquivo**: `src/middleware.ts` — 106 linhas — Middleware Next.js de proteção de rotas e renovação de sessão Supabase SSR.
- **Status**: `CRÍTICO`
- **Erros e Bugs**:
  - `src/middleware.ts:L66-L68`: `await supabase.auth.getUser()` não possui bloco `try/catch`. Em caso de timeout ou indisponibilidade temporária do endpoint Auth do Supabase (ou erro de rede), uma exceção não tratada derruba o middleware com erro HTTP 500 em todas as rotas autenticadas.
  - `src/middleware.ts:L42-L43`: Fallback silencioso para `'https://placeholder.supabase.co'` e `'placeholder-anon-key'` quando as variáveis de ambiente estão ausentes. Isso oculta falhas de deploy/configuração e provoca falha de rede em `getUser()` (`L68`).
  - `src/middleware.ts:L55-L60`: Ao setar cookies de autenticação no `setAll`, sobrescreve `maxAge: undefined` sem limpar `options.expires`. Se `@supabase/ssr` preencher `expires` em `options`, o navegador continuará tratando o cookie como persistente (ou apresentará comportamento inconsistente entre browsers), anulando a intenção do código.
  - `src/middleware.ts:L26-L30, L58`: **Conflito arquitetural com o Modo Curral Offline / PWA**: forçar session cookies (`maxAge: undefined`) faz com que, ao fechar e reabrir o PWA no celular/tablet, o navegador descarte os cookies `sb-*-auth-token`. Na reabertura, mesmo que o operador tenha sessão offline válida no `localStorage` (`AppShell.tsx:L40-L45`), o middleware intercepta a requisição (se houver sinal instável/reconexão) e redireciona imediatamente para `/login` (`L26-L30`).
- **Divergências**:
  - `src/middleware.ts:L18`: Define `const isAuthCallback = pathname.startsWith('/auth')`, mas não existe nenhuma rota `/auth` sob `src/app/` (verificado na árvore de `src/app/`). Regra órfã.
- **Falta de Ligação nos Fluxos de Trabalho**:
  - `src/middleware.ts:L70-L90`: Não preserva o caminho originalmente solicitado (ex.: `?redirectTo=...`) ao redirecionar para `/login`, perdendo o destino do usuário após autenticar.
- **Possíveis Brechas de Segurança**:
  - `src/middleware.ts` + `package.json:L18`: Com Next.js `15.1.7`, toda a barreira de autenticação implementada neste arquivo é suscetível à **CVE-2025-29927** (bypass de middleware via header `x-middleware-subrequest`).
  - `src/middleware.ts:L104`: O `matcher` exclui qualquer rota terminada em `.csv`, `.doc`, `.docx`, `.xls`, `.xlsx`, `.zip`. Caso seja adicionada qualquer rota dinâmica ou API de exportação com essas extensões no path, ela passará sem autenticação pelo middleware.
  - `src/middleware.ts:L66-L92`: O middleware valida apenas autenticação (`user`), sem qualquer verificação de papel/autorização (RBAC) para rotas administrativas como `/team` e `/import` (que ficam dependentes apenas de verificações client-side ou RLS).

---

##### 11. `src/app/layout.tsx`
- **Arquivo**: `src/app/layout.tsx` — 80 linhas — Root Layout do App Router, metadados PWA, script anti-FOUC de tema e providers raiz.
- **Status**: `MÉDIO`
- **Erros e Bugs**:
  - `src/app/layout.tsx:L32-L33`: `maximumScale: 1, userScalable: false` no `viewport` impede zoom por pinça em dispositivos móveis — violação direta de acessibilidade (WCAG 2.1 SC 1.4.4) e prejudica leitura de tabelas densas no curral.
  - `src/app/layout.tsx:L48-L60`: O script inline lê `localStorage.getItem('iatf_theme') || 'dark'`, mas não valida se o valor está em `['dark', 'light', 'system']`. Um valor corrompido cai no ramo `else` (`light`), divergindo do fallback `'dark'` esperado.
- **Divergências**:
  - `src/app/layout.tsx:L67`: `body` usa classes utilitárias fixas `bg-slate-950 text-slate-100`, dependendo da inversão artificial de `--color-slate-950` / `--color-slate-100` em `src/app/globals.css:L46, L56` para funcionar no tema claro, em vez de usar tokens semânticos (`--background` / `--foreground`).
- **Falta de Ligação nos Fluxos de Trabalho**:
  - Nenhum achado relevante.
- **Possíveis Brechas de Segurança**:
  - `src/app/layout.tsx:L44-L64`: Uso de `dangerouslySetInnerHTML` para script inline de tema. Embora a string seja estática (sem risco direto de XSS), inviabiliza a adoção futura de uma `Content-Security-Policy` estrita (`script-src` sem `'unsafe-inline'`) sem uso de nonce/hash.

---

##### 12. `src/app/globals.css`
- **Arquivo**: `src/app/globals.css` — 291 linhas — Estilos globais Tailwind CSS v4, tokens de tema escuro/claro, scrollbars e folha de impressão.
- **Status**: `ALTO`
- **Erros e Bugs**:
  - `src/app/globals.css:L217-L226`: **Bug severo de impressão global (`@media print`)**: As regras `main > div > div:first-child`, `nth-child(2)`, `nth-child(3)`, `nth-child(4)` e `nth-child(5) > div:first-child { display: none !important; }` são aplicadas globalmente a **todas as páginas** do sistema, acopladas à estrutura DOM específica de `/reports` (`FichaRelatorioFinalView`). Ao acionar `window.print()` em qualquer outra tela (por exemplo, comprovantes em `ReceiptViewerModal`, dashboard, lotes ou estoque), esses seletores ocultam arbitrariamente os primeiros blocos de conteúdo da página, produzindo impressões quebradas ou em branco.
  - `src/app/globals.css:L45-L57, L96-L112`: A estratégia de tema claro inverte globalmente variáveis nativas do Tailwind (`--color-white: #0f172a`, `--color-slate-950: #f8fafc`, etc.). Para contornar botões ilegíveis (texto escuro em botão colorido), as linhas `L96-L112` aplicam seletores heurísticos frágeis que cobrem apenas `button`/`a` com classes contendo `bg-emerald-6`, `bg-rose-6`, `bg-red-6`, `bg-blue-6`, `bg-indigo-6`. Qualquer elemento `div`/`span` (badges, avatares, alertas) ou botões com tons `-500`, `-700`, `bg-amber-600`, `bg-teal-600` que usem `text-white` renderizam texto quase preto (`#0f172a`) sobre fundo colorido no modo claro.
  - `src/app/globals.css:L48`: Define `--color-slate-850: #f8fafc`, token inexistente na paleta padrão do Tailwind CSS.
- **Divergências**:
  - `src/app/globals.css:L207, L238`: A folha de impressão assume que `#printable-ficha-final` é o único alvo imprimível da aplicação, divergindo do fato de existirem outros fluxos de impressão/recibos no sistema.
- **Falta de Ligação nos Fluxos de Trabalho**:
  - Nenhum achado relevante.
- **Possíveis Brechas de Segurança**:
  - Nenhum achado relevante.

---

##### 13. `src/context/FarmContext.tsx`
- **Arquivo**: `src/context/FarmContext.tsx` — 97 linhas — Contexto global de seleção e persistência da fazenda ativa.
- **Status**: `ALTO`
- **Erros e Bugs**:
  - `src/context/FarmContext.tsx:L15-L22, L91-L96`: `createContext` é inicializado com um objeto default truthy (`L15-L22`). Por isso, a guarda `if (!context)` em `useActiveFarm()` (`L93`) **nunca é acionada** — usar o hook fora do `FarmProvider` falha silenciosamente retornando `farms: []`, `activeFarmId: null` e `loading: true` indefinidamente.
  - `src/context/FarmContext.tsx:L49-L55`: Ao verificar modo offline, testa apenas `!navigator.onLine`, ignorando o modo offline forçado (`localStorage.getItem('iatf_force_offline') === 'true'`), divergindo de `src/lib/supabase/client.ts:L8` e `src/lib/offline/syncEngine.ts:L34`. Além disso, quando `farmsList.length === 0` em modo offline, restaura `activeFarmId` (`L52`), mas `activeFarm` (`L73`) permanece `null`, deixando consumidores que leem `activeFarm.name` em estado inconsistente.
  - `src/context/FarmContext.tsx:L68-L71`: `setActiveFarmId` bloqueia apenas `id === 'all'`, mas não valida se `id` pertence à lista `farms` carregada.
- **Divergências**:
  - `src/context/FarmContext.tsx:L4`: Importa `type Farm` de `@/lib/db` (divergente de `src/lib/types/iatf.ts:L1-L8`).
- **Falta de Ligação nos Fluxos de Trabalho**:
  - `src/context/FarmContext.tsx:L33`: Dispara `window.dispatchEvent(new CustomEvent('iatf_farm_changed', { detail: { farmId } }))`, porém **nenhum arquivo no repositório escuta `iatf_farm_changed`** (evento morto).
  - `src/context/FarmContext.tsx:L64-L66`: Carrega fazendas apenas na montagem; não escuta reconexão de rede (`window` `'online'`) nem eventos de conclusão do `syncEngine` para recarregar fazendas criadas/sincronizadas após sair do modo offline.
- **Possíveis Brechas de Segurança**:
  - `src/context/FarmContext.tsx:L32, L50-L52`: `iatf_active_farm_id` persiste em `localStorage` sem limpeza em logout e sem assinatura de `supabase.auth.onAuthStateChange`. Em dispositivo compartilhado entre usuários de organizações diferentes, se o segundo usuário abrir o app offline (ou antes de `refreshFarms` concluir), o `farmId` de outro tenant armazenado no `localStorage` pode ser reutilizado como `activeFarmId`.

---

##### 14. `src/context/SeasonContext.tsx`
- **Arquivo**: `src/context/SeasonContext.tsx` — 127 linhas — Contexto global de seleção da estação de monta (safra reprodutiva) ativa.
- **Status**: `ALTO`
- **Erros e Bugs**:
  - `src/context/SeasonContext.tsx:L20-L28, L121-L126`: `createContext` recebe valor default truthy (`L20-L28`), tornando a guarda `if (!context)` em `useActiveSeason()` (`L123`) inalcançável (mesmo bug do `FarmContext`).
  - `src/context/SeasonContext.tsx:L64`: Checa apenas `!navigator.onLine` para modo offline, ignorando `iatf_force_offline === 'true'`. Quando offline com lista vazia, `activeSeasonId` é preenchido (`L67`), mas `activeSeason` (`L102`) fica `null`.
  - `src/context/SeasonContext.tsx:L87-L95`: `setAsGlobalActiveSeason` chama `selectAndPersistSeason(id)` (`L91`) e imediatamente `await refreshSeasons()` (`L92`), que chama `selectAndPersistSeason(...)` novamente (`L62`), causando atualização duplicada de estado e disparo duplo do evento `iatf_season_changed`.
  - `src/context/SeasonContext.tsx:L83-L85`: `setActiveSeasonId` não valida se `id` existe em `seasons`.
- **Divergências**:
  - Nenhum achado relevante além do descompasso no critério de offline (`L64`).
- **Falta de Ligação nos Fluxos de Trabalho**:
  - `src/context/SeasonContext.tsx:L39`: Dispara `CustomEvent('iatf_season_changed')` sem nenhum listener em toda a base de código (evento morto).
  - `src/context/SeasonContext.tsx:L79-L81`: Não reage a eventos de reconexão (`online`) nem a troca de sessão/autenticação.
- **Possíveis Brechas de Segurança**:
  - `src/context/SeasonContext.tsx:L38, L65-L67`: `iatf_active_season_id` persiste em `localStorage` sem limpeza em logout/troca de conta, permitindo reutilização indevida de `seasonId` de outra organização em cenário offline ou durante boot inicial.

---

##### 15. `src/context/ThemeContext.tsx`
- **Arquivo**: `src/context/ThemeContext.tsx` — 97 linhas — Contexto React para alternância e persistência de tema (`dark`, `light`, `system`).
- **Status**: `MÉDIO`
- **Erros e Bugs**:
  - `src/context/ThemeContext.tsx:L55, L63, L75`: Chamadas diretas a `localStorage.getItem` e `localStorage.setItem` sem `try/catch` (diferente de `src/app/layout.tsx:L47` e `src/lib/supabase/client.ts:L7`). Em ambientes com `localStorage` bloqueado ou cota excedida, lança exceção não tratada quebrando o `ThemeProvider` (raiz do app).
  - `src/context/ThemeContext.tsx:L55`: Faz type assertion `localStorage.getItem(THEME_STORAGE_KEY) as Theme` sem validar se o valor é `'dark' | 'light' | 'system'`. Um valor inválido deixa `theme` corrompido e faz `applyTheme` (`L35-L50`) aplicar `'light'` inesperadamente.
- **Divergências**:
  - Nenhum achado relevante (diferente de `FarmContext`/`SeasonContext`, aqui `createContext` usa `undefined` em `L15`, então a guarda em `L93` funciona).
- **Falta de Ligação nos Fluxos de Trabalho**:
  - Nenhum achado relevante.
- **Possíveis Brechas de Segurança**:
  - Nenhum achado relevante.

---

##### 16. `src/lib/supabase/client.ts`
- **Arquivo**: `src/lib/supabase/client.ts` — 62 linhas — Fábrica do cliente Supabase browser-side com wrapper `offlineAwareFetch` e timeout de 10s.
- **Status**: `MÉDIO`
- **Erros e Bugs**:
  - `src/lib/supabase/client.ts:L50-L51`: Fallback silencioso para `'https://placeholder.supabase.co'` e `'placeholder-anon-key'` se as env vars estiverem ausentes, mascarando erro de configuração como erro genérico de rede/timeout.
  - `src/lib/supabase/client.ts:L39-L41`: Captura qualquer `AbortError` e converte em `TypeError('Failed to fetch: Network timeout')`, mesmo quando o abort foi disparado intencionalmente pelo `init.signal` do chamador (`L30`), dificultando diagnóstico e podendo acionar falsos fallbacks offline.
  - `src/lib/supabase/client.ts:L30`: Registra listener no `init.signal` sem removê-lo no bloco `finally` (`L43-L45`); se um `AbortSignal` compartilhado for reutilizado em múltiplas requisições, listeners acumulam na memória até o abort.
- **Divergências**:
  - `src/lib/supabase/client.ts:L53-L55`: `cookieOptions: { maxAge: undefined }` força session cookie, em conflito com a persistência de sessão esperada em PWA/Modo Curral Offline após fechamento do app.
- **Falta de Ligação nos Fluxos de Trabalho**:
  - Nenhum achado relevante.
- **Possíveis Brechas de Segurança**:
  - Nenhum achado relevante (usa apenas `NEXT_PUBLIC_SUPABASE_ANON_KEY`, adequada ao cliente).

---

##### 17. `src/lib/supabase/server.ts`
- **Arquivo**: `src/lib/supabase/server.ts` — 31 linhas — Fábrica do cliente Supabase para Server Components / Server Actions / Route Handlers.
- **Status**: `MÉDIO`
- **Erros e Bugs**:
  - `src/lib/supabase/server.ts:L8-L9`: Fallback silencioso para `'https://placeholder.supabase.co'` e `'placeholder-anon-key'` quando env vars estão ausentes.
  - `src/lib/supabase/server.ts:L18-L22`: Sobrescreve `maxAge: undefined` sem limpar `options.expires`, podendo manter o cookie persistente e divergir da regra de session cookie pretendida.
- **Divergências**:
  - Nenhum achado relevante.
- **Falta de Ligação nos Fluxos de Trabalho**:
  - `src/lib/supabase/server.ts:L1-L31`: **Código morto** — nenhum arquivo em `src/` importa `@/lib/supabase/server` (toda a camada de acesso a dados roda exclusivamente no browser via `client.ts`).
- **Possíveis Brechas de Segurança**:
  - Nenhum achado relevante no arquivo isolado, porém sua não utilização indica que nenhuma operação sensível (ex.: gestão de equipe, importação em massa) utiliza validação server-side via Route Handlers/Server Actions.

---

##### 18. `src/lib/dateUtils.ts`
- **Arquivo**: `src/lib/dateUtils.ts` — 150 linhas — Utilitários centralizados de data no fuso `America/Sao_Paulo` e ordenação natural de códigos de lote.
- **Status**: `MÉDIO`
- **Erros e Bugs**:
  - `src/lib/dateUtils.ts:L82-L99` (`formatDateTimeBR`): Ao receber uma string apenas com data `'YYYY-MM-DD'` (sem hora), `new Date(dateOrStr)` (`L87`) interpreta como meia-noite UTC (`00:00:00Z`). Ao formatar em `America/Sao_Paulo` (UTC-3) nas linhas `L90-L96`, a função exibe **o dia anterior às 21:00** (ex.: `'2026-10-02'` vira `'01/10/2026 às 21:00'`). Esse é exatamente o bug de virada às 21h que o cabeçalho do módulo (`L5-L6`) e `formatDateBR` (`L65-L68`) se propõem a evitar.
  - `src/lib/dateUtils.ts:L42-L50` (`addDaysToDateString`) e `L112-L120` (`getDaysDifference`): Não validam se `month` está em `1..12` nem se `day` é válido para o mês; para strings inválidas sem números válidos, `getDaysDifference` retorna `0` silenciosamente (`L116`), o que pode ser confundido com "mesmo dia" em cálculos de manejo (D0/D9/IA/DG).
- **Divergências**:
  - `src/lib/dateUtils.ts:L134-L138` (`compareLotCodes`): Extrai o primeiro bloco numérico (`/\d+/`). Se um lote tiver prefixo numérico (ex.: `'2025 - Lote 1'` ou `'2ª IATF Lote 1'`), ordenará por `2025` ou `2` em vez do número do lote.
- **Falta de Ligação nos Fluxos de Trabalho**:
  - Nenhum achado relevante.
- **Possíveis Brechas de Segurança**:
  - Nenhum achado relevante.

---

##### 19. `src/lib/mockData.ts`
- **Arquivo**: `src/lib/mockData.ts` — 254 linhas — Conjuntos estáticos de dados fictícios/protótipo para métricas, lotes, touros, protocolos e manejos.
- **Status**: `MÉDIO`
- **Erros e Bugs**:
  - `src/lib/mockData.ts:L5, L31, L49, L67, L85, L103, L121, L139`: Inconsistência interna — `INITIAL_METRICS.active_lots` vale `7` (`L5`), mas todos os 7 lotes de `INITIAL_LOTS` estão com `status: 'concluido'`.
  - `src/lib/mockData.ts:L4`: `total_animals: 892` não corresponde nem à soma de `planned_qty` (902) nem à soma de `worked_qty` (884) dos lotes listados.
  - `src/lib/mockData.ts:L21-L22, L166`: `LOTE 01` usa `PROTOCOLO 01 (3 MANEJOS)` com `start_date: '2025-09-10'` e `ia_date: '2025-09-19'` (+9 dias), porém `INITIAL_PROTOCOLS[0]` define `IA` com `day_offset: 11` (`L166`, que resultaria em `2025-09-21`).
- **Divergências**:
  - `src/lib/mockData.ts:L1`: Único consumidor do arquivo obsoleto `src/lib/types/iatf.ts`.
- **Falta de Ligação nos Fluxos de Trabalho**:
  - `src/lib/mockData.ts:L1-L254`: **100% código morto** — nenhum arquivo em `src/` importa `mockData.ts`.
- **Possíveis Brechas de Segurança**:
  - `src/lib/mockData.ts:L18, L30, L84, L194, L229, L239`: Contém nomes próprios e nomes de propriedades aparentemente reais (`DR. SAMOEL DUARTE`, `BOI GORDO`, `MV. JOÃO SILVA`) hardcoded no repositório.

---

##### 20. `src/lib/types/iatf.ts`
- **Arquivo**: `src/lib/types/iatf.ts` — 171 linhas — Definições de interfaces TypeScript legadas do domínio IATF.
- **Status**: `ALTO`
- **Erros e Bugs**:
  - `src/lib/types/iatf.ts:L98` vs `L132`: Inconsistência dentro do próprio arquivo — `LotAnimal.pregnancy_status` usa capitalização `'Prenha' | 'Vazia' | 'Pendente'` (`L98`), enquanto `AnimalManagement.pregnancy_status` usa minúsculas `'pendente' | 'prenha' | 'vazia' | 'inconclusivo'` (`L132`).
- **Divergências**:
  - **Divergência severa com os tipos reais em `src/lib/db.ts`**:
    - `Farm` (`iatf.ts:L1-L8` vs `db.ts:L5442-L5451`): `iatf.ts` tipa `owner_name` e `technical_responsible` como `string` não-nulos e omite `status?: 'active' | 'frozen'` e `properties?: Property[]`.
    - `LotAnimal` (`iatf.ts:L89-L102` vs `db.ts:L552-L573`): Modelo completamente incompatível (`iatf.ts` usa campos achatados `tag_number`, `bull_name`, `semen_batch`, `inseminator`, `expected_parturition`; `db.ts` usa FKs `lot_id`, `animal_id`, `bull_id`, `semen_batch_id`, `inseminator_name`, `expected_parturition_date` e relações aninhadas `animals`, `bulls`, `semen_batches`).
    - `SemenBatch` (`iatf.ts:L59-L68` vs `db.ts:L2021-L2029`): `iatf.ts` declara `bull_id`, `bull_name`, `current_stock`; `db.ts` declara `supplier_central` e relação `bulls`.
    - `IATFLot`, `Protocol`, `Bull`, `ManagementEvent`, `DashboardMetrics` divergem dos equivalentes efetivamente utilizados em `src/lib/db.ts` (`LotStat`, `Protocol`, `Bull`, `ManagementEvent`, `OrgMetrics`).
- **Falta de Ligação nos Fluxos de Trabalho**:
  - `src/lib/types/iatf.ts:L1-L171`: **Código morto** — importado apenas por `src/lib/mockData.ts:L1` (que também é código morto). Mantê-lo no repositório cria fonte de verdade duplicada e enganosa para manutenção futura.
- **Possíveis Brechas de Segurança**:
  - Nenhum achado relevante.

---

##### 21. `src/lib/types/genetic-inventory.ts`
- **Arquivo**: `src/lib/types/genetic-inventory.ts` — 363 linhas — Tipagem TypeScript do módulo de estoque genético (botijões, canecas, lotes de sêmen/embriões, saldos, movimentações e recibos).
- **Status**: `BAIXO`
- **Erros e Bugs**:
  - `src/lib/types/genetic-inventory.ts:L352-L363` (`AdjustmentPayload`): Modela o tipo de ajuste usando dois booleans independentes (`isPositive: boolean` e `isLoss: boolean`) em vez de uma união discriminada (`'ADJUSTMENT_POSITIVE' | 'ADJUSTMENT_NEGATIVE' | 'LOSS'`), permitindo estados inválidos em tempo de compilação como `{ isPositive: true, isLoss: true }`. Além disso, omite o campo `occurredAt?: string`, presente nos demais payloads (`InboundPayload:L319`, `OutboundPayload:L335`, `TransferPayload:L349`).
- **Divergências**:
  - `src/lib/types/genetic-inventory.ts:L26-L37`: A interface `GeneticCenter` está duplicada em `src/lib/db.ts:L4100`, podendo divergir com a evolução do schema.
  - `src/lib/types/genetic-inventory.ts:L179-L180` vs `L223-L226`: `InventoryBalance` usa nomes de tabelas literais (`semen_tanks`, `semen_tank_canisters`), enquanto `InventoryMovement` depende de aliases específicos do PostgREST (`source_tank`, `source_canister`, `dest_tank`, `dest_canister`) — acoplamento implícito com a string `.select(...)` do serviço.
- **Falta de Ligação nos Fluxos de Trabalho**:
  - Nenhum achado relevante (ativamente utilizado em `src/app/estoque-semen/page.tsx`, `src/lib/services/geneticInventoryService.ts` e `src/components/genetic-inventory/*`).
- **Possíveis Brechas de Segurança**:
  - Nenhum achado relevante.

---

### Lote 02 — Migrations SQL, Seed e Divergências com Documentação

### Relatório de Auditoria Técnica — Lote 02: Migrations SQL, Seed e Documentação

#### Resumo Executivo do Lote

Foram auditados integralmente **21 arquivos** (11 migrations SQL, 1 arquivo de seed e 9 documentos de arquitetura/domínio/regras). Foram identificados **problemas críticos de segurança, reprodutibilidade do banco de dados e integridade transacional**:

1. **Segurança Crítica (Exposição Total Multi-Tenant + Account Takeover Global)**:
   - As migrations `002`, `004`, `005`, `006`, `007` concedem `GRANT ALL ... TO anon, authenticated, service_role` e políticas RLS `FOR ALL TO public USING (true) WITH CHECK (true)` em praticamente todas as tabelas do sistema, sem nenhuma migration de hardening posterior.
   - `008_team_and_farm_freeze.sql:L49-179` (`create_team_member_user`) é `SECURITY DEFINER`, executável por `PUBLIC`/`anon`, sem checagem de `auth.uid()` ou papel `admin`, e **sobrescreve a senha em `auth.users` de qualquer e-mail já existente no sistema inteiro** (`L79-89`) — vulnerabilidade crítica de **Account Takeover Global** e **Escalação de Privilégio**.
   - As 7 RPCs `SECURITY DEFINER` de `007` e `freeze_farm`/`unfreeze_farm` de `008` não definem `SET search_path`, não verificam `auth.uid()` nem pertencimento à organização, e permitem chamadas cross-tenant/anônimas.
   - As views `lot_stats` e `organization_metrics` (`003`, `004`, `010`) não utilizam `WITH (security_invoker = true)` e concedem `SELECT` a `anon`, bypassando RLS por padrão.
2. **Quebra Total de Reprodutibilidade das Migrations (Banco Limpo)**:
   - A execução sequencial de `001` a `011` em um banco vazio **falha** em múltiplos pontos: `iatf_lots.responsible_name` não existe em `001` (quebra `003`, `004`, `010`); `input_losses` não existe em nenhuma migration (quebra `010`); `004`, `005` e `011` inserem dados com `organization_id` hardcoded (`11111111-...` e `5dc2196a-...`) sem verificar se a organização existe em `organizations` (violação de FK).
3. **Bugs Transacionais no Motor de Estoque Genético (`007`)**:
   - `fn_process_genetic_reversal` não reverte saldos de `TRANSFER_OUT`/`TRANSFER_IN`, mas grava `REVERSAL` no livro razão, e não valida `organization_id`/`farm_id` do movimento original (IDOR).
   - `fn_process_genetic_adjustment` com `p_is_loss = true` e `p_is_positive = true` **aumenta** o saldo registrando `LOSS`.
4. **Abismo entre Documentação e Banco Real**:
   - `RLS_POLICIES.md` contém recursão infinita em `organization_members` e não corresponde em nada ao banco real; `DATABASE_SCHEMA.md`, `DOMAIN_MODEL.md`, `MODULES.md`, `USER_ROLES.md` e `IMPORT_MAPPING.md` estão severamente defasados em relação às migrations `005`..`011`.

---

#### Análise Arquivo por Arquivo

---

##### 1. `supabase/migrations/001_initial_schema.sql`
- **Arquivo**: `supabase/migrations/001_initial_schema.sql` — 208 linhas — Schema relacional inicial multi-tenant do sistema IATF.
- **Status**: `CRÍTICO`
- **Erros e Bugs**:
  - `L143-160`: A tabela `iatf_lots` possui apenas `responsible_user_id UUID` (`L155`) e **não possui** a coluna `responsible_name`. As migrations `003:L11`, `004:L40` e `010:L19` selecionam `l.responsible_name`, causando erro `column l.responsible_name does not exist` ao rodar as migrations em um banco limpo.
  - `L198-208`: Habilita RLS em 11 tabelas sem criar nenhuma `POLICY` (deny-all se executada isoladamente) e **esquece de habilitar RLS** em 4 tabelas criadas no próprio arquivo: `breeds` (`L50`), `animal_categories` (`L57`), `protocol_steps` (`L121`) e `reproductive_seasons` (`L133`).
  - `L20`, `L155`: `organization_members.user_id` e `iatf_lots.responsible_user_id` não possuem `REFERENCES auth.users(id)`, permitindo registros órfãos.
  - `L71-76`, `L90`, `L102-104`, `L116`, `L137-139`, `L156`, `L166-167`, `L171`, `L191`: Ausência de constraints `CHECK` para domínio de valores (`sex`, `status`, `reproductive_status`, `pregnancy_status`), faixas válidas de ECC (`1..5`), `end_date >= start_date` em `reproductive_seasons` e quantidades não-negativas em `semen_batches`.
  - Ausência total de índices secundários (FKs e buscas por `organization_id`, `farm_id`, `tag_number`, `lot_id`, `planned_date`) e ausência de triggers para atualização automática de `updated_at`.
  - Não cria tabelas referenciadas posteriormente em `002` e `010` (`input_losses`, `inseminator_scores`), quebrando a cadeia de migrations em `010:L108`.
- **Divergências**:
  - Vs `DATABASE_SCHEMA.md`: faltam `semen_batches.current_stock` (`DATABASE_SCHEMA.md:L129`), tabelas `medications` (`L134`), `devices` (`L143`), `input_losses` (`L256`), `audit_logs` (`L269`), colunas `protocol_steps.medication_id`/`device_id` (`L174-175`), e os 7 índices (`L287-293`).
  - Vs `BUSINESS_RULES.md`: RN-01 (`L13`) restringe duplicidade apenas a matrizes *ativas*, mas `L79` aplica `UNIQUE(organization_id, farm_id, tag_number)` irrestrito; RN-03 (`L20`) exige categoria obrigatória, mas `animals.category_id` (`L73`) é nullable.
  - Vs `RLS_POLICIES.md`: `protocol_steps` (`L121`) e `iatf_lot_animals` (`L162`) não possuem `organization_id`.
- **Falta de Ligação nos Fluxos de Trabalho**:
  - `animals.reproductive_status` (`L76`) não possui mecanismo de sincronização no banco com `iatf_lot_animals.pregnancy_status` (`L171`).
  - `semen_batches` (`L96-107`) ficou órfã/paralela após a introdução do módulo de estoque genético em `007`.
- **Possíveis Brechas de Segurança**:
  - Tabelas `breeds`, `animal_categories`, `protocol_steps` e `reproductive_seasons` permanecem sem `ENABLE ROW LEVEL SECURITY` (`L198-208`).

---

##### 2. `supabase/migrations/002_fix_rls_dev_policies.sql`
- **Arquivo**: `supabase/migrations/002_fix_rls_dev_policies.sql` — 33 linhas — Liberação permissiva de RLS e permissões para modo desenvolvimento/single-tenant.
- **Status**: `CRÍTICO`
- **Erros e Bugs**:
  - `L18-19`: Referencia `input_losses` e `inseminator_scores`, que não existem em `001` (silenciadas pelo `EXCEPTION WHEN undefined_table THEN NULL` em `L29-30`).
  - `L5-20`: Omite `breeds`, `animal_categories` e `reproductive_seasons` criadas em `001`.
- **Divergências**:
  - Contraria frontalmente `RLS_POLICIES.md` e `BUSINESS_RULES.md` (RN-02) ao remover qualquer isolamento multi-tenant.
- **Falta de Ligação nos Fluxos de Trabalho**:
  - Migration temporária de desenvolvimento versionada no fluxo principal de migrations sem nenhuma migration posterior que remova as `*_dev_policy` ou restaure o RLS multi-tenant.
- **Possíveis Brechas de Segurança**:
  - **CRÍTICO (`L25-27`)**: Executa `GRANT ALL ON TABLE %I TO anon, authenticated, service_role` e `CREATE POLICY ... FOR ALL TO public USING (true) WITH CHECK (true)` em todas as tabelas centrais (incluindo `organizations` e `organization_members`). Qualquer cliente não autenticado com a chave pública `NEXT_PUBLIC_SUPABASE_ANON_KEY` pode ler, alterar e apagar todos os dados de todos os tenants via PostgREST.

---

##### 3. `supabase/migrations/003_add_farm_id_to_lot_stats.sql`
- **Arquivo**: `supabase/migrations/003_add_farm_id_to_lot_stats.sql` — 34 linhas — Recriação da view `lot_stats` adicionando `farm_id`.
- **Status**: `CRÍTICO`
- **Erros e Bugs**:
  - `L11`: Referencia `l.responsible_name` em `iatf_lots`, coluna inexistente em `001_initial_schema.sql`. Quebra execução em banco limpo.
  - `L19`: Calcula `inseminated_qty` como `pregnancy_status <> 'pendente' AND pregnancy_status IS NOT NULL`, o que conta apenas matrizes **diagnosticadas** e exclui inseminadas aguardando DG.
  - `L23-24`: Calcula `pregnancy_rate` dividindo `prenha` por `pregnancy_status <> 'pendente'`, incluindo `'inconclusivo'` no denominador.
- **Divergências**:
  - `L11` diverge de `001` e `DATABASE_SCHEMA.md:L206` (`responsible_user_id`).
  - `L19` e `L23-24` divergem de `CALCULATIONS.md:L11-12` (corrigido posteriormente apenas na `010`).
- **Falta de Ligação nos Fluxos de Trabalho**:
  - `L2`: `DROP VIEW IF EXISTS lot_stats CASCADE` pode remover objetos dependentes sem recriá-los; a view inteira é descartada novamente em `004` e `010`.
- **Possíveis Brechas de Segurança**:
  - **CRÍTICO (`L4`, `L34`)**: View criada sem `WITH (security_invoker = true)` (executa com privilégios do owner/definer, bypassando RLS das tabelas base) e com `GRANT SELECT ON lot_stats TO anon, authenticated, service_role`, expondo dados de todos os lotes de todas as organizações a usuários anônimos e cross-tenant.

---

##### 4. `supabase/migrations/004_reproductive_seasons_mgmt.sql`
- **Arquivo**: `supabase/migrations/004_reproductive_seasons_mgmt.sql` — 64 linhas — Permissões em `reproductive_seasons`, seed de estação padrão e atualização da view `lot_stats`.
- **Status**: `CRÍTICO`
- **Erros e Bugs**:
  - `L16-26`: Insere registro em `reproductive_seasons` com `organization_id = '11111111-1111-1111-1111-111111111111'::uuid` sem verificar se essa organização existe em `organizations`. Como migrations rodam antes de `seed.sql` (e essa org não existe em produção), falha com erro de violação de FK (`reproductive_seasons_organization_id_fkey`).
  - `L7-8`: Cria `POLICY` em `reproductive_seasons`, mas `ALTER TABLE reproductive_seasons ENABLE ROW LEVEL SECURITY` nunca é executado (nem em `001`, nem aqui).
  - `L40`: Repete referência à coluna inexistente `l.responsible_name`.
  - `L48`, `L52-53`: Mantém os mesmos bugs de cálculo de `inseminated_qty` e `pregnancy_rate` da `003`.
- **Divergências**:
  - Mistura seed de dados de desenvolvimento (`L16-26`) dentro de migration de schema.
- **Falta de Ligação nos Fluxos de Trabalho**:
  - Falta índice único parcial por organização para garantir no máximo uma estação com `status = 'active'` (conceito assumido em `011`).
- **Possíveis Brechas de Segurança**:
  - **CRÍTICO (`L6-8`)**: `GRANT ALL ... TO anon, authenticated, service_role` + `CREATE POLICY ... FOR ALL TO public USING (true) WITH CHECK (true)` em `reproductive_seasons`.
  - **CRÍTICO (`L31`, `L64`)**: View `lot_stats` sem `security_invoker = true` + `GRANT SELECT` para `anon`.

---

##### 5. `supabase/migrations/005_veterinarians.sql`
- **Arquivo**: `supabase/migrations/005_veterinarians.sql` — 38 linhas — Criação da tabela `veterinarians` e inserção de veterinário padrão.
- **Status**: `CRÍTICO`
- **Erros e Bugs**:
  - `L27-38`: Insere veterinário padrão para `organization_id = '11111111-1111-1111-1111-111111111111'::uuid` sem checar existência em `organizations`. Quebra em banco limpo ou produção por violação de FK.
  - `L18-19`: Cria política RLS sem executar `ALTER TABLE veterinarians ENABLE ROW LEVEL SECURITY`.
  - `L9`: Não há índice único parcial `WHERE is_default = true` por `organization_id`, permitindo múltiplos veterinários marcados como padrão.
- **Divergências**:
  - Tabela `veterinarians` não está documentada em `DATABASE_SCHEMA.md`, `DOMAIN_MODEL.md`, `RLS_POLICIES.md` ou `MODULES.md`.
- **Falta de Ligação nos Fluxos de Trabalho**:
  - Nenhuma tabela operacional (`farms`, `iatf_lots`, `management_events`, `animal_managements`) possui chave estrangeira para `veterinarians(id)` — os nomes de responsáveis continuam armazenados como `VARCHAR` solto.
- **Possíveis Brechas de Segurança**:
  - **CRÍTICO (`L17-19`)**: `GRANT ALL TO anon, authenticated, service_role` + `USING (true) WITH CHECK (true)` (com RLS sequer habilitado), expondo PII (nome, CRMV, telefone, e-mail) de todas as organizações a qualquer cliente anônimo.
  - `L31-34`: Dados nominais/contato (`MV. DR. SAMOEL DUARTE`, e-mail) hardcoded na migration de schema.

---

##### 6. `supabase/migrations/006_animal_managements.sql`
- **Arquivo**: `supabase/migrations/006_animal_managements.sql` — 72 linhas — Tabela de manejo individual por animal (`animal_managements`) com etapas D0, D7/D9, IA e DG.
- **Status**: `CRÍTICO`
- **Erros e Bugs**:
  - `L14`, `L39`, `L44-45`, `L49`: Ausência de constraints `CHECK` em `cycle_number > 0`, `ecc_ia`/`ecc_dg` (`1..5`), `pregnancy_status` e `status`.
  - `L18`, `L28-32`: Existe `d7_date` (`L18`), mas não há colunas de execução para a etapa D7 (apenas `d9_executed_at`, `d9_responsible`, `d9_device_loss`, `d9_notes`).
  - `L61-72`: Não emite `GRANT` explícito (ao contrário das demais migrations), dependendo de privilégios padrão do schema `public`.
- **Divergências**:
  - Tabela completamente ausente em `DATABASE_SCHEMA.md`, `DOMAIN_MODEL.md`, `RLS_POLICIES.md` e `CALCULATIONS.md`.
  - Duplica atributos já existentes em `iatf_lot_animals` (`bull_id`, `semen_batch_id`, `inseminator_name`, `ecc_ia`, `ecc_dg`, `pregnancy_status`, `expected_parturition_date`).
- **Falta de Ligação nos Fluxos de Trabalho**:
  - **Desconexão de métricas**: `lot_stats` e `organization_metrics` (`010`) leem exclusivamente de `iatf_lot_animals` e `management_events`, ignorando totalmente `animal_managements` (inclusive `d9_device_loss` não entra em `total_device_losses`).
  - `L37`: `semen_batch_id` referencia a tabela legada `semen_batches(id)` (`001`), e não `genetic_material_batches(id)` (`007`).
  - Não há trigger sincronizando `animals.reproductive_status` ao concluir IA/DG.
- **Possíveis Brechas de Segurança**:
  - **CRÍTICO (`L66-71`)**: Política `"Dev full access to animal_managements"` `FOR ALL TO public USING (true) WITH CHECK (true)` — exposição total cross-tenant e anônima.

---

##### 7. `supabase/migrations/007_genetic_inventory_module.sql`
- **Arquivo**: `supabase/migrations/007_genetic_inventory_module.sql` — 904 linhas — Módulo completo de estoque de material genético (sêmen e embriões): 11 tabelas, livro razão, saldo materializado, botijões/canecas, nitrogênio, comprovantes, auditoria e 7 RPCs transacionais.
- **Status**: `CRÍTICO`
- **Erros e Bugs**:
  - **Bug crítico em `fn_process_genetic_reversal` (`L722-818`)**: O `IF/ELSIF` (`L762`, `L784`) trata apenas `INBOUND`, `ADJUSTMENT_POSITIVE`, `OUTBOUND`, `USAGE`, `LOSS` e `ADJUSTMENT_NEGATIVE`, **omitindo `TRANSFER_OUT` e `TRANSFER_IN`**. Estornar uma transferência não ajusta nenhum saldo, mas grava um registro `REVERSAL` (`L802-814`), dessincronizando permanentemente o livro razão do saldo materializado.
  - **Bug crítico em `fn_process_genetic_adjustment` (`L653-715`)**: Se `p_is_loss = TRUE` e `p_is_positive = TRUE`, `v_mov_type` vira `'LOSS'` (`L654`), porém `L664` (`IF NOT p_is_positive`) entra no `ELSE` (`L684`) e **credita** (soma) doses no estoque registrando tipo `LOSS`!
  - **Bug de integridade cross-tenant em `fn_process_genetic_reversal` (`L744`)**: `SELECT * INTO v_orig FROM genetic_inventory_movements WHERE id = p_movement_id` não filtra `organization_id = p_organization_id` nem `farm_id = p_farm_id`, permitindo estornar movimento de outra fazenda/organização e creditar saldo na fazenda do chamador (`L786-798`).
  - **Race condition de estorno duplo (`L744`, `L755`)**: `v_orig` não é travado com `FOR UPDATE` e não há índice único em `reversed_movement_id WHERE reversed_movement_id IS NOT NULL`; duas chamadas concorrentes podem estornar o mesmo movimento duas vezes.
  - **Race condition em idempotência (`L280-285`, `L358-365`, `L566-571`)**: Padrão check-then-insert antes do índice único `idx_gen_mov_idempotency` (`L179`) gera erro 23505 em requisições concorrentes idênticas em vez de retorno idempotente limpo.
  - **Bug em `fn_record_nitrogen_measurement` (`L851-854`)**: Não valida `organization_id`/`farm_id` no `UPDATE semen_tanks` e sobrescreve `current_nitrogen_level` mesmo quando `p_measured_at` é retroativa (anterior à última medição registrada).
  - **Bug em `fn_process_genetic_usage_iatf` (`L605`)**: Hardcode de `'SEMEN'` em `material_type`, impedindo consumo rastreável de `'EMBRYO'`.
  - **Ausência de validação de pertencimento de FKs**: As RPCs não validam se `canister_id` pertence ao `tank_id`, se `tank_id`/`batch_id`/`owner_client_id` pertencem a `farm_id`/`organization_id`, nem bloqueiam movimentações em botijões inativos ou com `deleted_at IS NOT NULL`.
- **Divergências**:
  - Módulo inteiro (11 tabelas + 7 funções) ausente de `DATABASE_SCHEMA.md`, `DOMAIN_MODEL.md`, `RLS_POLICIES.md`, `MODULES.md`, `USER_ROLES.md` e `IMPORT_MAPPING.md`.
  - Duplica/concorre com a tabela legada `semen_batches` (`001:L96`).
- **Falta de Ligação nos Fluxos de Trabalho**:
  - `genetic_audit_logs` (`L228-243`) é criada mas **nunca recebe nenhum `INSERT`** de nenhuma das 7 RPCs nem de triggers.
  - `iatf_lot_animals.semen_batch_id` (`001:L169`) e `animal_managements.semen_batch_id` (`006:L37`) apontam para `semen_batches`, desconectados de `genetic_material_batches`.
  - `genetic_inventory_movements` é descrita como "Livro Razão Imutável" (`L138`), mas não possui trigger bloqueando `UPDATE`/`DELETE`.
- **Possíveis Brechas de Segurança**:
  - **CRÍTICO (`L269`, `L343`, `L449`, `L553`, `L636`, `L731`, `L832`)**: Todas as 7 RPCs são `SECURITY DEFINER` **sem `SET search_path = public`**, **sem validação de `auth.uid()`**, **sem verificação de vínculo do usuário com `p_organization_id`** e **sem `REVOKE EXECUTE FROM PUBLIC, anon`**. Qualquer usuário anônimo ou de outro tenant pode invocar qualquer RPC manipulando estoques de qualquer organização.
  - **CRÍTICO (`L896-898`)**: `GRANT ALL ... TO anon, authenticated, service_role` e `CREATE POLICY ... FOR ALL TO public USING (true) WITH CHECK (true)` em todas as 11 tabelas — permite que qualquer pessoa anônima altere/apague inclusive `genetic_inventory_movements` (livro razão) e `genetic_audit_logs`.

---

##### 8. `supabase/migrations/008_team_and_farm_freeze.sql`
- **Arquivo**: `supabase/migrations/008_team_and_farm_freeze.sql` — 179 linhas — Congelamento de fazendas (`farms.status`), colunas extras em `organization_members` e criação direta de usuários em `auth.users`.
- **Status**: `CRÍTICO`
- **Erros e Bugs**:
  - `L76`: Chama `crypt(p_password, gen_salt('bf'))` sem garantir `CREATE EXTENSION IF NOT EXISTS pgcrypto` (e sem qualificar schema `extensions.crypt`/`extensions.gen_salt` no Supabase).
  - `L95-121`: `INSERT` direto na tabela interna `auth.users` omite colunas de token (`recovery_token`, `email_change_token_new`, `email_change`, etc.) que o Supabase GoTrue espera como `''` (não `NULL`), podendo provocar erro 500 de scan no login.
  - `L124-142`: `INSERT` manual em `auth.identities` é frágil frente a mudanças de schema do GoTrue.
  - `L6`, `L12`: Faltam constraints `CHECK` para `farms.status` (`'active'`, `'frozen'`) e `organization_members.status`.
  - `L176-177`: Retorna `SQLERRM` diretamente no JSON de resposta, expondo detalhes internos do PostgreSQL.
- **Divergências**:
  - Colunas `farms.status` e `organization_members.{display_name, email, status}` não constam em `DATABASE_SCHEMA.md`.
  - Contraria `USER_ROLES.md:L21` (apenas `admin` pode gerenciar usuários) e `API_ARCHITECTURE.md:L73` (mutações sensíveis no servidor).
- **Falta de Ligação nos Fluxos de Trabalho**:
  - `farms.status = 'frozen'` (`L29`) não é verificado por nenhuma política RLS, trigger ou RPC — fazendas congeladas continuam aceitando normalmente cadastros de animais, lotes, manejos e movimentações de estoque no banco.
  - `organization_members.status` (`L12`) não bloqueia acesso no banco quando inativo.
- **Possíveis Brechas de Segurança**:
  - **CRÍTICO — Account Takeover Global & Escalação de Privilégio (`L49-179`)**: `create_team_member_user` é `SECURITY DEFINER`, sem `SET search_path`, **sem verificar `auth.uid()`**, **sem verificar se o chamador é `admin` de `p_org_id`**, **sem validar `p_role`**, e executável por `PUBLIC`/`anon`. Pior: em `L79-89`, se `p_email` já existir em `auth.users` (de **qualquer organização**), a função **sobrescreve `encrypted_password` com `p_password` e confirma o e-mail**. Qualquer pessoa anônima pode sequestrar qualquer conta do sistema apenas sabendo o e-mail, ou se auto-promover a `admin` em qualquer `p_org_id`.
  - **CRÍTICO — IDOR em `freeze_farm` / `unfreeze_farm` (`L22-46`)**: Ambas são `SECURITY DEFINER`, sem `SET search_path`, sem verificar `auth.uid()` ou papel, e executáveis por `anon`. Qualquer cliente pode congelar ou descongelar qualquer fazenda de qualquer organização.

---

##### 9. `supabase/migrations/009_decouple_agenda_from_lots.sql`
- **Arquivo**: `supabase/migrations/009_decouple_agenda_from_lots.sql` — 27 linhas — Desacoplamento de `management_events` de `iatf_lots` para suportar agendamentos avulsos por fazenda.
- **Status**: `MÉDIO`
- **Erros e Bugs**:
  - `L4`, `L7`: Torna `lot_id` nullable e adiciona `farm_id` também nullable, sem `CHECK (lot_id IS NOT NULL OR farm_id IS NOT NULL)` — permite eventos órfãos sem lote e sem fazenda.
  - `L11`: `event_type VARCHAR(50) DEFAULT 'lote'` sem constraint `CHECK` de valores permitidos.
  - Não há trigger garantindo que, quando `lot_id IS NOT NULL`, `management_events.farm_id` coincida com `iatf_lots.farm_id`.
- **Divergências**:
  - Diverge de `DATABASE_SCHEMA.md:L237` (onde `lot_id` é `NOT NULL` e não existem `farm_id`, `title`, `event_type`) e `DOMAIN_MODEL.md:L25,L79-81`.
- **Falta de Ligação nos Fluxos de Trabalho**:
  - `010:L113-116` soma `management_events.losses_count` indiscriminadamente (incluindo eventos avulsos não-IATF) dentro de `total_device_losses`.
- **Possíveis Brechas de Segurança**:
  - Herda a política aberta `management_events_dev_policy` (`USING (true)`) de `002`.

---

##### 10. `supabase/migrations/010_fix_dashboard_metrics_and_lot_stats.sql`
- **Arquivo**: `supabase/migrations/010_fix_dashboard_metrics_and_lot_stats.sql` — 135 linhas — Limpeza de espaços em `farms.name` e recriação das views `lot_stats` e `organization_metrics`.
- **Status**: `CRÍTICO`
- **Erros e Bugs**:
  - `L19`: Seleciona `l.responsible_name` de `iatf_lots` — coluna inexistente em `001` (quebra migration limpa).
  - `L108-109`: Consulta `FROM input_losses WHERE input_type = 'Implante P4'`. A tabela `input_losses` **não existe** em nenhuma migration (`001`..`011`), quebrando a migration em banco limpo; além disso, em `DATABASE_SCHEMA.md:L260` a coluna se chama `item_type` (com valor `'implante'`), não `input_type`.
  - `L104-116`: `total_device_losses` soma `input_losses.quantity` + `management_events.losses_count`, criando risco direto de **dupla contagem** caso perdas sejam registradas nos dois locais.
  - `L27-36`, `L44-55`, `L84-93`: A cláusula `OR EXISTS (SELECT 1 FROM management_events me WHERE me.lot_id = l.id AND me.step_code = 'IA' AND me.status = 'concluido')` classifica **todas** as matrizes do lote como inseminadas (e em `pending_dg`) assim que o evento IA é concluído, mesmo animais do lote que não foram efetivamente inseminados (sem touro/sêmen/inseminador).
  - `L82`: `active_lots` filtra `l.status IN ('em_andamento', 'planejado', 'ativo')`, excluindo `'ia_concluida'` (lotes ainda ativos aguardando DG) e incluindo `'ativo'` (status não padronizado).
  - `L132-133`: `FROM lot_summary ls LEFT JOIN losses_summary los` omite organizações que ainda não têm lotes em `iatf_lots`.
- **Divergências**:
  - `input_losses.input_type` (`L108-109`) diverge de `DATABASE_SCHEMA.md:L260` (`item_type`).
  - `l.responsible_name` (`L19`) diverge de `001:L155` (`responsible_user_id`).
  - `l.status` `'ativo'` vs `'ia_concluida'` diverge de `DATABASE_SCHEMA.md:L207`.
- **Falta de Ligação nos Fluxos de Trabalho**:
  - Ignora completamente os registros de `animal_managements` (`006`) nas métricas das views `lot_stats` e `organization_metrics`.
- **Possíveis Brechas de Segurança**:
  - **CRÍTICO (`L9`, `L75`, `L78`, `L135`)**: Ambas as views `lot_stats` e `organization_metrics` são criadas sem `WITH (security_invoker = true)` e concedem `GRANT SELECT ... TO anon, authenticated, service_role`, bypassando RLS e expondo métricas/lotes de todos os tenants a usuários anônimos.

---

##### 11. `supabase/migrations/011_clean_registries_and_active_season.sql`
- **Arquivo**: `supabase/migrations/011_clean_registries_and_active_season.sql` — 48 linhas — Higienização de espaços em cadastros e ativação da estação 2026/2027 para uma organização específica.
- **Status**: `ALTO`
- **Erros e Bugs**:
  - `L22`, `L35-36`: Hardcode do UUID `'5dc2196a-cafe-4bcc-a367-8416ad85fb67'` sem checar existência em `organizations`. Em banco limpo ou ambiente de dev/staging, o `INSERT INTO reproductive_seasons` (`L35-36`) **falha com erro de FK**, quebrando a execução das migrations.
  - `L45-47`: Reatribui todos os lotes com `start_date >= '2026-08-01'` para a nova estação sem validar se pertenciam a outra estação intencionalmente.
- **Divergências**:
  - Operação pontual de dados de um cliente de produção (`Mastercriareproducao`, `L18`) misturada na pasta versionada de migrations de schema; UUID diverge do tenant de dev usado em `004`/`005`/`seed.sql`.
- **Falta de Ligação nos Fluxos de Trabalho**:
  - Faz `TRIM` retroativo (`L4-16`), mas não cria triggers/constraints para impedir novos registros com espaços nas bordas.
- **Possíveis Brechas de Segurança**:
  - `L18`, `L22`: Exposição de nome e UUID real de organização cliente de produção no código versionado.

---

##### 12. `supabase/seed.sql`
- **Arquivo**: `supabase/seed.sql` — 44 linhas — Dados iniciais de desenvolvimento (1 organização, 1 fazenda, 3 retiros, 3 raças, 2 touros).
- **Status**: `MÉDIO`
- **Erros e Bugs**:
  - **Dependência circular com migrations `004` e `005`**: `seed.sql` cria a organização `11111111-1111-1111-1111-111111111111` (`L6-8`), mas no Supabase CLI `seed.sql` executa **após** as migrations — logo `004:L16` e `005:L27` falham por FK antes que `seed.sql` rode.
  - Seed incompleto para testes ponta-a-ponta: não popula `animal_categories`, `protocols`, `protocol_steps`, `animals`, `semen_batches`, `organization_members` nem o módulo `007`.
- **Divergências**:
  - `L40-43`: Insere `bulls` com `breed_id = NULL` mesmo tendo criado `breeds` nas linhas `L32-37`.
  - `L17`: Usa string `'MV. DR. SAMOEL DUARTE'` sem vínculo relacional com `veterinarians`.
- **Falta de Ligação nos Fluxos de Trabalho**:
  - Não cria usuário autenticado/membro para testes de RBAC ou multi-tenant.
- **Possíveis Brechas de Segurança**:
  - Nenhum achado relevante além do vazamento do UUID de seed para migrations de schema (`004`, `005`).

---

##### 13. `DATABASE_SCHEMA.md`
- **Arquivo**: `DATABASE_SCHEMA.md` — 294 linhas — Especificação DDL de referência do banco PostgreSQL/Supabase.
- **Status**: `ALTO`
- **Erros e Bugs**:
  - `L6` vs `L167`, `L213`: Exige `organization_id NOT NULL` em todas as tabelas operacionais, mas `protocol_steps` e `iatf_lot_animals` no próprio DDL não têm `organization_id`.
  - `L8`: Promete soft delete (`deleted_at`), mas **nenhuma** tabela do DDL do documento define `deleted_at`.
  - `L7`: Menciona uso estrito de timezone `America/Cuiaba`, mas o DDL usa apenas `NOW()` padrão.
  - `L35`, `L206`: `user_id` e `responsible_user_id` sem FK para `auth.users(id)`.
- **Divergências**:
  - **Documentado mas ausente nas migrations**: `medications` (`L134`), `devices` (`L143`), `input_losses` (`L256`), `audit_logs` (`L269`), `semen_batches.current_stock` (`L129`), `protocol_steps.medication_id`/`device_id` (`L174-175`), e os 7 índices (`L287-293`).
  - **Presente nas migrations mas ausente no documento**: `veterinarians` (`005`), `animal_managements` (`006`), as 11 tabelas e 7 RPCs de `007`, `farms.status`, `organization_members.{display_name, email, status}` (`008`), `management_events.{farm_id, title, event_type}` (`009`), views `lot_stats` e `organization_metrics` (`003`/`004`/`010`).
  - `L260` documenta `input_losses.item_type`, mas `010:L108-109` consulta `input_type`.
- **Falta de Ligação nos Fluxos de Trabalho**:
  - Schema documentado está severamente obsoleto e induz a criação de queries contra objetos inexistentes.
- **Possíveis Brechas de Segurança**:
  - Documenta `audit_logs` (`L269`) inexistente no banco, criando falsa expectativa de rastreabilidade.

---

##### 14. `RLS_POLICIES.md`
- **Arquivo**: `RLS_POLICIES.md` — 95 linhas — Especificação das políticas Row Level Security multi-tenant.
- **Status**: `CRÍTICO`
- **Erros e Bugs**:
  - **Recursão infinita de RLS (`L45-52`)**: A política `FOR ALL` em `organization_members` consulta `SELECT organization_id FROM organization_members WHERE user_id = auth.uid() AND role = 'admin'` na própria tabela `organization_members`, causando erro PostgreSQL `42P17: infinite recursion detected in policy for relation "organization_members"`.
  - `L73-95`: O título cita `semen_batches`, mas o bloco SQL esquece de criar a política para `semen_batches`. Também omite `farms`, `properties`, `breeds`, `animal_categories`, `bulls`, `protocols`, `protocol_steps`, `reproductive_seasons`, `veterinarians`, `animal_managements` e as 11 tabelas de `007`.
  - `L32-34`: Apenas política `FOR SELECT` em `organizations` (bloqueia `INSERT`/`UPDATE`).
- **Divergências**:
  - **Divergência total com as migrations**: Nenhuma política ou função `get_user_organizations()` deste arquivo existe em `001`..`011`. O banco real usa `USING (true) WITH CHECK (true)` para `public` e `GRANT ALL TO anon`.
  - Diverge de `USER_ROLES.md`: não aplica restrição por papel (`viewer` teria permissão de escrita em todas as tabelas operacionais).
- **Falta de Ligação nos Fluxos de Trabalho**:
  - Não cobre proteção de views (`security_invoker = true`) nem de RPCs `SECURITY DEFINER`.
- **Possíveis Brechas de Segurança**:
  - **CRÍTICO**: Afirma (`L5`) que o isolamento multi-tenant é garantido pelo PostgreSQL via RLS independentemente do frontend, quando na prática o RLS está completamente desativado/aberto nas migrations.

---

##### 15. `BUSINESS_RULES.md`
- **Arquivo**: `BUSINESS_RULES.md` — 79 linhas — Regras operacionais, validações e KPIs do domínio IATF.
- **Status**: `ALTO`
- **Erros e Bugs**:
  - Nenhum erro de sintaxe; lacunas de enforcement listadas abaixo.
- **Divergências**:
  - **RN-01 (`L11-13`)**: Proíbe duplicidade apenas de matrizes *ativas*, mas `001:L79` bloqueia duplicidade inclusive com matrizes vendidas/mortas/descartadas.
  - **RN-02 (`L15-17`)**: Isolamento multi-tenant violado por `002`, `004`, `005`, `006`, `007`, `008`, `010`.
  - **RN-03 (`L19-24`)**: Categoria obrigatória, mas `animals.category_id` é nullable (`001:L73`).
  - **RN-08 (`L62-64`)**: Refere-se a baixa em `semen_batches`, desconectada do motor real de estoque (`007`).
  - **RN-09 (`L66-67`)**: Exige `input_losses`, inexistente nas migrations.
  - **RN-11 (`L78-79`)**: Exige auditoria automática em `audit_logs`, inexistente nas migrations.
- **Falta de Ligação nos Fluxos de Trabalho**:
  - RN-06 (previsão de parto +295d), RN-07 (escala ECC 1..5), RN-08 (baixa de sêmen) e RN-11 (imutabilidade/auditoria) não possuem enforcement no banco de dados.
- **Possíveis Brechas de Segurança**:
  - Quebra completa de RN-02 e ausência de RN-11 no banco real.

---

##### 16. `USER_ROLES.md`
- **Arquivo**: `USER_ROLES.md` — 32 linhas — Matriz RBAC com 7 perfis operacionais.
- **Status**: `ALTO`
- **Erros e Bugs**:
  - Nenhum erro no documento.
- **Divergências**:
  - Nenhum dos 7 perfis (`admin`, `manager`, `vet`, `tech`, `inseminator`, `operator`, `viewer`) é validado por `CHECK` em `organization_members.role` (`001:L21`) nem verificado em RLS ou RPCs (`007`, `008`).
  - Não contempla permissões para Estoque Genético (`007`), Veterinários (`005`) e Congelamento de Fazendas (`008`).
- **Falta de Ligação nos Fluxos de Trabalho**:
  - Matriz RBAC sem vínculo com o banco de dados.
- **Possíveis Brechas de Segurança**:
  - Ausência de enforcement de RBAC no backend/banco permite que `viewer` ou `anon` executem ações restritas a `admin`/`vet`.

---

##### 17. `CALCULATIONS.md`
- **Arquivo**: `CALCULATIONS.md` — 30 linhas — Fórmulas matemáticas dos indicadores reprodutivos.
- **Status**: `MÉDIO`
- **Erros e Bugs**:
  - **Inconsistência interna de denominador (`L12`, `L23`, `L26`, `L30`)**: A taxa de prenhez do lote (`L12`) e por faixa de ECC (`L30`) usa **Matrizes Diagnosticadas** no denominador, enquanto a taxa por Touro (`L23`) e por Inseminador (`L26`) usa **Total de Inseminações Realizadas** — incluindo matrizes ainda pendentes de DG, o que distorce para baixo os rankings de touros e inseminadores.
- **Divergências**:
  - `L19-20` (Taxa de Perda de Dispositivos P4) não é calculada em nenhuma view SQL (em `010:L126` existe apenas o contador absoluto).
  - Não aborda a inclusão ou exclusão de `animal_managements` (`006`).
- **Falta de Ligação nos Fluxos de Trabalho**:
  - Fórmulas `2.3` a `2.6` não possuem views ou RPCs correspondentes no banco.
- **Possíveis Brechas de Segurança**:
  - Nenhum achado relevante.

---

##### 18. `API_ARCHITECTURE.md`
- **Arquivo**: `API_ARCHITECTURE.md` — 73 linhas — Arquitetura de integração Next.js App Router + `@supabase/ssr`.
- **Status**: `BAIXO`
- **Erros e Bugs**:
  - Nenhum erro de sintaxe nos exemplos.
- **Divergências**:
  - Omite a camada offline-first (Dexie/IndexedDB) e o uso intensivo de RPCs `SECURITY DEFINER` (`007`, `008`).
  - Pressupõe (`L19`) RLS ativo protegendo consultas do browser client, o que não se verifica nas migrations.
- **Falta de Ligação nos Fluxos de Trabalho**:
  - Não documenta fluxo de sincronização offline/online nem contrato das RPCs transacionais.
- **Possíveis Brechas de Segurança**:
  - `L72-73` proíbe `SUPABASE_SERVICE_ROLE_KEY` no cliente e exige execução no servidor para mutações sensíveis, mas `create_team_member_user` (`008`) expõe mutação direta de `auth.users` como RPC pública acessível pelo cliente de navegador.

---

##### 19. `DOMAIN_MODEL.md`
- **Arquivo**: `DOMAIN_MODEL.md` — 112 linhas — Modelo de domínio, diagrama ER e ciclo de vida da matriz.
- **Status**: `MÉDIO`
- **Erros e Bugs**:
  - `L26-27`, `L83-90`: Representa `INSEMINATION` e `PREGNANCY_DIAGNOSIS` como entidades distintas 1:N de `IATF_LOT_ANIMAL`, mas no schema (`001:L162-177`) são colunas 1:1 mutáveis dentro de `iatf_lot_animals`.
  - `L16`: Diagrama ER mostra `PROPERTY ||--o{ ANIMAL`, omitindo a relação obrigatória `FARM ||--o{ ANIMAL` (`farm_id NOT NULL`, `property_id` nullable).
- **Divergências**:
  - Documenta `Medication` e `Device` (`L55-57`) que não existem no banco.
  - Omite `Veterinarian` (`005`), `AnimalManagement` (`006`), todo o módulo de Estoque Genético (`007`), congelamento de fazendas (`008`) e agenda avulsa (`009`).
- **Falta de Ligação nos Fluxos de Trabalho**:
  - `L111` cita fluxo de RESSIA/Repasse, mas não há ligação entre `animal_managements.cycle_number` (`006`) e `iatf_lots`/`iatf_lot_animals`.
- **Possíveis Brechas de Segurança**:
  - Nenhum achado relevante.

---

##### 20. `MODULES.md`
- **Arquivo**: `MODULES.md` — 75 linhas — Estrutura de módulos e rotas da aplicação.
- **Status**: `MÉDIO`
- **Erros e Bugs**:
  - Nenhum erro técnico no documento.
- **Divergências**:
  - Não reflete os módulos introduzidos nas migrations `005`..`009`: Estoque Genético completo (botijões, canecas, nitrogênio, embriões, custódia de terceiros, transferências, comprovantes e estornos), Gestão de Equipe/Congelamento de Fazendas, Veterinários e Manejos Individuais.
  - `L60` referencia associação de `medications`/`devices` inexistentes no banco; `L26` referencia perdas de implantes que dependem da tabela inexistente `input_losses`.
- **Falta de Ligação nos Fluxos de Trabalho**:
  - Documentação de navegação/módulos desatualizada frente ao schema real.
- **Possíveis Brechas de Segurança**:
  - Nenhum achado relevante.

---

##### 21. `IMPORT_MAPPING.md`
- **Arquivo**: `IMPORT_MAPPING.md` — 44 linhas — Mapeamento de colunas da planilha Excel para o banco relacional.
- **Status**: `ALTO`
- **Erros e Bugs**:
  - `L14`: Mapeia colunas da aba `CONTROLE LOTE` para `iatf_lots.actual_quantity`, `iatf_lots.pregnancies_count` e `iatf_lots.empty_count` — **nenhuma dessas 3 colunas existe** em `iatf_lots` (nem em `001`..`011`, nem em `DATABASE_SCHEMA.md`).
  - `L15`: Mapeia `DATA` da aba `CONTROLE HORARIO` apenas para `management_events.execution_date`, omitindo `planned_date` que é `NOT NULL` (`001:L184`).
  - `L13`: Mapeia `ESTAÇÃO` para `reproductive_seasons.name`, omitindo `start_date` e `end_date` que são `NOT NULL` (`001:L137-138`).
- **Divergências**:
  - `L17`: Mapeia `CONTROLE SEMEN` para a tabela legada `semen_batches` (`001`), ignorando completamente o módulo de estoque genético (`007`).
- **Falta de Ligação nos Fluxos de Trabalho**:
  - Sêmen importado segundo este documento vai para `semen_batches` e fica invisível para o módulo de botijões/canecas/saldos (`007`).
  - Não define resolução de `organization_id`, `season_id` e `protocol_id` obrigatórios na importação transacional.
- **Possíveis Brechas de Segurança**:
  - `L43`: Não especifica validação obrigatória do `organization_id` da sessão autenticada durante a importação para prevenir escrita cross-tenant (IDOR).

---

### Lote 03 — src/lib/db.ts (Parte 1: Linhas 1 a 3500)

##### Auditoria Técnica — Lote 03: `src/lib/db.ts` (Parte 1: Linhas 1 a 3500)

- **Arquivo**: `src/lib/db.ts` (linhas 1–3500 de 10225 analisadas) — Camada central de acesso a dados (Supabase/PostgreSQL + Dexie/IndexedDB offline-first), resolução de tenant (`organization_id`), cache em memória (SWR) e regras de negócio para lotes IATF, animais, agenda de manejos, sêmen, métricas e protocolos.
- **Status**: `CRÍTICO`

---

#### Erros e Bugs

1. **Mutações de `animal_managements` perdidas no reagendamento offline (`src/lib/db.ts:L1663-L1759`)**
   - **Causa raiz**: Em `rescheduleManagementEvent()` (ramo `isOffline`), as atualizações em `offlineDb.animal_managements` para `IA` (`L1663-L1670`), `DG`/`DG1`/`DG2` (`L1680-L1687`), `D9`/`D8` (`L1689-L1696`), `D7` (`L1698-L1704`) e `D0` (`L1742-L1759`) alteram apenas o IndexedDB local, sem chamar `syncEngine.enqueueMutation(...)`.
   - **Impacto**: Ao reconectar, todas as datas recalculadas em `animal_managements` nunca são sincronizadas com o Supabase, gerando divergência permanente entre agenda/lotes e manejos individuais.

2. **Falhas silenciosas e corrupção parcial em cascata no reagendamento online (`src/lib/db.ts:L1825-L2009`)**
   - **Causa raiz**: Em `rescheduleManagementEvent()` (ramo online), nenhum dos `await supabase.from(...).update(...)` subsequentes (`iatf_lots`, `animal_managements`, `iatf_lot_animals`, `management_events`) verifica `{ error }`. Além disso, `L1968-L1983` executa updates em loop sequencial `for (const m of mgmts)` (N+1 requisições HTTP sem transação/RPC).
   - **Impacto**: Se qualquer atualização intermediária falhar por rede, RLS ou constraint, a função ignora o erro e retorna `{ success: true }` (`L2009`), deixando o banco parcialmente atualizado.

3. **Exclusão forçada de animal não trata `genetic_materials` e gera mensagem inconsistente (`src/lib/db.ts:L2930-L2965`)**
   - **Causa raiz**: `deleteAnimal()` verifica vínculos em 3 tabelas (`iatf_lot_animals`, `animal_managements` e `genetic_materials.donor_id`, `L2930-L2939`). Porém: (a) a mensagem de erro em `L2947` soma `donorCount` em `totalRefs` mas só detalha `lotCount` e `mgmtCount`; (b) quando `force = true` (`L2952-L2955`), deleta `animal_managements` e `iatf_lot_animals` (sem checar `{ error }`), mas **não trata/desvincula `genetic_materials`**, podendo falhar por FK ao deletar `animals` (`L2957-L2960`).
   - **Impacto**: Falha ao excluir doadoras mesmo com `force = true` e mensagem incorreta quando o único vínculo é em `genetic_materials`.

4. **Filtro em memória após `.limit(100)` pode ocultar animais disponíveis (`src/lib/db.ts:L919-L925`)**
   - **Causa raiz**: `getAvailableAnimalsForLot()` aplica `.limit(100)` na query do Supabase (`L919`) e só depois filtra `!existingIds.has(a.id)` em memória (`L925`).
   - **Impacto**: Se os 100 primeiros animais ordenados por `tag_number` já estiverem no lote, a função retorna `[]` mesmo havendo outros animais disponíveis na fazenda.

5. **Duplicidade de matrizes no lote em modo offline (`src/lib/db.ts:L704-L745`)**
   - **Causa raiz**: `addAnimalsToLot()` offline não verifica se `animalId` já existe em `offlineDb.lot_animals` para o `lotId`; cria novo registro com UUID aleatório, enfileira `insert` e soma `animalIds.length` em `females_count` (`L742`).
   - **Impacto**: Animais duplicados no mesmo lote offline e contagem de cabeças incorreta.

6. **Ramo offline de `getLotById` e `getSemenBatches` cai no fluxo online (`src/lib/db.ts:L491-L520`, `L2033-L2052`)**
   - **Causa raiz**: Em `getLotById()`, se `isOffline === true` e `!l`, o bloco não retorna `null` e prossegue chamando `getCurrentOrgId()` e `supabase.from('lot_stats')` (`L522-L537`). Em `getSemenBatches()`, se `isOffline === true` e `offlineBatches.length === 0` (`L2036`), também prossegue para o fluxo online (`L2052`).
   - **Impacto**: Tentativas de rede desnecessárias e falhas quando o sistema está offline.

7. **Ordenação offline por `created_at` quebrada em `getAnimalsPaginated` (`src/lib/db.ts:L2344-L2359`, `L2416-L2418`, `L2558-L2573`)**
   - **Causa raiz**: `getAnimalsPaginated()` offline ordena por `created_at` (`L2416-L2418`), mas `getAnimals()` (`L2344-L2359`) e `getAnimalsPaginated()` (`L2558-L2573`) nunca gravam `created_at` no `offlineDb.animals.bulkPut()`.
   - **Impacto**: Todos os registros ficam com timestamp `0`, quebrando a ordenação cronológica offline.

8. **Fallback de erro em `getAnimals` e `getAnimalsPaginated` ignora filtros/ordenação (`src/lib/db.ts:L2300-L2305`, `L2491-L2506`)**
   - **Causa raiz**: No fallback de erro do Supabase, `getAnimals()` omite `if (!includeInactive)` (`L2300-L2305`) e `getAnimalsPaginated()` omite `status !== 'inactive'` e a ordenação (`sortBy`/`sortOrder`) antes do `.slice()` (`L2491-L2506`).
   - **Impacto**: Animais inativos reaparecem e a paginação fica fora de ordem.

9. **UUID gravado no lugar do nome de raça/categoria no IndexedDB (`src/lib/db.ts:L1187-L1188`, `L2775-L2776`)**
   - **Causa raiz**: `createAndAddAnimalToLot()` (`L1187-L1188`) e `createAnimal()` (`L2775-L2776`) gravam `category: animal.category_id` e `breed: animal.breed_id` (UUIDs) em `offlineDb.animals.put()` e omitem `breed_id`, `category_id`, `rfid_number` e `birth_date`.
   - **Impacto**: As leituras offline (`L867-L868`, `L2260-L2261`, `L2437-L2438`) exibem o UUID cru como nome de raça/categoria na interface.

10. **Falso positivo silencioso em `completeManagementEvent` offline (`src/lib/db.ts:L1372-L1393`)**
    - **Causa raiz**: Se `offlineDb.management_events.get(eventId)` não encontrar o evento, o bloco `if (ev)` é pulado e a função retorna `true` (`L1393`).
    - **Impacto**: A UI considera o manejo concluído sem salvar nem enfileirar a mutação.

11. **Verificação de duplicidade vulnerável a wildcards `ILIKE` (`src/lib/db.ts:L1086`)**
    - **Causa raiz**: `createAndAddAnimalToLot()` usa `.ilike('tag_number', cleanTag)` sem escapar `%` ou `_`.
    - **Impacto**: Brincos com `_` ou `%` podem colidir indevidamente com outros brincos.

12. **Outros bugs pontuais**:
    - `createAndAddAnimalToLot()` (`L962`) e `createAnimal()` (`L2684`) não validam se `cleanTag` está vazio.
    - `getOrgMetadata()` (`L277-L280`): em erro de rede, retorna `cachedMetadata` (que pode ser `null`) sem tentar o fallback de `offlineDb.farms` existente em `L246-L266`.
    - `getAnimalById()` (`L3034-L3039`): se `!data` sem erro de rede (registro excluído no servidor), cai para `buildOfflineAnimal()` e pode devolver registro órfão do IndexedDB.
    - `updateAnimalDG()` (`L666-L668`): `if (pregnancyStatus === 'prenha' && eccDg !== undefined)` é redundante com `L672`.

---

#### Divergências

1. **Divergência de campos entre Online e Offline (`offlineDb`)**:
   - **`iatf_lots` (`L335-L356`, `L455-L480`, `L495-L515`)**: `getLots()` online não persiste `protocol_id` nem `property_id` em `offlineDb.lots`, embora `createAndAddAnimalToLot()` offline (`L971`) leia `localLot?.property_id` e `getAnimalHistory()` offline (`L3066-L3067`) leia `lot?.protocol_id` e `lot?.property_id`. `getLotById()` offline (`L495-L515`) também omite `notes`, `protocol_id` e `diagnosed_qty`.
   - **`management_events` (`L1248-L1269`, `L1324-L1358`, `L1451-L1466`, `L1568-L1571`, `L1596-L1599`)**: `getManagementEvents()` e `insertManagementEvent()` não gravam/retornam `title`, `start_time`, `end_time`, `notes` e `farms` no IndexedDB. `updateManagementEventDate()` ignora `startTime`/`endTime` no `offlineDb`. Em `L1258`, `animals_worked_count` pode retornar `null`, divergindo da tipagem `number` da interface `ManagementEvent` (`L1217`).
   - **`semen_batches` (`L2111-L2123` vs `L2151`/`L2194`)**: `getSemenBatches()` não grava `bull_id` no `offlineDb`, ao contrário de `insertSemenBatch()`. `insertSemenBatch()` online (`L2179-L2183`) não faz `.trim()` em `batch_number`/`supplier_central`, diferente do modo offline (`L2152-L2153`).
   - **`animals` (`L2330-L2360`, `L2544-L2574`, `L2811-L2821`, `L2882-L2888`)**: `bulkPut` omite `rfid_number`, `birth_date`, `sex`, `created_at`. `updateAnimal()` offline não atualiza `birth_date` nem os nomes `breed`/`category` (mantendo nomes antigos em tela); online atualiza apenas 4 campos no Dexie.
   - **`searchAnimals` (`L2595` vs `L2634`)**: Offline limita a `20` resultados; online e fallback de erro limitam a `100`.
   - **`deleteAnimal` (`L2912-L2925` vs `L2930-L2960`)**: Offline ignora `force` e não valida/enfileira exclusão de vínculos (`iatf_lot_animals`, `animal_managements`), divergindo da proteção de rastreabilidade online.
   - **`rescheduleManagementEvent` (`L1654-L1670` vs `L1848-L1859`, `L1932-L1984`)**: Recálculo de `expected_parturition_date` (+295 dias) ao mover `IA` só existe no modo online; e ao deslocar `D0` com `shiftSubsequentSteps`, `expected_parturition_date` não é recalculado em nenhum modo.
   - **`createAnimal` (`L2690` vs `L2738`)**: Offline permite criar registro com `organization_id: ''` se `orgId` for nulo, enquanto online retorna erro.

---

#### Falta de Ligação nos Fluxos de Trabalho

1. **Invalidação de cache quebrada para `getLotById` (`src/lib/db.ts:L525`)**
   - `getLotById()` usa `cacheKey = 'lot_' + id` (singular). Todas as mutações (`L652`, `L685`, `L748`, `L780`, `L805`, `L826`, `L1048`, `L1195`, `L1391`, `L1426`, `L1764`, `L2005`, `L2839`, `L2894`, `L2919`, `L2976`) chamam `invalidateCache('lots')` (plural, `key.startsWith('lots')`).
   - **Impacto**: O cache de `getLotById` nunca é invalidado após alterações no lote, exibindo dados obsoletos por até 3 minutos.

2. **Cache de `lot_animals` não invalidado após editar/excluir animal (`src/lib/db.ts:L2837-L2839`, `L2892-L2894`, `L2917-L2919`, `L2974-L2977`)**
   - `updateAnimal()` e `deleteAnimal()` não invalidam `'lot_animals'`, mantendo dados antigos do animal nas telas de lote.

3. **IndexedDB (`offlineDb`) não sincronizado em mutações online e acúmulo de dados órfãos**:
   - `updateAnimalDG()` (`L674-L687`), `addAnimalsToLot()` (`L769-L783`), `removeAnimalFromLot()` (`L814-L828`) e `createAndAddAnimalToLot()` (`L1166-L1198`) não atualizam `offlineDb.lot_animals` no modo online.
   - `getLots()` (`L453`), `getLotAnimals()` (`L626`) e `getProtocols()` (`L3394`) fazem apenas `bulkPut` quando há resultados, nunca removendo do IndexedDB registros deletados no servidor.
   - `deleteAnimal()` (`L2914-L2915`, `L2969-L2970`) não remove `offlineDb.animal_managements` locais do animal excluído.

4. **`updateAnimalDG` incompleto para status `'prenha'` (`src/lib/db.ts:L661-L687`)**
   - Não calcula/define `expected_parturition_date` quando `pregnancyStatus === 'prenha'` e não invalida `invalidateCache('animals')`.

5. **Métricas offline sem persistência (`src/lib/db.ts:L3265-L3267`)**
   - `getOrgMetrics()` offline depende apenas de `queryCache` volátil em memória; após reload offline, retorna `null`.

6. **`clearTenantCache()` não limpa `localStorage` (`src/lib/db.ts:L74-L76`)**
   - Limpa apenas variáveis de memória, deixando `iatf_current_org_id` no `localStorage`.

7. **Omissão de `orgId` em `syncEngine.enqueueMutation`**
   - `removeAnimalFromLot` (`L800`), `completeManagementEvent` (`L1382`), `deleteManagementEvent` (`L1524`), `updateManagementEventDate` (`L1573`) e `rescheduleManagementEvent` (`L1643`, `L1657`, `L1674`, `L1716`, `L1733`) não passam `orgId` à fila de sync.

8. **`createProtocol` sem atomicidade (`src/lib/db.ts:L3478-L3500`)**
   - Insere `protocols` e `protocol_steps` em chamadas separadas sem transação/RPC (tanto online quanto na fila offline `L3456-L3467`), podendo deixar protocolos órfãos sem etapas se a segunda escrita falhar.

---

#### Possíveis Brechas de Segurança

1. **Contaminação Cross-Tenant / Herança de `organization_id` sem autenticação (`src/lib/db.ts:L151-L158`, `L208-L212`) — CRÍTICO**
   - Em `getCurrentOrgId()`, quando `!user` (sessão inexistente/expirada, `L151`) ou quando o usuário autenticado não pertence a nenhuma organização (`L208`), a função faz fallback para `localStorage.getItem('iatf_current_org_id')` e ainda coloca esse valor em `cachedOrgId` por 5 minutos.
   - Em navegadores compartilhados ou após logout/troca de conta sem limpeza de `localStorage`, o usuário herda o `organization_id` da sessão anterior.

2. **Exposição de dados do IndexedDB sem filtro de `organization_id` e sem usuário autenticado (`src/lib/db.ts:L247`, `L331`, `L364-L395`, `L419`, `L493`, `L840`, `L1236`, `L1311`, `L2035`, `L2053-L2070`, `L2089`, `L2240`, `L2301`, `L2394`, `L2492`, `L2585`, `L2640`, `L2985`, `L3313`, `L3331-L3349`, `L3373`) — ALTO**
   - Todas as leituras offline em `offlineDb` leem tabelas inteiras (`.toArray()`) ou registros por ID (`.get(id)`) sem filtrar por `organization_id`.
   - `getLots()` (`L364-L395`), `getSemenBatches()` (`L2053-L2070`) e `getProtocols()` (`L3331-L3349`) retornam dados locais do IndexedDB mesmo quando `!orgId` (usuário não autenticado).

3. **Ausência de filtro `organization_id` em queries/mutações Supabase (dependência 100% de RLS / risco de IDOR) (`src/lib/db.ts:L597-L606`, `L674-L677`, `L815-L818`, `L886-L890`, `L1067-L1073`, `L1401-L1410`, `L1534-L1538`, `L1586-L1589`, `L1775-L1779`, `L1802-L1999`, `L2862-L2865`, `L2953-L2960`, `L3021-L3032`, `L3154-L3179`) — ALTO**
   - Diversas operações de leitura, update e delete filtram apenas por `id`/`lot_id`/`animal_id` sem `.eq('organization_id', orgId)`.
   - Em `createAndAddAnimalToLot()` (`L1067-L1073`), `targetOrgId` é derivado de `lotData?.organization_id || orgId` sem validar se o `lotId` pertence à organização do usuário.
   - Em `getCurrentOrgId()` (`L177-L189`), o fallback `supabase.from('organizations').select('id').limit(1)` não filtra por usuário/proprietário, confiando integralmente na RLS.

4. **Confiança em `getSession()` local antes de `getUser()` (`src/lib/db.ts:L143-L149`) — MÉDIO**
   - `getCurrentOrgId()` lê `supabase.auth.getSession()` (JWT local sem validação remota de revogação) e mantém `cachedOrgId` em cache por 5 minutos (`L108`), permitindo que uma sessão revogada continue resolvendo o tenant no cliente.

5. **Cache global em nível de módulo (`src/lib/db.ts:L31-L54`) — BAIXO/INFORMATIVO**
   - `cachedOrgId`, `cachedMetadata`, `cachedFarms` e `queryCache` são compartilhados no escopo do módulo; seguro apenas se `db.ts` for estritamente executado em Client Components (qualquer uso em SSR/Node vazaria dados entre requisições/tenants).

---

### Lote 04 — src/lib/db.ts (Parte 2: Linhas 3501 a 7000)

### Relatório de Auditoria — Lote 04: `src/lib/db.ts` (Parte 2: Linhas 3501 a 7000)

---

##### Arquivo: `src/lib/db.ts` (Linhas 3501–7000 | 3.500 linhas analisadas)
- **Papel no sistema**: Camada de acesso a dados (DAL) híbrida online/offline (Supabase + Dexie/IndexedDB + `localStorage` + `syncEngine` + cache em memória). Este bloco cobre CRUDs de **Protocolos** (final de `createProtocol`, `updateProtocol`, `deleteProtocol`, `toggleProtocolStatus`), **Touros** (`bulls`), **Centrais Genéticas** (`genetic_centers`), **Lotes IATF** (`createLot`, `createResyncLot`, `updateLotCode`, `updateLotNotes`, `updateLotProtocol`, `deleteLot`), **Fazendas** (`farms`, `freezeFarm`/`unfreezeFarm`), **Propriedades/Retiros** (`properties`), **Raças e Categorias** (`breeds`, `animal_categories`), **Estações de Monta** (`reproductive_seasons`) e **Veterinários** (`veterinarians`, início de `createVeterinarian`).
- **Status**: `CRÍTICO`

---

##### Erros e Bugs

1. **IDs de `management_events` dessincronizados entre Supabase e IndexedDB em `createLot` online (`src/lib/db.ts:L4666-L4678` vs `L4713-L4728`)**
   - **Causa raiz**: No modo online, `createLot` insere os eventos em `management_events` no Supabase sem especificar `id` e sem `.select('id')` (e ignorando erros de insert), e logo em seguida grava os mesmos eventos no `offlineDb.management_events` gerando **novos UUIDs** (`id: crypto.randomUUID()` em `L4715`).
   - **Impacto**: Os eventos no IndexedDB ficam com IDs completamente diferentes dos registros reais no PostgreSQL. Qualquer edição/conclusão offline subsequente enviará `update` para IDs inexistentes no servidor, e o próximo pull criará eventos duplicados no IndexedDB.

2. **Fallback indiscriminado para modo offline em `createLot` (`src/lib/db.ts:L4659-L4663`, `L4737-L4741`)**
   - **Causa raiz**: Qualquer erro retornado pelo Supabase no `insert` de `iatf_lots` (incluindo violação de constraint, FK inválida, permissão/RLS negada ou código duplicado) dispara `syncEngine.markOffline()` e executa `createLotOffline(lot, orgId)` sem checar `isNetworkError(error)`.
   - **Impacto**: Um erro normal de validação ou RLS derruba a aplicação inteira para modo offline e cria um lote fantasma local cuja fila de sincronização ficará falhando indefinidamente.

3. **Fallback de `organization_id` inválido (`'local-org'` e `''`) em mutações offline (`src/lib/db.ts:L4567`, `L4988`, `L5975`, `L6211`, `L6321`)**
   - **Causa raiz**: `createLot` (`L4567`) e `updateLotProtocol` (`L4988`) usam fallback literal `'local-org'`; `createProperty` (`L5975`), `createBreed` (`L6211`) e `createAnimalCategory` (`L6321`) usam fallback `''` quando `orgId` não é resolvido offline.
   - **Impacto**: Como `organization_id` é `uuid` no PostgreSQL, as mutações enfileiradas no `syncEngine` falharão permanentemente com erro de sintaxe UUID ao reconectar.

4. **`getFarms` descarta `properties` ao ler do IndexedDB (`src/lib/db.ts:L5468`, `L5496`, `L5532` vs `L5559`)**
   - **Causa raiz**: Ao salvar fazendas no IndexedDB (`L5559`), `getFarms` grava `properties: f.properties || []`. Porém, nos três caminhos de leitura offline/fallback (`L5468`, `L5496`, `L5532`), retorna `properties: []` hardcoded em vez de ler `f.properties`.
   - **Impacto**: Telas e seletores que dependem de `farm.properties` ficam sem nenhum retiro/propriedade quando offline ou em fallback de erro.

5. **Operações destrutivas não-atômicas e erros ignorados em updates/deletes encadeados**
   - **`updateProtocol` (`L3606-L3620`)**: Executa `delete` em `protocol_steps` (`L3607`) e depois `insert` (`L3618`) sem checar `error` em nenhum dos dois. Se o `insert` falhar, o protocolo fica com **zero etapas** no banco e a função retorna `true` (`L3636`). Além disso, `protocol.steps = []` pula o `if` (`L3606`) e nunca limpa as etapas.
   - **`deleteProtocol` (`L3660-L3678`)**: Ignora `error` na contagem de `iatf_lots` (`L3660-L3663`) e deleta `protocol_steps` (`L3672`) **antes** de deletar `protocols` (`L3674`). Se a exclusão de `protocols` falhar (RLS/FK), as etapas já foram destruídas permanentemente.
   - **`updateLotProtocol` (`L5135-L5146`, `L5203-L5263`)**: Se a consulta `completedEvents` retornar `compErr` (`L5141`), o `if (!compErr && ...)` **ignora o bloqueio de segurança** e permite alterar o protocolo de um lote que já teve IA ou DG concluídos! Ademais, ignora erros ao atualizar D0 (`L5203`), deletar eventos pendentes (`L5216`) e atualizar `animal_managements` (`L5252`).
   - **`deleteLot` (`L5379-L5417`)**: Deleta `input_losses`, `management_events` e `iatf_lot_animals` antes de deletar `iatf_lots`; se a exclusão do lote falhar (`L5414`), todos os filhos já foram apagados.
   - **`setActiveReproductiveSeason` (`L6708-L6727`)**: Primeiro fecha todas as estações da organização (`L6708-L6711`) sem checar erro, e só depois ativa o `id` alvo (`L6714-L6718`). Se a segunda query falhar, a organização fica com **nenhuma estação ativa**.
   - **Verificações de dependência ignorando erro**: `deleteBull` (`L4063-L4069`), `deleteGeneticCenter` (`L4317-L4327`, erros não-rede), `deleteFarm` (`L5836-L5859`), `deleteProperty` (`L6103-L6107`) e `deleteReproductiveSeason` (`L6775-L6789`) não abortam quando a query de `count` retorna erro (`count` vem `null`, sendo tratado como `0`).

6. **Efeito colateral de escrita (`INSERT`) e race condition dentro de função `GET` (`src/lib/db.ts:L6905-L6923`)**
   - **Causa raiz**: `getVeterinarians()` insere automaticamente um veterinário hardcoded (`MV. DR. SAMOEL DUARTE`) no banco sempre que `result.length === 0`.
   - **Impacto**: Chamadas simultâneas a `getVeterinarians()` em uma organização nova geram registros duplicados; viola idempotência de leitura e injeta dados pessoais/fictícios do desenvolvedor em todas as organizações de produção.

7. **Retorno de sucesso silencioso offline quando registro não existe no IndexedDB (`src/lib/db.ts:L4817-L4832`, `L4874-L4886`, `L5356-L5369`)**
   - **Causa raiz**: Em `updateLotCode`, `updateLotNotes` e `deleteLot` no modo offline, se `offlineDb.lots.get(lotId)` retornar `undefined`, o bloco `if (lot)` é pulado e a função retorna `{ success: true }` sem enfileirar nenhuma mutação.
   - **Impacto**: O usuário recebe confirmação de sucesso, mas a alteração/exclusão nunca é aplicada nem sincronizada.

8. **Cache global `cachedFarms` não segregado por `organization_id` (`src/lib/db.ts:L5476-L5479`, `L5542-L5545`)**
   - **Causa raiz**: `cachedFarms` é uma variável única em memória, sem chave por `orgId` (diferente de `getCached(\`bulls_${orgId}\`)`).
   - **Impacto**: Ao trocar de organização dentro do `CACHE_TTL_MS` sem limpeza explícita do cache, `getFarms()` retorna fazendas da organização anterior.

---

##### Divergências

1. **Offline vs Online — Etapas de protocolo (`protocol_steps`) não sincronizadas no `updateProtocol` (`src/lib/db.ts:L3545-L3575`)**
   - Offline atualiza `protocol_steps` no IndexedDB, mas `syncEngine.enqueueMutation` (`L3567-L3574`) enfileira apenas o cabeçalho em `protocols`, descartando todas as alterações nas etapas ao sincronizar.

2. **Offline vs Online — Fechamento de outras estações / desmarcação de `is_default` não enfileirado (`src/lib/db.ts:L6496-L6517`, `L6600-L6616`, `L6677-L6690`, `L6971-L6991`)**
   - Em `createReproductiveSeason`, `updateReproductiveSeason`, `setActiveReproductiveSeason` e `createVeterinarian` offline, o código fecha as demais estações (ou desmarca `is_default` nos demais veterinários) localmente no IndexedDB, mas **não enfileira mutações de `update`** para esses registros no Supabase. Ao sincronizar, o servidor fica com múltiplas estações `'active'` ou múltiplos veterinários `is_default: true`.

3. **Offline vs Online — Divergências de regras e schema em `createLotOffline` vs `createLot` (`src/lib/db.ts:L4416-L4505` vs `L4605-L4678`)**
   - `reproductive_seasons`: Offline envia `farm_id` no insert (`L4419`), enquanto online (`L4607-L4613`) não envia `farm_id` (risco de erro de coluna inexistente na sincronização).
   - Datas planejadas: Offline usa defaults `+11` e `+41` dias (`L4443-L4444`); online grava `null` (`L4650-L4651`) e `undefined` no Dexie (`L4696-L4697`).
   - Etapas padrão: Offline gera 4 eventos padrão (`D0, D9, IA, DG` em `L4500-L4505`) se `steps.length === 0`; online gera 0 eventos (`L4666`).
   - `code`: Offline faz `.trim()` (`L4458`/`L4488`), online envia `lot.code` sem `.trim()` ao Supabase (`L4648`) mas faz `.trim()` no IndexedDB (`L4693`).

4. **Offline vs Online — Armazenamento de `GeneticCenter` em `localStorage` em vez de Dexie (`src/lib/db.ts:L4113-L4130`)**
   - `genetic_centers` usa `localStorage` (`iatf_offline_genetic_centers`) enquanto todas as outras entidades usam `offlineDb` (Dexie/IndexedDB), quebrando o padrão arquitetural offline-first e escapando de rotinas centralizadas de limpeza/sync do Dexie.

5. **Offline vs Online — Campos omitidos ou divergentes no IndexedDB**
   - **`bulls` (`L3766-L3776`, `L3847-L3857`, `L3904-L3914`, `L3953-L3963`, `L3989-L3996`, `L4028-L4035`)**: `breed_id` nunca é persistido nem lido em `offlineDb.bulls`, e `updateBull` não atualiza `breed_id` nem `breeds` no Dexie. Além disso, `owner_central` é renomeado para `central` no Dexie.
   - **`updateProtocol` online (`L3625-L3631`)**: Atualiza `status` no Supabase (`L3593`), mas omite `status` ao atualizar `offlineDb.protocols`.
   - **Trimming/normalização inconsistente**: `createBull` (`L3938-L3943`), `createFarm` (`L5727-L5731`, sem `toUpperCase()` em `state`), `createProperty` (`L6005-L6008`), `createBreed` (`L6236-L6239`) e `createAnimalCategory` (`L6346-L6349`) gravam dados crus no Supabase no modo online, enquanto no modo offline e/ou no IndexedDB fazem `.trim()` e normalização.
   - **Checagens de integridade ignoradas offline**: `deleteProtocol` (`L3645`), `deleteBull` (`L4048`), `deleteGeneticCenter` (`L4302`), `deleteFarm` (`L5821`) e `deleteProperty` (`L6086`) pulam todas as verificações de vínculos que existem online, permitindo exclusões locais que depois falharão no servidor.

6. **IDs fictícios em fallbacks (`DEFAULT_BREEDS`, `DEFAULT_CATEGORIES`, `'default-vet'`) (`src/lib/db.ts:L6155`, `L6189`, `L6265`, `L6299`, `L6846`, `L6857`, `L6896`)**
   - Retornar registros hardcoded com IDs não-UUID ou ausentes no banco (como `'default-vet'`) gera risco de erro de FK/UUID quando esses IDs são selecionados em formulários e enviados ao Supabase.

---

##### Falta de Ligação nos Fluxos de Trabalho

1. **`createResyncLot` ignora completamente `parentLotId` e não faz rollback (`src/lib/db.ts:L4748-L4799`)**
   - Recebe `parentLotId: string` (`L4749`), mas nunca referencia `params.parentLotId` no corpo da função — o novo lote de 2ª IATF perde o vínculo rastreável com o lote de origem.
   - Se `createLot` (`L4764`) tiver sucesso e `addAnimalsToLot` (`L4778`) falhar, o lote vazio e seus eventos ficam órfãos no banco e no IndexedDB.

2. **`deleteLot` deixa `animal_managements` órfãos e não invalida cache (`src/lib/db.ts:L5350-L5436`)**
   - Exclui `input_losses`, `management_events`, `iatf_lot_animals` e `iatf_lots`, mas nunca remove registros vinculados em `animal_managements` (nem no Supabase nem no `offlineDb.animal_managements`), embora `updateLotProtocol` (`L5090`, `L5252`) gerencie `animal_managements` por `lot_id`. Também não chama `invalidateCache('animal_managements')`.

3. **Criações online que não alimentam o IndexedDB (`createProperty`, `createBreed`, `createAnimalCategory`) (`src/lib/db.ts:L6001-L6017`, `L6232-L6247`, `L6342-L6357`)**
   - Ao criar propriedade, raça ou categoria online, o novo registro não é gravado em `offlineDb`. Se o dispositivo perder conexão em seguida, os itens recém-criados somem da interface offline.

4. **Exclusão/congelamento de fazenda não propaga limpeza para caches e filhos locais (`src/lib/db.ts:L5584`, `L5620`, `L5637`, `L5673`, `L5821-L5881`)**
   - `freezeFarm` e `unfreezeFarm` fazem `cachedFarms = null` diretamente (sem usar `clearFarmsCache()`) e não invalidam `lots`, `events` ou `metrics`.
   - `deleteFarm` (online e offline) não remove `offlineDb.properties` associadas à fazenda e não chama `invalidateCache('properties')`.
   - `deleteProperty` online (`L6103-L6113`) verifica `animals.property_id`, mas não verifica se existem `iatf_lots` vinculados ao retiro (`property_id`).

5. **Mutações offline sem `orgId` no `syncEngine` (`src/lib/db.ts:L4264`, `L4305`, `L4824`, `L4880`, `L5361`)**
   - `updateGeneticCenter`, `deleteGeneticCenter`, `updateLotCode`, `updateLotNotes` e `deleteLot` chamam `syncEngine.enqueueMutation(...)` sem passar o parâmetro `orgId`.

---

##### Possíveis Brechas de Segurança

1. **Ausência de filtro multi-tenant (`organization_id`) em escritas/exclusões no Supabase — risco de IDOR (`src/lib/db.ts`)**
   - Diversas operações mutáveis filtram apenas por `.eq('id', ...)` sem `.eq('organization_id', orgId)` (e várias sequer validam a existência de `orgId`), dependendo exclusivamente de políticas RLS no banco:
     - `updateBull` (`L4012-L4018`) e `deleteBull` (`L4078-L4081`)
     - `updateGeneticCenter` (`L4278-L4284`) e `deleteGeneticCenter` (`L4334-L4337`)
     - `updateLotCode` (`L4840-L4846`) e `updateLotNotes` (`L4894-L4900`)
     - `updateLotProtocol` em `iatf_lots`, `management_events`, `protocols` e `animal_managements` (`L5135-L5263`)
     - `deleteLot` em `input_losses`, `management_events`, `iatf_lot_animals` e `iatf_lots` (`L5381-L5412`)
     - `updateProtocol` (`L3607`) e `deleteProtocol` (`L3672`) ao deletar `protocol_steps` por `protocol_id` sem confirmar antes se `protocols` pertence a `orgId`.
   - Adicionalmente, `getGeneticCenters` (`L4153-L4162`) executa a consulta no Supabase **mesmo quando `orgId` é `null`**, omitindo `.eq('organization_id', orgId)`.

2. **Vazamento e corrupção cross-tenant no IndexedDB offline (`src/lib/db.ts`)**
   - **Leituras sem filtro de `organization_id`**: `getBulls` (`L3765`, `L3786`, `L3822`), `getFarms` (`L5457`, `L5484`, `L5520`), `getProperties` (`L5894`, `L5934`), `getBreeds` (`L6148`, `L6161`, `L6183`), `getAnimalCategories` (`L6258`, `L6271`, `L6293`), `getReproductiveSeasons` (`L6377`, `L6395`, `L6428`), `getVeterinarians` (`L6831`, `L6881`) e fallbacks em `createLotOffline` (`L4380`, `L4397`) leem `.toArray()` / `.first()` sem filtrar por `organization_id`. Em dispositivos compartilhados ou troca de organização, dados de outro tenant são expostos.
   - **Escritas locais cross-tenant**: `createReproductiveSeason` (`L6497`, `L6559`), `updateReproductiveSeason` (`L6601`, `L6652`), `setActiveReproductiveSeason` (`L6679`, `L6730`) e `createVeterinarian` (`L6972`) iteram sobre **todos** os registros da tabela Dexie sem filtrar `organization_id`, sobrescrevendo `status: 'closed'` ou `is_default: false` de outras organizações armazenadas no navegador.

3. **Exposição de dados pessoais/mock hardcoded em código de produção (`src/lib/db.ts:L6847-L6849`, `L6858-L6860`, `L6897-L6899`, `L6911-L6914`)**
   - Nome, CRMV, telefone e e-mail (`MV. DR. SAMOEL DUARTE`, `CRMV-MT 1234`, `(65) 99999-0000`, `samoel@iatfmaster.com.br`) estão hardcoded no bundle client-side e são inseridos automaticamente no banco de todas as organizações sem veterinários cadastrados.

---

### Lote 05 — src/lib/db.ts (Parte 3: Linhas 7001 a 10225)

### Auditoria Técnica — Lote 05 (`src/lib/db.ts`, Linhas 7001–10225)

---

##### Arquivo: `src/lib/db.ts` (Linhas 7001–10225 — 3.225 linhas analisadas)
- **Papel no sistema**: Camada central de acesso a dados (online via Supabase/PostgREST e offline via Dexie/IndexedDB + `syncEngine`). Neste trecho concentra: CRUD de veterinários, manejos individuais por animal (`D0`, `D9`, `IA`, `DG`, `DG direto`), baixa integrada de estoque genético criogênico, relatórios por lote e categoria animal, gestão de membros da equipe, manejos coletivos em lote (`D0`, `D9`, `IA`, `DG`), checkboxes rápidos de etapas por matriz e resolução de role/tenant (`getCurrentUserRoleAndTenant`).
- **Status**: `CRÍTICO`

---

##### Erros e Bugs

1. **`executeStepIA` NUNCA dá baixa no estoque de sêmen (RN-08 completamente quebrada)** — `src/lib/db.ts:L7831-L7893`
   - **Causa raiz**: No passo 1 (`L7831-L7842`), a função faz `UPDATE` em `animal_managements` gravando `semen_batch_id: data.semen_batch_id || null`. Somente no passo 3 (`L7857-L7863`), ela consulta `animal_managements.semen_batch_id` para comparar `existingMgmt.semen_batch_id !== data.semen_batch_id`. Como o registro já acabou de ser atualizado com `data.semen_batch_id`, `isNewBatch` avalia **sempre como `false`**.
   - **Impacto**: Em manejos individuais de IA online, nem `semen_batches.used_quantity` nem `deductGeneticInventoryForSemenBatch` são executados; o estoque de sêmen nunca é debitado.

2. **`executeStepDG` e `recordDirectDG` sobrescrevem TODOS os lotes históricos do animal em `iatf_lot_animals`** — `src/lib/db.ts:L7980-L7988`, `src/lib/db.ts:L8157-L8165`
   - **Causa raiz**: Ambas as funções atualizam `iatf_lot_animals` filtrando apenas por `.eq('animal_id', ...)`, sem filtrar por `lot_id`.
   - **Impacto**: Se uma matriz participou de mais de um lote (ressincronização, 1ª/2ª IATF ou estações anteriores), registrar um novo DG corrompe `pregnancy_status`, `ecc_dg` e `expected_parturition_date` de todos os lotes anteriores da fêmea, distorcendo taxas de prenhez históricas.

3. **`getLotCategoryReports` classifica TODAS as fêmeas do lote como inseminadas** — `src/lib/db.ts:L8394-L8397`
   - **Causa raiz**: `const isInseminated = !!(item.bull_id || item.semen_batch_id || item.inseminator_name || item.pregnancy_status);`. Na tabela `iatf_lot_animals`, `pregnancy_status` tem valor padrão `'pendente'` (string não vazia, *truthy* em JS — confirmado em `L9596`).
   - **Impacto**: Mesmo animais que nunca foram inseminados (ex.: apenas no D0/D9 ou perda de implante) entram em `inseminated_qty`, fazendo `inseminated_qty === total_females` e reduzindo artificialmente a `pregnancy_rate` nos relatórios.

4. **`getLotCategoryReports` sem paginação (truncamento silencioso em 1.000 linhas)** — `src/lib/db.ts:L8298-L8335`
   - **Causa raiz**: Consulta toda a tabela `iatf_lot_animals` em uma única chamada sem `.range()`/paginação. O PostgREST/Supabase limita respostas padrão a 1.000 registros.
   - **Impacto**: Organizações/fazendas com mais de 1.000 registros em `iatf_lot_animals` recebem relatórios silenciosamente incompletos.

5. **`deductGeneticInventoryForSemenBatch` ignora erros da RPC e invalida idempotência com `Date.now()`** — `src/lib/db.ts:L7767-L7791`
   - **Causa raiz**: (a) `p_idempotency_key` inclui `${Date.now()}` (`L7767`), anulando a proteção contra dupla baixa em retentativas; (b) `await supabase.rpc('fn_process_genetic_usage_iatf', ...)` (`L7769-L7783`) não verifica `{ error }`, decrementando `remainingToDeduct` e retornando `true` mesmo se a RPC falhar; (c) se o saldo total for insuficiente (`remainingToDeduct > 0`), ainda retorna `true`; (d) `.ilike('batch_number', batch.batch_number)` (`L7708`, `L7723`) não escapa wildcards `%`/`_` do PostgreSQL.
   - **Impacto**: Falhas silenciosas ou duplicação de débito no livro-razão criogênico e possível casamento com lote errado quando `batch_number` contém `_` ou `%`.

6. **`executeBatchLotManagementIA` insere `animal_managements` sem campos obrigatórios (`farm_id`, `start_date`, `cycle_number`, `protocol_id`) e engole erro** — `src/lib/db.ts:L9247-L9262`, `src/lib/db.ts:L9278-L9280`
   - **Causa raiz**: Quando não existe manejo prévio para o animal no lote, o `insert` em `animal_managements` omite `farm_id`, `start_date`, `cycle_number`, `protocol_id` e `season_id` (presentes em `startAnimalManagement` `L7574-L7586` e `ensureLotAnimalManagementsOnline` `L9688-L9703`) e não verifica o erro retornado pelo Supabase.
   - **Impacto**: Falha silenciosa na criação do manejo individual em banco se `farm_id` ou `start_date` forem `NOT NULL`.

7. **`executeBatchLotManagementIA` ignora `defaultBullId` e `defaultSemenBatchId` e não estorna sêmen ao trocar partida** — `src/lib/db.ts:L9043-L9044`, `L9070-L9071`, `L9206-L9207`, `L9212-L9216`, `L9316-L9327`
   - **Causa raiz**: Os parâmetros `defaultBullId` e `defaultSemenBatchId` são aceitos na assinatura mas nunca aplicados como fallback quando `item.bull_id`/`item.semen_batch_id` estão ausentes. Além disso, ao trocar `prevBatchId` por um novo `batchId`, a função debita o novo lote no estoque criogênico sem estornar a dose do lote anterior.
   - **Impacto**: Itens sem touro/partida individuais deixam de ser inseminados apesar dos valores padrão informados; troca de partida gera divergência de estoque no módulo criogênico.

8. **Ausência generalizada de verificação de erros nas escritas online em lote** — `src/lib/db.ts:L8739-L8842`, `L8976-L9023`, `L9268-L9349`, `L9539-L9604`, `L10055-L10186`
   - **Causa raiz**: Nenhuma das chamadas `update`/`insert` em `executeBatchLotManagementD0`, `D9`, `IA`, `DG` e `toggleLotAnimalStepCheck` verifica `{ error }`. Ainda, `toggleLotAnimalStepCheck` (`L10183-L10186`) retorna `{ success: true }` dentro do `catch`.
   - **Impacto**: Falhas de rede, permissão (RLS) ou restrição de banco passam despercebidas, gravando estado otimista no `localStorage` (`saveLocalLotStepChecks`) e exibindo sucesso falso ao usuário.

9. **`toggleLotAnimalStepCheck` para `DG`/`DG1` marca automaticamente matrizes como `'prenha'`** — `src/lib/db.ts:L9969-L10002`, `L10113-L10155`
   - **Causa raiz**: Marcar o checkbox da etapa `DG` define `newPregStatus = 'prenha'`, altera `animals.reproductive_status` para `'prenha'` e calcula `expected_parturition_date` (+295 dias).
   - **Impacto**: Registrar que a etapa de DG foi checada fabrica prenhezes e previsões de parto mesmo para vacas vazias.

10. **Cálculo de `losses_count` / `animals_worked_count` em `executeBatchLotManagementD9` usa `lossIds.size` global em vez do subconjunto filtrado** — `src/lib/db.ts:L8899-L8908`, `L9017-L9018`
    - **Causa raiz**: Quando `params.animalIds` filtra um subconjunto do lote, `lossIds.size` considera todos os IDs em `deviceLossAnimalIds` mesmo os fora de `lotAnimals`, em vez de `lossAnimalIds.length`.
    - **Impacto**: Contagens incorretas de animais trabalhados e perdas em `management_events`.

11. **Média ponderada incorreta em `getCategorySummaryReports`** — `src/lib/db.ts:L8478-L8481`
    - **Causa raiz**: Pondera `item.avg_ecc_ia` por `item.total_females` em vez do número real de animais que tiveram `ecc_ia` informado (`eccIaCount`).
    - **Impacto**: Lotes com poucas medições de ECC recebem peso desproporcional na média geral da categoria.

12. **Fallback perigoso `|| mgmts[0]` em buscas offline de manejos** — `src/lib/db.ts:L8881`, `L9107`, `L9415`, `L8023`
    - **Causa raiz**: Em `executeBatchLotManagementD9` (`L8881`), `IA` (`L9107`) e `DG` (`L9415`), se não encontrar manejo para `params.lotId`, cai em `mgmts[0]` (que pode pertencer a outro lote/estação). Em `recordDirectDG` offline (`L8023`), `m.step_code !== 'DG'` pode capturar um manejo antigo já concluído.
    - **Impacto**: Corrupção de registros de manejos de lotes/ciclos anteriores no IndexedDB e na fila de sincronização.

13. **IDs virtuais `lot_virtual_*` gerados offline quebram operações subsequentes** — `src/lib/db.ts:L7386-L7434`, `L8178`, `L8194-L8197`
    - **Causa raiz**: `getAnimalManagements` offline sintetiza manejos com `id: 'lot_virtual_' + la.id`. Apenas `deleteAnimalManagement` offline (`L8178`) verifica esse prefixo; a versão online (`L8194-L8197`) e todas as funções `executeStep*` enviam `lot_virtual_...` como UUID para o Supabase ou tentam atualizar um ID inexistente no IndexedDB.
    - **Impacto**: Erros de sintaxe UUID no PostgreSQL ou mutações órfãs na fila de sync.

14. **`cycle_number` calculado com `count + 1` sujeito a colisão e race condition** — `src/lib/db.ts:L7524-L7529`, `L8105-L8110`, `L8791-L8808`
    - **Causa raiz**: Usa contagem total de linhas em vez de `MAX(cycle_number) + 1`. Se um manejo anterior for excluído, novos manejos reutilizam um `cycle_number` já existente. `ensureLotAnimalManagementsOnline` (`L9694`) ainda fixa `cycle_number: 1`.

15. **Operação não atômica de `is_default` em veterinários (online e offline)** — `src/lib/db.ts:L7002-L7007`, `L7065-L7081`, `L7092-L7098`, `L7138-L7149`, `L7160-L7163`
    - **Causa raiz**: Offline, `updateVeterinarian` (`L7065-L7081`) e `setDefaultVeterinarian` (`L7138-L7149`) desmarcam `is_default` dos demais veterinários apenas no IndexedDB, mas enfileiram mutação somente para o `id` alvo. Online, faz dois `UPDATE` separados sem checar erro do primeiro. Além disso, `offlineDb.veterinarians.toArray()` (`L7030`, `L7066`, `L7113`, `L7138`, `L7177`) não filtra por `organization_id`, afetando veterinários de outras organizações no cache local.
    - **Impacto**: Múltiplos veterinários com `is_default = true` após sync offline, ou nenhum veterinário padrão se o segundo update online falhar.

---

##### Divergências

1. **Status `'interrompido'` fora do tipo `AnimalManagement['status']`** — `src/lib/db.ts:L7265` vs `L8998`
   - A interface define `status: 'em_andamento' | 'concluido' | 'cancelado'` (`L7265`), mas `executeBatchLotManagementD9` grava `status: 'interrompido'` (`L8998`). Se existir `CHECK` constraint no PostgreSQL alinhada ao tipo, a atualização falha silenciosamente.

2. **Três representações distintas para `'inconclusivo'` entre online e offline** — `src/lib/db.ts:L7970`, `L8042`, `L8147`, `L9400`, `L9410`, `L9498-L9502`, `L9575`
   - `recordDirectDG` offline mapeia `'inconclusivo'` -> `'duvidosa'` (`L8042`).
   - `executeBatchLotManagementDG` offline mapeia `'inconclusivo'` -> `'repeticao'` em `lot_animals` (`L9400`) e seta `animals.reproductive_status = 'vazia'` (`L9410`).
   - `executeBatchLotManagementDG` online grava `'inconclusivo'` em `iatf_lot_animals` (`L9512`), **não** altera `animals.reproductive_status` (`L9498-L9502`), e exclui `'inconclusivo'` da contagem `dbDgCount` (`L9575`), ao passo que `executeStepDG` (`L7970`) e `recordDirectDG` online (`L8147`) setam `animals.reproductive_status = 'vazia'`.

3. **Coluna `d7_executed_at` inexistente na interface/online, mas enviada na fila offline** — `src/lib/db.ts:L7233-L7278`, `L9780`, `L9808-L9811`, `L9926-L9933`, `L10061-L10065`
   - `getLotAnimalStepChecks` (`L9780`) não seleciona `d7_executed_at` do Supabase e `toggleLotAnimalStepCheck` online (`L10061-L10065`) não escreve essa coluna no banco (comentário afirma persistência apenas local). Porém, o modo offline (`L9931`) enfileira `d7_executed_at` para sincronização com `animal_managements`, podendo gerar erro de coluna inexistente no PostgreSQL ao reconectar.

4. **Campos exclusivos do IndexedDB enfileirados para `animal_managements` no Supabase** — `src/lib/db.ts:L9734-L9755`
   - `upsertOfflineLotAnimalMgmtStep` inclui `step_code: 'D0'` e `date: baseStart` no payload enviado a `syncEngine.enqueueMutation('insert', 'animal_managements', ...)`. Essas colunas não existem nos inserts online de `animal_managements` (`L7573-L7591`, `L9688-L9703`).

5. **Prazo padrão de `dg_date` divergente: `+41` dias vs `+44` dias** — `src/lib/db.ts:L7334`, `L7399`, `L7563`, `L8735` vs `L9698`, `L9747`
   - `getAnimalManagements`, `startAnimalManagement` e `executeBatchLotManagementD0` usam `start_date + 44` dias; `ensureLotAnimalManagementsOnline` (`L9698`) e `upsertOfflineLotAnimalMgmtStep` (`L9747`) usam `start_date + 41` dias.

6. **Cálculo de `expected_parturition_date` em `executeBatchLotManagementDG` usa `ia_planned_date` em vez de `ia_executed_at`** — `src/lib/db.ts:L9472-L9478`, `L9506` vs `L7935-L7947`
   - `executeStepDG` prioriza `ia_executed_at || ia_date`; `executeBatchLotManagementDG` usa apenas `lot.ia_planned_date`.

7. **Divergência entre manejo individual e coletivo em D0 e D9**
   - `startAnimalManagement` online (`L7571-L7602`) não atualiza `animals.reproductive_status` para `'em_protocolo'` (diferente de `executeBatchLotManagementD0` `L8739-L8746`).
   - `executeStepD9` com `device_loss: true` (`L7635-L7664`) não interrompe o manejo nem atualiza `animals.reproductive_status` para `'vazia'` (diferente de `executeBatchLotManagementD9` `L8990-L9010`).
   - `executeBatchLotManagementD0` online (`L8719-L8735`) não preenche `d7_date` (diferente de `startAnimalManagement` `L7548`).

---

##### Falta de Ligação nos Fluxos de Trabalho

1. **Mutações offline de `animals` e `lot_animals` não enfileiradas para sincronização** — `src/lib/db.ts:L8650-L8653`, `L9101-L9104`, `L9409-L9412`, `L9921-L9924`, `L9959-L9968`, `L9999-L10002`
   - Diversas rotinas offline atualizam `offlineDb.animals` (e `offlineDb.lot_animals` em `L9964`) localmente sem chamar `syncEngine.enqueueMutation`. Ao reconectar, o status reprodutivo das matrizes no servidor fica desatualizado.

2. **Cache de relatórios (`lot_cat_report`) nunca é invalidado após IA/DG** — `src/lib/db.ts:L8291` vs `L7895-L7898`, `L7990-L7993`, `L8167-L8170`, `L9357-L9363`, `L9608-L9613`
   - Nenhuma operação de IA, DG ou manejo chama `invalidateCache('lot_cat_report')`, mantendo relatórios em memória defasados até expiração do TTL ou `forceRefresh`.

3. **Falta de espelhamento no IndexedDB (`offlineDb`) nas operações online** — `src/lib/db.ts:L7448-L7477`, `L7571-L7602`, `L7616-L7664`, `L7831-L7899`, `L7951-L7994`, `L8739-L8850`, `L8975-L9037`, `L9538-L9614`
   - Quase todas as leituras/escritas online de manejos individuais e em lote não atualizam o `offlineDb` (apenas `executeBatchLotManagementIA` espelha `lot_animals` em `L9286`). Se o usuário perder conexão logo após operar online, o modo offline exibirá dados antigos.

4. **`executeStepIA` individual não atualiza `iatf_lot_animals`** — `src/lib/db.ts:L7830-L7899`
   - Diferente de `executeStepDG`, registrar IA pelo manejo individual de uma vaca pertencente a um lote deixa `iatf_lot_animals` sem touro/partida/inseminador/ECC, quebrando a consistência da tela do lote e dos relatórios.

5. **`executeBatchLotManagementDG` offline não conclui o lote (`iatf_lots.status = 'concluido'`)** — `src/lib/db.ts:L9387-L9465` vs `L9592-L9604`
   - Online encerra automaticamente o lote quando não há mais animais pendentes; offline nunca executa essa transição. O mesmo ocorre em `executeStepDG` individual (`L7902-L7995`).

6. **`deleteAnimalManagement` deixa dados órfãos e estados inconsistentes** — `src/lib/db.ts:L8174-L8215`
   - Não reverte `animals.reproductive_status`, não limpa campos em `iatf_lot_animals`, não estorna dose de sêmen e não invalida os caches `'lots'` e `'metrics'`.

7. **`getLotAnimalStepChecks` trava checkbox `IA` como `true` via `localStorage`** — `src/lib/db.ts:L9827-L9830`
   - `Boolean(localAnimal['IA'] || hasDbIa)`: uma vez salvo `true` no `localStorage`, o estado local nunca é limpo mesmo se a IA for removida no banco por outro dispositivo.

8. **Relatórios (`getLotCategoryReports` / `getCategorySummaryReports`) sem suporte offline** — `src/lib/db.ts:L8283-L8511`
   - Não consultam `isSystemOffline()` nem `offlineDb`, falhando quando o dispositivo está sem rede.

9. **Parâmetros mortos / não utilizados** — `src/lib/db.ts:L9043-L9044` (`defaultBullId`, `defaultSemenBatchId` em `executeBatchLotManagementIA`).

---

##### Possíveis Brechas de Segurança

1. **Escalação de privilégio trivial em `getCurrentUserRoleAndTenant` (`isMasterCria`)** — `src/lib/db.ts:L10198`, `L10207-L10219`
   - **Evidência**:
     - `L10215-L10218`: `isMasterCria` é concedido se `role === 'mastercriareproducao'` **OU** `email.toLowerCase().includes('mastercriareproducao')` **OU** `orgName.toLowerCase().includes('mastercriareproducao')`.
     - Qualquer usuário que se cadastre com um e-mail contendo a substring `mastercriareproducao` (ex.: `user+mastercriareproducao@dominio.com`) ou altere o nome da própria organização para conter esse texto obtém privilégios de `isMasterCria` na interface.
     - `L10198`: Usa `supabase.auth.getSession()` (dados locais não verificados no servidor) em vez de `supabase.auth.getUser()`.
     - `L10207-L10212`: Consulta `organization_members` filtrando apenas por `.eq('user_id', user.id).limit(1)` **sem filtrar pela organização ativa**, retornando um `role` arbitrário para usuários pertencentes a múltiplas organizações (quebra de isolamento multi-tenant de RBAC).

2. **IDOR / Ausência de filtro de `organization_id` e validação de `role` na gestão de equipe** — `src/lib/db.ts:L8546-L8596`
   - `updateTeamMemberRole` (`L8580-L8587`) e `toggleTeamMemberStatus` (`L8589-L8596`) executam `.update(...).eq('id', memberId)` sem filtrar por `organization_id` e sem validar `role` contra uma *allowlist* (permitindo inclusive gravar `role = 'mastercriareproducao'`). Dependem 100% de RLS no banco para evitar alteração cross-tenant e escalação de privilégio.
   - `createTeamMemberDirect` (`L8546-L8578`) aceita qualquer `role: string` e envia `p_password` sem validação de complexidade ou formato de e-mail no cliente.

3. **Vazamento cross-tenant potencial por omissão de filtro `organization_id` em consultas e mutações** — `src/lib/db.ts:L7449-L7464`, `L7617-L7625`, `L7647-L7656`, `L7831-L7853`, `L7951-L7988`, `L8194-L8197`, `L8288-L8335`, `L8703-L8707`
   - `getLotCategoryReports` (`L8288-L8335`) obtém `orgId` mas **nunca aplica `.eq('iatf_lots.organization_id', orgId)`** na query. De forma semelhante, `getAnimalManagements`, `executeStepD0/D9/IA/DG`, `deleteAnimalManagement` e os manejos em lote operam apenas por `id`/`animal_id`/`lot_id`, delegando integralmente o isolamento multi-tenant às políticas de RLS.

4. **Confiança em `localStorage.getItem('iatf_current_org_id')` como fallback de tenant** — `src/lib/db.ts:L7052-L7054`, `L7132-L7134`, `L7192-L7194`, `L7499`, `L8632`, `L9899`
   - Caso `getCurrentOrgId()` retorne nulo ou no modo offline, o código utiliza `localStorage.getItem('iatf_current_org_id')` (e até `'local-org'` em `L9900`) para assinar mutações na fila de sincronização. Em dispositivos compartilhados ou sessão expirada/trocada, mutações podem ser associadas ao tenant incorreto.

5. **Persistência de dados de manejo em `localStorage` sem escopo de usuário/organização** — `src/lib/db.ts:L9621-L9659`, `L9857-L9859`
   - `iatf_lot_step_checks_v2_${lotId}` armazena IDs de animais e status de etapas em texto plano no `localStorage` sem vínculo com `user_id`/`org_id`, permanecendo acessível após troca de conta/logout se não for limpo explicitamente.

---

### Lote 06 — Offline DB, SyncEngine, GeneticInventoryService e Exportação Excel

### Auditoria Técnica — Lote 06: Offline DB, SyncEngine, GeneticInventoryService e Exportação Excel

---

#### 1. `src/lib/offline/offlineDb.ts`

- **Arquivo**: `src/lib/offline/offlineDb.ts` (361 linhas analisadas) — Definição do banco de dados local IndexedDB (via Dexie `IATF_Master_Offline_DB`, schema v1 a v5) e interfaces TypeScript dos modelos offline (fazendas, estações, lotes, matrizes, vínculos de lote, protocolos, touros, partidas de sêmen, tanques/canecas/lotes genéticos, manejos, fila de sincronização e auditoria local).
- **Status**: `ALTO`

##### Erros e Bugs
1. **Índice `tag_number` não declarado na interface `OfflineAnimal`** (`offlineDb.ts:L41-L52`, `L300`, `L341`): A versão 3..5 do schema indexa `tag_number` na store `animals`, porém a interface `OfflineAnimal` declara apenas `ear_tag: string` (obrigatório) e não tipa `tag_number`, `organization_id`, `reproductive_status`, `breed_id`, `category_id` ou `property_id` (dependendo da assinatura permissiva `[key: string]: unknown` em `L51`). Isso mascara erros de tipagem quando código lê/escreve campos divergentes.
2. **Índices com `organization_id` ausentes em tabelas multi-tenant** (`offlineDb.ts:L342`, `L346-L348`, `L350`): Na versão 5, `lot_animals`, `genetic_tanks`, `genetic_canisters`, `genetic_batches` e `sync_queue` não indexam `organization_id` (mesmo `SyncQueueItem` tendo `organization_id?: string` em `L169`), impossibilitando consultas/limpezas eficientes por organização no IndexedDB.
3. **Ausência de estratégia de recuperação/tratamento para `VersionError` / `QuotaExceededError` e instância global executada no import** (`offlineDb.ts:L361`): `export const offlineDb = new IATFOfflineDatabase();` instancia o Dexie no nível de módulo sem guarda de ambiente SSR (`typeof window !== 'undefined'`) nem handlers para `blocked`/`versionchange` entre múltiplas abas abertas.

##### Divergências
1. **Tabelas legadas/inexistentes no PostgreSQL (`genetic_tanks`, `genetic_canisters`, `genetic_batches`) vs módulo real de estoque genético** (`offlineDb.ts:L87-L119`, `L249-L251`, `L346-L348`): O banco real (`supabase/migrations/007_genetic_inventory_module.sql`) utiliza `semen_tanks`, `semen_tank_canisters`, `genetic_materials`, `genetic_material_batches`, `genetic_inventory_balances`, `genetic_inventory_movements` e `genetic_clients`. As 3 stores `genetic_tanks`, `genetic_canisters` e `genetic_batches` no IndexedDB têm nomes e colunas divergentes (`canisters_count`, `color`, `capacity`, `bull_name`, `current_doses`).
2. **Schema de `OfflineManagementRecord` diverge da tabela `animal_managements` do banco** (`offlineDb.ts:L121-L147`): Define `step_code`, `date`, `inseminator`, `bull_name`, `doses_used` e `diagnosis_result: 'prenhe' | 'prenha' | 'vazia' | 'duvidosa' | 'inconclusivo'`, enquanto a tabela PostgreSQL `animal_managements` (`supabase/migrations/006_animal_managements.sql:L5-L53`) usa `d0_executed_at`/`d9_executed_at`/`ia_executed_at`/`dg_executed_at`, `bull_id`, `inseminator_name` e `pregnancy_status` (`'pendente' | 'prenha' | 'vazia' | 'inconclusivo'`), sem as colunas `step_code`, `date`, `inseminator`, `bull_name`, `doses_used` ou `diagnosis_result`.
3. **Divergência de nome de coluna de brinco e status** (`offlineDb.ts:L44`, `L132`): `OfflineAnimal` usa `ear_tag` enquanto o banco (`001_initial_schema.sql:L69`) usa `tag_number`; `OfflineManagementRecord.diagnosis_result` mistura `'prenhe'` e `'prenha'`, `'duvidosa'` e `'inconclusivo'`.
4. **Divergência de `OfflineBull.farm_id`** (`offlineDb.ts:L78`, `L344`): `bulls` no PostgreSQL (`001_initial_schema.sql:L82-L90`) é escopada por `organization_id` e não possui coluna `farm_id`, mas o schema Dexie indexa `farm_id` em `bulls`.
5. **Divergência em `OfflineSeason.status`** (`offlineDb.ts:L16`): Tipado como `'active' | 'closed'`, sem verificar outros possíveis estados ou default do banco.

##### Falta de Ligação nos Fluxos de Trabalho
1. **Stores órfãs / código morto (`genetic_tanks`, `genetic_canisters`, `genetic_batches`)** (`offlineDb.ts:L249-L251`, `L346-L348`): Nenhuma função em `syncEngine.ts` popula `genetic_tanks`, `genetic_canisters` ou `genetic_batches` via `syncDownAllData` ou `downloadFarmDataForCurral`, e nenhum componente/serviço da aplicação lê essas stores (apenas `decrementLocalSemenBatch` em `syncEngine.ts:L449` tenta um `.get()` em `genetic_batches`).
2. **Sem mecanismo de limpeza (`clear` / `delete`) no logout ou troca de organização**: O banco `IATF_Master_Offline_DB` é singleton por origem do navegador e não expõe método de expurgo de tenant ao encerrar sessão ou trocar de conta/organização.

##### Possíveis Brechas de Segurança
1. **Persistência de dados multi-tenant sem isolamento por usuário/organização no dispositivo** (`offlineDb.ts:L262`, `L361`): O banco único `IATF_Master_Offline_DB` armazena dados operacionais, `sync_queue` e `audit_log` (com `payload` completo em `L183`) em texto claro no IndexedDB. Como não há limpeza no logout nem particionamento por `user_id`/`organization_id` no nome do banco, um segundo usuário/organização que faça login no mesmo navegador/tablet de curral pode ler registros offline e acionar a sincronização de mutações pendentes de outro tenant.
2. **Crescimento ilimitado da tabela `audit_log`** (`offlineDb.ts:L177-L184`, `L351`): Não há política de retenção/expurgo para `audit_log`, o que pode acumular dados sensíveis indefinidamente e eventualmente causar `QuotaExceededError` em dispositivos móveis.

---

#### 2. `src/lib/offline/syncEngine.ts`

- **Arquivo**: `src/lib/offline/syncEngine.ts` (1209 linhas analisadas) — Motor offline-first singleton responsável por controle de estado online/offline, enfileiramento FIFO de mutações (`sync_queue`), sincronização de subida (`syncNow`), download completo (`syncDownAllData`) e seletivo pré-curral (`downloadFarmDataForCurral`), gravação otimista de manejos/animais offline e exportação de backup JSON ("caixa-preta").
- **Status**: `CRÍTICO`

##### Erros e Bugs
1. **CRÍTICO — Injeção indevida de `organization_id` quebra 100% das mutações offline em `iatf_lot_animals`** (`syncEngine.ts:L160-L162`, `L240-L242`): Tanto `enqueueMutation` quanto `syncNow` injetam `payload.organization_id` em toda mutação (exceto `table === 'custom_rpc'`). Contudo, a tabela `iatf_lot_animals` no PostgreSQL (`supabase/migrations/001_initial_schema.sql:L162-L177`) **NÃO possui coluna `organization_id`**. Consequentemente, todas as mutações offline em `iatf_lot_animals` (`recordOfflineStepD9` L562, `recordOfflineStepIA` L674, `recordOfflineStepDG` L769, `recordOfflineLotAnimalDG` L825 e `recordOfflineCreateAndAddAnimalToLot` L946) falharão permanentemente no PostgREST (`column "organization_id" of relation "iatf_lot_animals" does not exist`) e ficarão em loop infinito de retentativas a cada 60s.
2. **CRÍTICO — `syncNow` executa `.upsert()` com payloads parciais para `action === 'update'`, violando constraints `NOT NULL`** (`syncEngine.ts:L244-L248`): Para `item.action === 'update'`, `syncNow` chama `supabase.from(item.table).upsert(payload, { onConflict: 'id' })`. No PostgreSQL, `INSERT ... ON CONFLICT (id) DO UPDATE` valida colunas `NOT NULL` na fase de `INSERT` antes de resolver o conflito. Os payloads parciais enviados em:
   - `recordOfflineStepD0` (`L536-L542`: falta `farm_id`, `animal_id`, `start_date` em `animal_managements`)
   - `recordOfflineStepD9` (`L562-L566`, `L586-L593`: falta `lot_id`/`animal_id` em `iatf_lot_animals` e `farm_id`/`animal_id`/`start_date` em `animal_managements`)
   - `recordOfflineStepIA` (`L674-L700`: falta `farm_id`/`tag_number` em `animals`, `lot_id`/`animal_id` em `iatf_lot_animals`, `farm_id`/`animal_id`/`start_date` em `animal_managements`)
   - `recordOfflineStepDG` (`L769-L792`) e `recordOfflineLotAnimalDG` (`L825`)
   falham com erro `23502` (`null value in column ... violates not-null constraint`). Para `action === 'update'`, o método deveria executar `.update(payload).eq('id', item.record_id)`.
3. **CRÍTICO — `recordOfflineManagement` envia 6 colunas inexistentes para `animal_managements`** (`syncEngine.ts:L985-L999`): Enfileira `insert` em `animal_managements` com `step_code`, `date`, `inseminator`, `bull_name`, `doses_used` e `diagnosis_result`. Nenhuma dessas colunas existe em `animal_managements` (`006_animal_managements.sql:L5-L53`), e o método é efetivamente chamado em `src/lib/db.ts:8035`. Além disso, em `L978` checa `record.diagnosis_result === 'prenhe'`, ignorando `'prenha'`.
4. **ALTO — Itens presos permanentemente em status `'processing'` após fechamento/crash da aba** (`syncEngine.ts:L219-L222`, `L237`): `syncNow` muda o item para `status: 'processing'` antes da chamada de rede (`L237`), mas na próxima inicialização consulta apenas `.where('status').equals('pending')` (`L220-L221`). Se o navegador/app fechar ou travar durante a requisição, o item fica permanentemente preso em `'processing'`, nunca mais é reprocessado e nem aparece em `getPendingCount()` (`L136-L139`).
5. **ALTO — Loop infinito de retentativas sem limite de `retry_count` nem distinção de erro permanente vs erro de rede** (`syncEngine.ts:L268-L280`): Em qualquer erro (ex.: 400/403/409/23502/42703), o item volta para `status: 'pending'` com `retry_count + 1` e o `setInterval` de 60s (`L55-L59`) tenta reenviar infinitamente sem backoff, sem dead-letter (`status: 'failed'` nunca é usado apesar de tipado em `offlineDb.ts:L172`), e sem detectar falhas de rede para chamar `markOffline()`.
6. **MÉDIO — `enqueueMutation` checa `table !== 'custom_rpc'` em vez de `action !== 'custom_rpc'`** (`syncEngine.ts:L160`): Quando `action === 'custom_rpc'`, `table` contém o nome da RPC (ex.: `'fn_...'`), não a string `'custom_rpc'`. Logo, `payload.organization_id` é injetado indevidamente nos argumentos de qualquer RPC enfileirada, podendo causar erro de assinatura de função no PostgreSQL (`function ... does not exist`).
7. **MÉDIO — `recordOfflineStepIA` e `recordOfflineStepDG` atualizam TODOS os vínculos `lot_animals` do animal em todos os lotes/estações** (`syncEngine.ts:L647-L666`, `L748-L761`): Ao fazer `.where('animal_id').equals(data.animal_id).toArray()` sem filtrar por `lot_id`, o código sobrescreve `bull_id`, `semen_batch_id`, `current_step`, `pregnancy_status` e `is_pregnant` em lotes históricos antigos da mesma matriz no IndexedDB.
8. **MÉDIO — `recordOfflineManagementStart` omite campos essenciais no cache local `offlineDb.animal_managements`** (`syncEngine.ts:L483-L495`): Salva apenas `step_code`, `date`, `inseminator`, `notes`, omitindo `protocol_id`, `season_id`, `start_date`, `d0_executed_at`, `d9_date`, `ia_date`, `dg_date`, `status` e `pregnancy_status` que existem no payload enfileirado (`L497-L515`). Com isso, a leitura offline imediata não enxerga as datas planejadas nem o status do protocolo iniciado.
9. **MÉDIO — `parseFloat(data.ecc_ia)` sem validação de `NaN`** (`syncEngine.ts:L622`, `L660`, `L679`, `L690`): Se `data.ecc_ia` vier com vírgula brasileira (`"3,5"`) vira `3`; se vier texto inválido (`"abc"`), `parseFloat` retorna `NaN`, que vira `null` ou erro de serialização dependendo do contexto.
10. **MÉDIO — `recordOfflineStepDG` usa `data.ecc_dg || null` em `lot_animals` (`L756`) e `data.ecc_dg ?? null` no resto (`L728`, `L772`, `L781`)**, além de mapear `'inconclusivo'` para `repStatus = 'vazia'` (`L717`), alterando o status reprodutivo da matriz para `'vazia'` quando o diagnóstico foi inconclusivo.
11. **MÉDIO — `recordOfflineLotAnimalDG` não limpa `notes` quando `notes === null` no payload enfileirado** (`syncEngine.ts:L809` vs `L822`): Localmente grava `notes: null`, mas no payload enviado ao servidor exige `notes !== undefined && notes !== null`, criando divergência entre estado local e remoto.
12. **BAIXO — `setInterval` e listeners de `window` criados no construtor sem método `destroy()`** (`syncEngine.ts:L41-L60`): Embora seja singleton, em ambientes de teste ou HMR (Hot Module Reload) do Next.js pode registrar múltiplos intervalos e listeners duplicados.

##### Divergências
1. **Inconsistência de `step_code` ao normalizar `animal_managements`** (`syncEngine.ts:L406-L412`, `L1158-L1164`): O mapeamento só deriva `'DG'`, `'IA'`, `'D9'` ou `'D0'`, ignorando `'D7'` e `'D8'` mesmo fazendo cast para `'D0' | 'D7' | 'D8' | 'D9' | 'IA' | 'DG'`.
2. **Divergência no `diagnosis_result` entre `recordOfflineStepDG` (`L731`) e `recordOfflineManagement` (`L978`)**: `L731` grava `'prenha'` ou `'duvidosa'`, enquanto `L978` testa `=== 'prenhe'`.
3. **Divergência no mapeamento de `animals` entre `syncDownAllData` (`L367-L384`) e `downloadFarmDataForCurral` (`L1101-L1108`)**: `syncDownAllData` normaliza `ear_tag`, `tag_number`, `name`, `breed`, `category` (string do join) e filtra `.eq('status', 'active')`; já `downloadFarmDataForCurral` faz `select('*')` e grava o registro cru do Supabase diretamente em `offlineDb.animals` (sem `ear_tag`, sem `name`, sem nomes resolvidos de `breed`/`category`), sobrescrevendo os campos normalizados pelo `syncDownAllData`.
4. **`syncDownAllData` não sincroniza dados excluídos no servidor (stale data)** (`syncEngine.ts:L342-L421`): Utiliza exclusivamente `bulkPut` e só quando `data.length > 0`. Registros deletados ou inativados no servidor (ou quando uma tabela fica vazia) jamais são removidos do IndexedDB.
5. **Limite silencioso de 5.000 registros** (`syncEngine.ts:L335`, `L338`): `iatf_lot_animals` e `animal_managements` usam `.limit(5000)` sem paginação nem aviso ao usuário, podendo deixar parte do rebanho indisponível offline em fazendas grandes.

##### Falta de Ligação nos Fluxos de Trabalho
1. **Baixa de sêmen offline nunca é sincronizada com o servidor** (`syncEngine.ts:L632-L634`, `L963-L965`): `recordOfflineStepIA` e `recordOfflineManagement` chamam `decrementLocalSemenBatch`, que decrementa `offlineDb.semen_batches` localmente, mas **NÃO enfileiram nenhuma mutação** para atualizar `semen_batches.used_quantity` ou chamar `fn_process_genetic_usage_iatf` no Supabase. No próximo `syncDownAllData` (`L284`, `L358`), o saldo local é sobrescrito pelo valor antigo do servidor e o consumo de doses da IA offline é perdido.
2. **Início de manejo / criação de animal em lote offline não atualiza `management_events` nem contadores completos** (`syncEngine.ts:L936-L943`): `recordOfflineCreateAndAddAnimalToLot` incrementa `females_count` apenas localmente no IndexedDB, mas `recordOfflineStepIA` e `recordOfflineStepDG` não atualizam `inseminated_count`/`pregnant_count` em `offlineDb.lots`.
3. **`recordOfflineLotAnimalDG` não atualiza `offlineDb.animals` nem enfileira atualização de `animals.reproductive_status`** (`syncEngine.ts:L798-L826`): Diferente de `recordOfflineStepDG` (`L740-L746`, `L788-L792`), atualizar DG pelo vínculo do lote deixa o status reprodutivo da matriz desatualizado tanto no cache local quanto no servidor.
4. **Falhas em `syncDownAllData` após `syncNow` são silenciosamente engolidas** (`syncEngine.ts:L284`): `this.syncDownAllData().catch(() => {});` descarta erros sem atualizar `lastError` nem notificar listeners.
5. **Ausência de `syncDownAllData` para o novo módulo de estoque genético** (`syncEngine.ts:L308-L340`): Apenas `genetic_centers` (salvo em `localStorage` em `L424`) e a tabela legada `semen_batches` são baixados; `semen_tanks`, `semen_tank_canisters` e `genetic_inventory_balances` não têm suporte offline.

##### Possíveis Brechas de Segurança
1. **ALTO — Queries em `syncDownAllData` e `downloadFarmDataForCurral` sem filtro explícito de `organization_id` (risco de vazamento multi-tenant com RLS permissiva)** (`syncEngine.ts:L335`, `L1046-L1047`, `L1115-L1135`):
   - Em `syncDownAllData` (`L335`), `iatf_lot_animals` é consultada sem `.eq('organization_id', ...)` nem filtro de lotes da organização.
   - Em `downloadFarmDataForCurral`, `breeds` (`L1046`), `animal_categories` (`L1047`), `protocols` (`L1116`), `bulls` (`L1126`) e `semen_batches` (`L1134`) são consultadas sem `.eq('organization_id', ...)`.
   - Considerando que o repositório contém policies de desenvolvimento abertas (`USING (true)` como visto em `006_animal_managements.sql:L66-L71` e `002_fix_rls_dev_policies.sql`), essas queries baixam dados de **todas as organizações** do banco para o IndexedDB local do cliente.
2. **ALTO — Confiança cega em `localStorage.getItem('iatf_current_org_id')` para atribuir `organization_id` em mutações** (`syncEngine.ts:L158`, `L232`, `L241`, `L304`): Um usuário ou script pode alterar `iatf_current_org_id` no `localStorage` e redirecionar leituras (`syncDownAllData`) e escritas (`syncNow`) para outra organização caso a RLS não bloqueie estritamente.
3. **MÉDIO — `exportBlackboxBackup` exporta todo o conteúdo de `audit_log`, `sync_queue` e `animal_managements` sem filtro por organização** (`syncEngine.ts:L1190-L1206`): Em dispositivos compartilhados, o arquivo JSON exportado pode vazar dados de outras organizações presentes no IndexedDB.

---

#### 3. `src/lib/services/geneticInventoryService.ts`

- **Arquivo**: `src/lib/services/geneticInventoryService.ts` (1288 linhas analisadas) — Camada de serviço do módulo de estoque genético (sêmen e embriões): métricas de dashboard, gestão de botijões/canecas/nitrogênio, consulta de saldos e posições por animal, operações transacionais via RPCs (`inbound`, `outbound`, `transfer`, `adjustment`, `reversal`), histórico/livro-razão, comprovantes de retirada, clientes/centrais e exportação para Excel via SheetJS (`xlsx`).
- **Status**: `CRÍTICO`

##### Erros e Bugs
1. **ALTO — Parâmetro `materialType` em `getInventoryDashboardMetrics` é completamente ignorado** (`geneticInventoryService.ts:L27-L30`, `L45`, `L52-L63`, `L135-L152`): A função aceita `materialType?: GeneticMaterialType` e inclui o valor na `cacheKey` (`L45`), porém nunca filtra `balances`, `movements` (30 dias) nem `historicalMovs` (6 meses) por `materialType`.
2. **ALTO — Filtros `breedId` e `centerId` em `getInventoryBalances` são ignorados** (`geneticInventoryService.ts:L479-L480`, `L488-L586`): A interface `InventoryFilterParams` expõe `breedId?: string` e `centerId?: string`, mas nenhuma linha de `getInventoryBalances` aplica esses filtros (nem na query Supabase nem na filtragem em memória `L549-L583`).
3. **ALTO — Campo `donor_rgd` nunca é selecionado na query de `getInventoryBalances`, mas é lido em `searchAnimalGeneticPositions` e `exportInventoryToExcel`** (`geneticInventoryService.ts:L504-L515`, `L611`, `L618`, `L1179`): O `select` em `getInventoryBalances` seleciona `donor_name` (`L511`), mas omite `donor_rgd`. Como resultado, `animalCode`/`animalRgd` para embriões em `searchAnimalGeneticPositions` (`L611`, `L618`) e a coluna `'Código / RGD'` no Excel (`L1179`) ficam sempre vazios/`'-'`.
4. **ALTO — `updateTank` espalha `Partial<SemenTank>` diretamente no `.update()`, podendo falhar com colunas virtuais inexistentes** (`geneticInventoryService.ts:L360-L379`): A interface `SemenTank` (`src/lib/types/genetic-inventory.ts:L71-L73`) inclui campos calculados que não existem na tabela `semen_tanks` (`total_doses`, `canisters_count`, `last_measurement_date`), além do campo retornado no join `semen_tank_canisters` (`L221`, `L243`). Passar `...updates` diretamente para `.update()` sem whitelist de colunas faz o Supabase retornar erro de coluna inexistente caso o caller envie o objeto `SemenTank`.
5. **ALTO — Bug de data em `getInventoryDashboardMetrics` nos dias 29, 30 e 31 do mês** (`geneticInventoryService.ts:L144-L146`, `L155-L160`):
   - Em `L145-L146`, `sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5)` é chamado **antes** de `setDate(1)`. Se hoje for 31 de março ou 31 de maio, subtrair 5 meses pode sofrer overflow para o mês seguinte.
   - Em `L156-L158`, `const d = new Date(); d.setMonth(d.getMonth() - i);` sofre overflow no dia 31 (ex.: em 31/03, `i = 1` vira 03/03 em vez de fevereiro), fazendo o gráfico mensal pular fevereiro e duplicar/sobrescrever março no `monthsMap`.
6. **ALTO — Inserção não-atômica em `processInbound` gera registros órfãos em caso de falha** (`geneticInventoryService.ts:L683-L757`): Quando `payload.isNewMaterial` é `true`, o código executa 3 chamadas separadas: `INSERT genetic_materials` (`L683`), `INSERT genetic_material_batches` (`L709`) e `RPC fn_process_genetic_inbound` (`L739`). Se a criação do lote ou a RPC falhar (ex.: quantidade inválida, erro de permissão ou rede), `genetic_materials` e/ou `genetic_material_batches` já foram commitados no banco e ficam órfãos.
7. **MÉDIO — `createTank` ignora erro ao inserir canecas iniciais** (`geneticInventoryService.ts:L341-L353`): `await supabase.from('semen_tank_canisters').insert(canisterRecords)` não captura nem verifica `{ error }`, podendo retornar `{ success: true }` com um botijão criado sem nenhuma caneca.
8. **MÉDIO — `processInbound` falha silenciosamente ou grava dados incompletos ao sincronizar `semen_batches`** (`geneticInventoryService.ts:L760-L770`):
   - Não verifica `{ error }` do `.insert()` em `semen_batches`.
   - Quando `!payload.isNewMaterial`, `payload.sireId` e `payload.batchNumber` normalmente não vêm preenchidos (apenas `batchId`), fazendo a sincronização retrocompatível ser pulada silenciosamente.
   - Quando `payload.isNewMaterial` é `true` e o usuário faz uma nova entrada para o mesmo lote ou já existe partida, sempre faz `INSERT` em `semen_batches` em vez de somar à partida existente, duplicando registros.
9. **MÉDIO — `exportInventoryToExcel` formata `'undefined - undefined'` e `'Caneca undefined'` se joins vierem nulos** (`geneticInventoryService.ts:L1186-L1187`, `L1193`): Não usa fallback para `b.semen_tanks?.number`, `b.semen_tanks?.name`, `b.semen_tank_canisters?.position_number`, nem trata `b.last_movement_at` nulo (`new Date(undefined)` gera `"Invalid Date"`).
10. **MÉDIO — `getInventoryDashboardMetrics` executa duas queries redundantes em `genetic_inventory_movements`** (`geneticInventoryService.ts:L135-L152`): Busca os últimos 30 dias (`L135`) e imediatamente busca os últimos 6 meses da mesma tabela (`L148`), quando os últimos 30 dias já estão contidos no resultado de 6 meses. Além disso, `L139` e `L152` não verificam `{ error }` das 4 queries do dashboard.
11. **BAIXO — `getMovementHistory` com `endDate` em formato `YYYY-MM-DD` exclui movimentações do próprio dia final** (`geneticInventoryService.ts:L984-L986`): `.lte('occurred_at', filters.endDate)` compara um `TIMESTAMPTZ` com `'YYYY-MM-DD'` (interpretado como `00:00:00Z`), excluindo todas as movimentações ocorridas após meia-noite no `endDate`.

##### Divergências
1. **RPCs `fn_process_genetic_inbound` e `fn_process_genetic_outbound` suportam `p_idempotency_key`, mas o serviço nunca envia** (`geneticInventoryService.ts:L739-L752`, `L792-L809` vs `supabase/migrations/007_genetic_inventory_module.sql:L265`, `L339`): Duplos cliques ou retries de rede podem registrar entradas/saídas duplicadas e emitir comprovantes duplicados.
2. **Inconsistência na trava de Fazenda Principal (`validateMainFarmSemenLock`)** (`geneticInventoryService.ts:L260-L287`): A trava é aplicada em `createTank` (`L311`), `recordNitrogenMeasurement` (`L424`), `processInbound` (`L652`), `processOutbound` (`L787`), `processTransfer` (`L835`), `processAdjustment` (`L877`) e `createClientRecord` (`L1076`), mas **é omitida** em `updateTank` (`L360`), `processReversal` (`L907`) e `getOrCreateFarmClientRecord` (`L1103`).
3. **Divergência no retorno de `searchAnimalGeneticPositions` para `breedName`** (`geneticInventoryService.ts:L619` vs `L570` e `L1180`): Em `L570` e `L1180` o fallback de raça é `mat?.breeds?.name || mat?.bulls?.breeds?.name || mat?.animals?.breeds?.name`, mas em `L619` usa apenas `mat?.breeds?.name || null`, deixando a raça vazia quando definida no touro ou na doadora.

##### Falta de Ligação nos Fluxos de Trabalho
1. **Sincronização unidirecional e incompleta com a tabela legada `semen_batches`**: `processInbound` (`L760-L770`) insere em `semen_batches`, mas `processOutbound`, `processAdjustment` e `processReversal` **não** atualizam `semen_batches`. Com isso, o estoque visto no módulo IATF/offline (`semen_batches`) diverge permanentemente do estoque do módulo genético (`genetic_inventory_balances`).
2. **Nenhuma integração com `offlineDb`/`syncEngine`**: Todas as funções de `geneticInventoryService.ts` chamam o Supabase diretamente, sem fallback offline e sem enfileiramento no `syncEngine`, deixando o módulo genético inoperante sem internet.
3. **Falta de `invalidateCache()` após mutações de clientes** (`geneticInventoryService.ts:L1066-L1147`): `createClientRecord` e `getOrCreateFarmClientRecord` não invalidam cache (nem existe cache para clientes, diferentemente de `tanks` e `metrics`).
4. **Invalidação global excessiva de cache** (`geneticInventoryService.ts:L377`, `L444`, `L772`, `L816`, `L862`, `L903`, `L930`): Chama `invalidateCache()` sem argumento (limpando todo o cache da aplicação inteira em vez de prefixos específicos).

##### Possíveis Brechas de Segurança
1. **CRÍTICO — RPCs `SECURITY DEFINER` aceitam `p_organization_id` e `p_farm_id` do cliente sem verificação de pertencimento/autorização no banco + trava `validateMainFarmSemenLock` apenas client-side** (`geneticInventoryService.ts:L260-L287`, `L429`, `L739`, `L792`, `L840`, `L882`, `L917` vs `007_genetic_inventory_module.sql:L269`, `L343`, `L449`, `L636`, `L731`, `L832`):
   - Como as 6 RPCs rodam como `SECURITY DEFINER` (contornando RLS) e aceitam `p_organization_id` e `p_farm_id` fornecidos pelo frontend sem validar `auth.uid()` contra `organization_members`, qualquer usuário autenticado pode invocar diretamente as RPCs do Supabase passando `organization_id`/`farm_id` de **outro tenant** (IDOR cross-tenant), adulterando saldos, registrando saídas, estornos ou medições de nitrogênio de terceiros.
   - `validateMainFarmSemenLock` (`L260-L287`) é executada apenas no navegador, usa heurística frágil `.ilike('name', '%principal%')` e é **fail-open** (`L282-L286`: em caso de exceção retorna `{ allowed: true }`), sendo trivialmente contornável.
2. **ALTO — `updateTank`, `getCanisters`, `getNitrogenHistory`, `getInventoryBalances`, `getMovementHistory`, `getWithdrawalReceipts`, `getClients` e `getGeneticCenters` não filtram por `organization_id`** (`geneticInventoryService.ts:L365-L371`, `L383-L387`, `L450-L458`, `L494-L524`, `L949-L973`, `L1003-L1037`, `L1053-L1057`, `L1151-L1155`):
   - `updateTank` atualiza apenas por `.eq('id', tankId)` sem checar `organization_id` ou `farm_id` nem chamar `getCurrentOrgId()`.
   - As consultas de leitura dependem 100% de `farmId` (ou `tankId`) vindo da UI e da RLS do banco; caso RLS esteja permissiva em algum ambiente, há risco direto de IDOR horizontal entre organizações.
3. **MÉDIO — `operatorName` (`p_created_by` / `p_measured_by`) confiável apenas no parâmetro do cliente** (`geneticInventoryService.ts:L416`, `L644`, `L779`, `L827`, `L869`, `L911`): O nome do operador gravado no livro-razão imutável e nos comprovantes de retirada vem de uma string livre passada pelo cliente (default `'Operador'`), permitindo falsificação de autoria na trilha de auditoria.
4. **MÉDIO — Potencial Formula Injection (CSV/Excel Injection) na exportação via `xlsx`** (`geneticInventoryService.ts:L1168-L1257`): Campos controlados pelo usuário (`animalName`, `batch_number`, `reason`, `notes`, `created_by`, `genetic_clients.name`) são enviados sem sanitização de prefixos (`=`, `+`, `-`, `@`, `\t`, `\r`) para `XLSX.utils.json_to_sheet(rows)`. Além disso, `farmName` é interpolado diretamente no nome do arquivo (`L1222`, `L1256`) substituindo apenas espaços (`/\s+/g`), sem remover caracteres inválidos de caminho (`/`, `\`, `:`, `*`, `?`).

---

#### 4. `src/lib/excelFichaRelatorioExport.ts`

- **Arquivo**: `src/lib/excelFichaRelatorioExport.ts` (345 linhas analisadas) — Gerador de planilha Excel (`.xlsx`) via `exceljs` para a "Ficha Relatório Final" de lotes IATF, reproduzindo o layout impresso com logo Master Cria (opcional), tabela de 18 colunas mescladas por animal e segunda aba `Resumo_Estatistico` (por lote, por touro e por categoria), com download direto no navegador.
- **Status**: `MÉDIO`

##### Erros e Bugs
1. **ALTO — Crash e erro lógico na coloração do diagnóstico (`a.diagnostico.includes('PRENHA')`)** (`excelFichaRelatorioExport.ts:L260-L264`):
   - Não possui null-check: se `a.diagnostico` vier `undefined` ou `null`, lança `TypeError: Cannot read properties of undefined (reading 'includes')` abortando toda a exportação.
   - A checagem `includes('PRENHA')` é frágil: hoje só não pinta `'Não Prenha '` (enviado por `FichaRelatorioFinalView.tsx:L206`) de verde por acaso de capitalização (`'Prenha'` vs `'PRENHA'`). Se o valor vier em maiúsculas (`'NÃO PRENHA'`) ou em minúsculas (`'Prenha'` / `'prenha'`), o resultado é invertido (falso positivo para `'NÃO PRENHA'` e falso negativo para `'Prenha'`). Deveria normalizar e testar igualdade exata ou negação explícita.
2. **MÉDIO — Bug de layout na linha 7 (`Observações`) trunca o texto em apenas 5 colunas estreitas** (`excelFichaRelatorioExport.ts:L165-L173`): Mescla `A7:E7` (soma das larguras em `L83-L87` = `5 + 2.5 + 2 + 6 + 2 = 17.5` caracteres) e escreve `` `Observações: ${params.observacoes || ''}` `` em `A7`, deixando `F7:R7` mesclado e completamente vazio (`L172`). Como `"Observações: "` já consome 13 caracteres, praticamente qualquer observação é cortada visualmente no Excel/impressão. Deveria mesclar `A7:R7` (ou colocar o rótulo em `A7:C7` e o valor em `D7:R7`).
3. **MÉDIO — Data do nome do arquivo usa UTC (`toISOString().slice(0, 10)`) em vez do fuso horário local** (`excelFichaRelatorioExport.ts:L340`): No Brasil (UTC-3), exportações feitas entre 21:00 e 23:59 geram arquivo com a data do dia seguinte. O restante do sistema já dispõe de `getTodayDateString()` (`src/lib/dateUtils.ts`).
4. **MÉDIO — Nome do arquivo sem sanitização de `params.lotName`** (`excelFichaRelatorioExport.ts:L340`): Se `params.lotName` contiver `/` (ex.: `LOTE 01/2026`), `:`, `*` ou `?`, o nome de download pode ser truncado ou sanitizado de forma inconsistente pelo navegador/SO.
5. **BAIXO — Nome da aba principal hardcoded como `'Planilha3'`** (`excelFichaRelatorioExport.ts:L62`): Nome residual de planilha modelo importada, pouco profissional em um relatório oficial entregue ao produtor.

##### Divergências
1. **ALTO — Dados pessoais/reais de um cliente específico hardcoded como fallback** (`excelFichaRelatorioExport.ts:L137`):
   ```ts
   r5Cell.value = `Produtor:      ${params.produtor || 'RAMIRO ANTÔNIO DAVI'}                          - Propriedade: ${params.propriedade || 'FAZENDA SÃO LUCAS'}`;
   ```
   Se `params.produtor` ou `params.propriedade` estiverem vazios, o relatório oficial de **qualquer outro cliente/organização** é exportado com o nome `'RAMIRO ANTÔNIO DAVI'` e `'FAZENDA SÃO LUCAS'` (o mesmo fallback hardcoded também aparece no caller `src/components/FichaRelatorioFinalView.tsx:L183-L184`).
2. **MÉDIO — Fallbacks zootécnicos arbitrários podem adulterar dados no relatório final** (`excelFichaRelatorioExport.ts:L233`, `L238`, `L243`, `L248`): Quando ausentes, preenche automaticamente categoria como `'MULTÍPARA'`, retiro como `'SEDE'` e touro como `'Rep. Touro'`, em vez de `'-'` ou `'N.I.'`, o que pode induzir erro zootécnico (ex.: uma novilha sem categoria cadastrada aparecer como `'MULTÍPARA'`).
3. **BAIXO — Campos da interface `ExportFichaParams` nunca utilizados** (`excelFichaRelatorioExport.ts:L13-L14`, `L30`): `iaPlannedDate`, `dgPlannedDate` e `stats.vazias` são exigidos pela interface, mas nunca renderizados em nenhuma das duas abas da planilha.

##### Falta de Ligação nos Fluxos de Trabalho
1. **Aba `Resumo_Estatistico` não inclui `stats.vazias` nem o total de diagnósticos pendentes/não avaliados** (`excelFichaRelatorioExport.ts:L288-L330`): Embora `params.stats.vazias` seja recebido, o resumo exibe apenas `total`, `prenhas` e `taxa`, omitindo a contagem de vazias.
2. **Falta de guarda de ambiente browser (`window`/`document`)** (`excelFichaRelatorioExport.ts:L337-L344`): Assume execução exclusiva no navegador sem verificação prévia.

##### Possíveis Brechas de Segurança
1. **ALTO — Vazamento de PII/dados de cliente real no código-fonte e em relatórios de terceiros** (`excelFichaRelatorioExport.ts:L137`): Nome completo de produtor (`RAMIRO ANTÔNIO DAVI`) e fazenda (`FAZENDA SÃO LUCAS`) hardcoded no bundle cliente público e injetados como fallback em relatórios de outras organizações (violação de confidencialidade / LGPD).
2. **BAIXO — Risco residual de Excel Formula Injection caso conteúdo seja reexportado/aberto em planilhas que interpretem strings iniciadas por `=`, `+`, `-`, `@`** (`excelFichaRelatorioExport.ts:L137`, `L168`, `L228`, `L243`, `L300`): No `exceljs`, atribuir strings a `cell.value` grava como string literal (`t="s"`), o que mitiga a execução automática no Excel, mas sanitizar entradas livres (`observacoes`, `produtor`, `propriedade`, `lotName`) continua sendo boa prática defensiva para interoperabilidade com outros leitores de planilhas.

---

#### Resumo Executivo do Lote 06

| Arquivo | Linhas | Status | Principais Achados |
|---|---:|---|---|
| `src/lib/offline/offlineDb.ts` | 361 | `ALTO` | Stores legadas/órfãs (`genetic_tanks/canisters/batches`), divergência de schema em `OfflineManagementRecord`/`OfflineAnimal`/`OfflineBull`, ausência de isolamento/limpeza multi-tenant no IndexedDB no logout. |
| `src/lib/offline/syncEngine.ts` | 1209 | `CRÍTICO` | Injeção de `organization_id` quebra 100% das mutações em `iatf_lot_animals`; `upsert` parcial em `update` viola `NOT NULL`; `recordOfflineManagement` envia 6 colunas inexistentes; itens presos em `processing`; loop infinito sem limite de retries; baixa de sêmen offline nunca sobe para o servidor; queries sem filtro de `organization_id`. |
| `src/lib/services/geneticInventoryService.ts` | 1288 | `CRÍTICO` | RPCs `SECURITY DEFINER` vulneráveis a IDOR cross-tenant + trava `validateMainFarmSemenLock` apenas client-side (fail-open e ausente em `updateTank`/`processReversal`/`getOrCreateFarmClientRecord`); filtros `materialType`, `breedId`, `centerId` ignorados; `donor_rgd` omitido no `select`; bug de calendário `setMonth` nos dias 29-31; `processInbound` não-atômico; divergência permanente com `semen_batches`. |
| `src/lib/excelFichaRelatorioExport.ts` | 345 | `MÉDIO` | PII de cliente real hardcoded como fallback (`L137`); `a.diagnostico.includes('PRENHA')` sem null-check e frágil a maiúsculas/minúsculas; `Observações` truncado em `A7:E7`; defaults zootécnicos forçados (`MULTÍPARA`, `SEDE`); data em UTC e filename sem sanitização. |

---

### Lote 07 — Componentes Shell, Navegação, Offline UI e Modais de Manejo

### Relatório de Auditoria Técnica — Lote 07 (Componentes Shell, Navegação, Offline UI e Modais de Manejo)

Auditoria estática somente leitura linha por linha nos 11 arquivos designados.

---

#### 1. `src/components/AppShell.tsx`
- **Arquivo**: `src/components/AppShell.tsx` — 156 linhas — Shell global da aplicação (guarda de autenticação client-side, suporte a sessão offline "Modo Curral", provedores `FarmProvider`/`SeasonProvider`, layout com `Sidebar` e `Header`).
- **Status**: `CRÍTICO`
- **Erros e Bugs**:
  - `AppShell.tsx:L51-L60`: Exige `hasTabSession` (`sessionStorage.getItem('iatf_tab_session')`) mesmo quando `supabase.auth.getSession()` retorna uma sessão válida. Como `sessionStorage` é isolado por aba, abrir qualquer rota interna em uma nova aba (Ctrl+Click, `target="_blank"`, ou restauração de aba) faz `!hasTabSession` ser verdadeiro e executa `await supabase.auth.signOut()` (`L57`), **derrubando a sessão global do usuário em todas as abas**.
  - `AppShell.tsx:L66-L75`: No `catch` de `supabase.auth.getSession()`, quando o usuário está online (`isOffline === false`) mas ocorre erro de rede/DNS/TLS, o código apenas loga `console.warn` (`L72`) e segue para `setCheckingAuth(false)` (`L75`), liberando a renderização da área autenticada sem sessão confirmada.
  - `AppShell.tsx:L38`: Checa offline apenas via `!navigator.onLine`, ignorando o modo offline forçado do `syncEngine` (`localStorage.getItem('iatf_force_offline')`). Se o operador ativar "Forçar Modo Offline" com sinal instável (`navigator.onLine === true`), o shell ainda tenta validar sessão online.
  - `AppShell.tsx:L21, L94`: Acesso direto a `localStorage.getItem`/`setItem` sem `try/catch` (pode lançar exceção em modo privado restrito ou quota excedida).
- **Divergências**:
  - `AppShell.tsx:L40, L55, L64` vs `Sidebar.tsx:L111-L120` e `Navigation.tsx:L59-L68`: `AppShell` grava a flag persistente `iatf_offline_session_active` no `localStorage` (`L64`), mas os handlers de logout em `Sidebar.tsx` e `Navigation.tsx` **não removem** essa chave.
  - `AppShell.tsx:L142-L145`: Passa a prop `collapsed={collapsed}` para `Header`, que não é utilizada em `Header.tsx:L41`.
- **Falta de Ligação nos Fluxos de Trabalho**:
  - `AppShell.tsx:L28-L82`: Não assina `supabase.auth.onAuthStateChange`; expiração de token ou logout em outra aba só é percebido se houver navegação (`pathname`).
- **Possíveis Brechas de Segurança**:
  - **CRÍTICO — Bypass de autenticação offline após logout (`AppShell.tsx:L38-L45` + `Sidebar.tsx:L111-L120`)**: Quando `!navigator.onLine` e `localStorage.getItem('iatf_offline_session_active')` está presente, `verifyAuth` retorna imediatamente e libera toda a aplicação sem verificar token, expiração ou PIN. Como `Sidebar.handleLogout` não remove `iatf_offline_session_active` (nem limpa o IndexedDB/Dexie), qualquer pessoa com acesso físico ao tablet/celular pode, após o usuário fazer logout, desligar a internet e reabrir o app para acessar todos os dados locais.
  - **ALTO — Fail-open em exceção de verificação de sessão (`AppShell.tsx:L66-L75`)**: Falha de rede ao chamar `getSession()` libera `checkingAuth = false` em vez de bloquear ou redirecionar para `/login`.

---

#### 2. `src/components/Header.tsx`
- **Arquivo**: `src/components/Header.tsx` — 292 linhas — Cabeçalho fixo com título contextual por rota, seletores de Fazenda (`FarmContext`) e Estação de Monta (`SeasonContext`), `SyncStatusBadge`, `ThemeToggle`, links rápidos e `CurralPrepModal`.
- **Status**: `MÉDIO`
- **Erros e Bugs**:
  - `Header.tsx:L88-L91`: `PAGE_TITLES[pathname]` faz lookup exato. Em rotas dinâmicas como `/animals/[id]`, cai no fallback genérico `'Plataforma IATF Master'`.
  - `Header.tsx:L135, L171`: Fallback hardcoded de UF para `'MT'` (`activeFarm.state || 'MT'` e `farm.state || 'MT'`), exibindo Mato Grosso incorretamente para fazendas sem estado preenchido.
  - `Header.tsx:L246`: Qualquer estação com `s.status !== 'active'` é rotulada como `'Encerrada'`, mesmo que possua outro status (ex.: planejada/futura).
- **Divergências**:
  - `Header.tsx:L33` vs `Sidebar.tsx:L56`: `PAGE_TITLES` mantém mapeamento para a rota legada `'/inputs'` ao lado de `'/estoque-semen'`, enquanto a `Sidebar` exibe apenas `'/estoque-semen'`.
  - `Header.tsx:L24, L41`: Prop `collapsed?: boolean` declarada na interface `HeaderProps`, porém ignorada no componente.
- **Falta de Ligação nos Fluxos de Trabalho**:
  - `Header.tsx:L273-L279`: O botão de ação rápida `"Novo Lote"` navega apenas para `/lots`, sem parâmetro/estado para abrir diretamente o formulário de criação de lote.
  - `Header.tsx:L52-L60`: `getOrgMetadata()` é carregado apenas uma vez no mount (`[]`); edições em `/registries` não refletem no fallback `metadata` até reload completo.
- **Possíveis Brechas de Segurança**:
  - Nenhum achado relevante.

---

#### 3. `src/components/Sidebar.tsx`
- **Arquivo**: `src/components/Sidebar.tsx` — 385 linhas — Barra lateral fixa (desktop, colapsável) e drawer mobile com seções de navegação, perfil da organização/usuário, `ThemeToggle` e logout.
- **Status**: `ALTO`
- **Erros e Bugs**:
  - `Sidebar.tsx:L197`: `pathname === item.href` (comparação exata) deixa `Matrizes & Rebanho` (`/animals`) sem estado ativo ao visitar `/animals/[id]`.
  - `Sidebar.tsx:L122-L127`: Quando autenticado, `userDisplayName` prioriza `metadata?.farm?.technical_responsible` em vez do nome do usuário da sessão; qualquer colaborador logado vê o nome do responsável técnico da fazenda como seu próprio nome.
  - `Sidebar.tsx:L234-L238`: Tooltip no modo colapsado usa `fixed left-20` sem posicionamento vertical (`top`), desalinhando-se quando a área de links é rolada.
  - `Sidebar.tsx:L296`: O dropdown de usuário (`userDropdownOpen`) não possui listener de clique fora nem fecha automaticamente ao trocar de rota.
  - `Sidebar.tsx:L173-L178`: Botão de fechar drawer mobile sem `aria-label` e sem suporte à tecla `Escape`.
- **Divergências**:
  - `Sidebar.tsx:L301`: Badge de perfil hardcoded como **`Admin`** para todos os usuários autenticados, independentemente da permissão real na organização.
  - `Sidebar.tsx:L276`: Fallback de avatar hardcoded como `'SD'` (além de ser código morto porque `initials` em `L139` já garante fallback `'US'`).
- **Falta de Ligação nos Fluxos de Trabalho**:
  - `Sidebar.tsx:L90-L109`: `loadData()` executa apenas no mount (`[]`), não reagindo a atualizações de organização ou troca de sessão.
  - `Sidebar.tsx:L111-L120`: `handleLogout` não limpa chaves persistentes de contexto (`iatf_offline_session_active`, `iatf_active_farm_id`, `iatf_current_org_id`) nem o banco local Dexie/IndexedDB.
- **Possíveis Brechas de Segurança**:
  - **ALTO — Logout incompleto com persistência de sessão offline e cache local (`Sidebar.tsx:L111-L120`)**: Remove apenas `sessionStorage.removeItem('iatf_tab_session')` e chama `signOut()`, deixando `localStorage.iatf_offline_session_active` ativo e dados sensíveis no IndexedDB, possibilitando acesso offline sem login (vide `AppShell.tsx:L40-L45`).
  - **MÉDIO — Ausência de RBAC na interface (`Sidebar.tsx:L64, L301`)**: Exibe o item `/team` (`Equipe & Acessos`) e o rótulo `Admin` para qualquer usuário autenticado, independentemente do papel.

---

#### 4. `src/components/Navigation.tsx`
- **Arquivo**: `src/components/Navigation.tsx` — 242 linhas — Barra de navegação horizontal superior (versão legada anterior ao `AppShell`/`Sidebar`/`Header`).
- **Status**: `MÉDIO`
- **Erros e Bugs**:
  - `Navigation.tsx:L33-L53`: `useEffect` dependente de `[pathname]` executa `getOrgMetadata()` e `supabase.auth.getUser()` (requisição de rede) a cada troca de rota, sem proteção contra `setState` após unmount e sem `try/catch` para falhas offline.
  - `Navigation.tsx:L124`: Estação/safra hardcoded como **`2025/2026`** em vez de consumir `SeasonContext`.
- **Divergências**:
  - `Navigation.tsx:L77`: Aponta `Estoque` para `/inputs` em vez de `/estoque-semen` e omite `/team` (`Equipe & Acessos`).
  - `Navigation.tsx:L178` e `L159`: Papel hardcoded como `Admin` e fallback `'SD'`.
- **Falta de Ligação nos Fluxos de Trabalho**:
  - **Código morto**: `Navigation.tsx` não é importado nem renderizado em nenhum ponto do projeto (`src/app/layout.tsx` utiliza `AppShell`).
- **Possíveis Brechas de Segurança**:
  - `Navigation.tsx:L59-L68`: Mesmo problema de logout incompleto (não limpa `iatf_offline_session_active` nem cache IndexedDB).

---

#### 5. `src/components/PWAInstallPrompt.tsx`
- **Arquivo**: `src/components/PWAInstallPrompt.tsx` — 118 linhas — Banner flutuante de instalação PWA (Android/Chrome via `beforeinstallprompt` e instruções manuais para iOS Safari).
- **Status**: `MÉDIO`
- **Erros e Bugs**:
  - `PWAInstallPrompt.tsx:L37-L46`: **Vazamento de event listener no iOS**: quando `isIosDevice && !isApp && !dismissed`, o `useEffect` retorna `() => clearTimeout(timer)` na `L44`, impedindo a execução do cleanup em `L48-L50` (`removeEventListener('beforeinstallprompt', ...)`).
  - `PWAInstallPrompt.tsx:L55-L64`: Se o usuário clicar em "Instalar Aplicativo Agora" e recusar o prompt nativo (`choice.outcome === 'dismissed'`), `setDeferredPrompt(null)` (`L62`) zera o evento mas `showPrompt` permanece `true`, deixando o botão de instalação visível e completamente inoperante. Além disso, `deferredPrompt.prompt()` não tem `try/catch`.
  - `PWAInstallPrompt.tsx:L66-L71`: `handleDismiss` só persiste o descarte em `sessionStorage` para iOS; em Android/Chrome o banner volta a aparecer sem persistir dispensa.
  - `PWAInstallPrompt.tsx:L26-L27`: Detecção de iOS baseada apenas em `/iphone|ipad|ipod/` falha em iPadOS moderno (que envia `Macintosh` no User-Agent).
- **Divergências**:
  - Nenhum achado relevante.
- **Falta de Ligação nos Fluxos de Trabalho**:
  - Renderizado globalmente em `src/app/layout.tsx:L72` inclusive sobre `/login`, sem verificar rota ou sobreposição com ações inferiores em mobile.
- **Possíveis Brechas de Segurança**:
  - Nenhum achado relevante.

---

#### 6. `src/components/PWARegistration.tsx`
- **Arquivo**: `src/components/PWARegistration.tsx` — 45 linhas — Registro do Service Worker (`/sw.js`) e detecção de `updatefound`.
- **Status**: `BAIXO`
- **Erros e Bugs**:
  - `PWARegistration.tsx:L17-L27`: O comentário indica verificação periódica de atualizações, mas não há agendamento nem chamada a `registration.update()`.
  - `PWARegistration.tsx:L22-L24`: Quando há nova versão instalada (`newWorker.state === 'installed' && navigator.serviceWorker.controller`), apenas faz `console.log`, sem avisar o usuário ou oferecer atualização controlada.
- **Divergências**:
  - Nenhum achado relevante (`public/sw.js` existe no projeto).
- **Falta de Ligação nos Fluxos de Trabalho**:
  - Ausência de integração com banner/toast para operadores atualizarem a versão PWA em campo sem perder dados pendentes.
- **Possíveis Brechas de Segurança**:
  - Nenhum achado relevante.

---

#### 7. `src/components/ThemeToggle.tsx`
- **Arquivo**: `src/components/ThemeToggle.tsx` — 71 linhas — Botão alternador de tema Claro/Escuro nas variantes `compact` (Header) e `full` (Sidebar).
- **Status**: `BAIXO`
- **Erros e Bugs**:
  - `ThemeToggle.tsx:L25-L34` vs `L53-L67`: **Inconsistência visual entre variantes**: na variante `full`, quando `isDark === true`, exibe ícone `<Sun>` + texto `'Modo Claro'` (ação) e badge `'Escuro'` (estado atual); na variante `compact`, quando `isDark === true`, exibe `<Moon>` (`opacity-100`) e esconde `<Sun>` (`opacity-0`).
  - `ThemeToggle.tsx:L21, L32`: Na variante `full`, classes fixas de tema escuro (`text-slate-300`, `bg-slate-800`) sem variantes claras explícitas (dependem de sobrescrita CSS global).
- **Divergências**:
  - Nenhum achado relevante.
- **Falta de Ligação nos Fluxos de Trabalho**:
  - Nenhum achado relevante.
- **Possíveis Brechas de Segurança**:
  - Nenhum achado relevante.

---

#### 8. `src/components/offline/CurralPrepModal.tsx`
- **Arquivo**: `src/components/offline/CurralPrepModal.tsx` — 307 linhas — Modal de preparação offline pré-curral para seleção de lotes e download seletivo via `syncEngine.downloadFarmDataForCurral`.
- **Status**: `MÉDIO`
- **Erros e Bugs**:
  - `CurralPrepModal.tsx:L44-L66, L126-L132`: `downloadResult` e `errorMsg` não são resetados no `useEffect` quando `isOpen` volta a `true`. Se o usuário fechar o modal pelo botão `X` (`L127`, que chama apenas `onClose()`) após um download bem-sucedido, ao reabrir o modal verá indefinidamente a tela de sucesso anterior sem poder baixar novamente.
  - `CurralPrepModal.tsx:L51` vs `L80-L83`: `getLots(false, activeFarmId!)` carrega lotes da fazenda sem filtrar por `activeSeasonId`, enquanto `downloadFarmDataForCurral` recebe `activeSeasonId` e o banner exibe `activeSeason?.name` (`L152`), podendo gerar divergência entre os lotes listados/contados e os efetivamente baixados.
  - `CurralPrepModal.tsx:L70-L97`: Não verifica previamente se o app está offline ou em modo offline forçado antes de tentar baixar do servidor.
  - `CurralPrepModal.tsx:L196-L201`: `<input type="checkbox" checked={isSelected} onChange={() => {}} />` com `onChange` vazio quebra a interação por teclado (`Espaço`) no checkbox.
- **Divergências**:
  - `CurralPrepModal.tsx:L174`: Texto afirma `"Todos os lotes ativos (N)"`, mas `lots` contém todos os lotes não arquivados retornados por `getLots(false, activeFarmId!)`, incluindo concluídos/encerrados.
- **Falta de Ligação nos Fluxos de Trabalho**:
  - `CurralPrepModal.tsx:L70-L97`: Após baixar a base local, não há notificação/evento para atualizar telas abertas ou confirmar estado sincronizado no `SyncStatusBadge` caso o `syncEngine` não atualize `lastSyncAt`.
- **Possíveis Brechas de Segurança**:
  - Nenhum achado relevante.

---

#### 9. `src/components/offline/SyncStatusBadge.tsx`
- **Arquivo**: `src/components/offline/SyncStatusBadge.tsx` — 257 linhas — Badge de status de rede/fila offline no Header com popover para sincronização manual, toggle de modo offline forçado, preparação pré-curral e exportação de backup JSON.
- **Status**: `MÉDIO`
- **Erros e Bugs**:
  - `SyncStatusBadge.tsx:L21-L27`: `isOnline` inicializado com `typeof window !== 'undefined' ? navigator.onLine : true` pode causar **hydration mismatch** quando o app é carregado offline via PWA/Service Worker.
  - `SyncStatusBadge.tsx:L37-L41`: Dispara `syncEngine.syncDownAllData()` no mount sempre que `navigator.onLine` é verdadeiro, **ignorando `syncEngine.getForcedOffline()`** (se o modo offline forçado estiver ativo, ainda tenta baixar dados).
  - `SyncStatusBadge.tsx:L56-L58`: `handleSyncNow` não trata exceções (`try/catch`), podendo gerar *unhandled promise rejection*.
  - `SyncStatusBadge.tsx:L60-L75`: Falha na exportação do backup JSON apenas faz `console.error` e fecha o menu (`L241`) sem exibir erro ao operador.
  - `SyncStatusBadge.tsx:L199-L216`: Lê `syncEngine.getForcedOffline()` diretamente no render em vez de manter no estado `syncState` vindo do `subscribe`, acoplando a re-renderização do botão a efeitos colaterais internos do `syncEngine`.
- **Divergências**:
  - `SyncStatusBadge.tsx:L91` vs `L87-L88, L112-L116`: Quando online com `pendingCount > 0`, o tooltip (`title`) exibe `'Online - Sincronizado'`, contradizendo o contador amarelo de mutações pendentes.
- **Falta de Ligação nos Fluxos de Trabalho**:
  - `SyncStatusBadge.tsx:L238-L251`: Exporta o arquivo de backup "Caixa-Preta" (`.json`), mas não existe interface correspondente para **importar/reprocessar** esse backup em caso de perda do IndexedDB.
- **Possíveis Brechas de Segurança**:
  - `SyncStatusBadge.tsx:L60-L75`: Exportação de backup local em JSON em texto claro para a pasta de Downloads sem aviso de sensibilidade em dispositivos compartilhados.

---

#### 10. `src/components/AnimalManagementModal.tsx`
- **Arquivo**: `src/components/AnimalManagementModal.tsx` — 994 linhas — Modal de manejo reprodutivo individual por matriz (D0/Início, Retirada D9, Inseminação IA e Diagnóstico de Gestação DG).
- **Status**: `ALTO`
- **Erros e Bugs**:
  - **Corrupção de dados touro × partida de sêmen (`AnimalManagementModal.tsx:L749-L754, L217-L219`)**: Ao trocar `selectedBullId` na aba IA para um touro com 0 ou mais de 1 partida, `selectedBatchId` **não é limpo**. Como `availableBatches` (`L218`) inclui `|| b.id === selectedBatchId`, a partida do touro anterior permanece selecionada, permitindo registrar IA com o Touro B descontando dose da partida do Touro A.
  - **Filtro de partidas quebra em modo offline (`AnimalManagementModal.tsx:L218, L752`)**: Filtra apenas por `(b.bulls as Record<string, unknown> | null)?.id === selectedBullId`, sem checar `b.bull_id` diretamente (ao contrário de `BatchLotManagementModal.tsx:L297`). Se o registro offline no Dexie não tiver o objeto aninhado `bulls`, nenhuma partida aparece para o touro.
  - **Previsão de parto incorreta / `NaN/NaN/NaN` (`AnimalManagementModal.tsx:L222-L243`)**:
    1. Como `iaDate` inicia com `getTodayDateString()` (`L95`), `effectiveMgmt?.ia_executed_at || effectiveMgmt?.ia_date || iaDate` (`L224`) nunca é vazio — tornando o fallback de DG direto (+250 dias, `L234-L241`) **código morto** e exibindo `hoje + 295 dias` erroneamente em toques avulsos.
    2. Se `effectiveMgmt?.ia_executed_at` vier em formato ISO timestamp completo (`YYYY-MM-DDTHH:mm:ssZ`), `new Date(baseDate + 'T00:00:00')` (`L226`) produz `Invalid Date` (`NaN/NaN/NaN`).
  - **Hardcode de nome pessoal (`AnimalManagementModal.tsx:L143`)**: Fallback `'MV. DR. SAMOEL DUARTE'` atribuído como responsável/inseminador padrão para qualquer organização sem veterinário cadastrado.
  - **Vazamento de estado entre animais e falta de cleanup (`AnimalManagementModal.tsx:L116-L188`)**: Não reseta `startNotes`, `d9Notes`, `iaNotes`, `dgNotes`, `d9DeviceLoss`, `selectedBullId`, `selectedBatchId` quando `animalId` muda com o modal montado, e `loadAux` não possui flag `mounted` contra race conditions.
- **Divergências**:
  - **Status de DG divergente**: `AnimalManagementModal.tsx:L104, L870-L881` suporta `'inconclusivo'`, enquanto `BatchLotManagementModal.tsx:L161` só trata `'prenha' | 'vazia' | 'pendente'`.
  - **Falta de escopo de fazenda nas listas auxiliares (`AnimalManagementModal.tsx:L124-L128`)**: `getSemenBatches()` e `getReproductiveSeasons()` são chamados sem `farmId`, podendo exibir partidas de sêmen e estações ativas de outras fazendas da mesma organização.
  - `AnimalManagementModal.tsx:L777-L784`: Exibe e permite selecionar partidas de sêmen com saldo `<= 0` sem validação nem bloqueio.
- **Falta de Ligação nos Fluxos de Trabalho**:
  - `AnimalManagementModal.tsx:L388-L395`: Link `Ficha completa` (`/animals/${animalId}`) não fecha o modal (`onClose`) e continua sendo exibido mesmo quando o modal foi aberto a partir da própria página `/animals/${animalId}`.
  - `AnimalManagementModal.tsx:L706-L708` vs `L747-L786`: Informa abatimento automático de 1 dose de sêmen, mas os selects de touro e partida não são obrigatórios e não validam estoque positivo antes do envio.
- **Possíveis Brechas de Segurança**:
  - **MÉDIO — Ausência de filtro explícito por `farmId` (`AnimalManagementModal.tsx:L124-L128`)**: Carregamento de protocolos, touros, partidas de sêmen, veterinários e estações sem passar `farmId` (depende exclusivamente de RLS/filtro interno de `db.ts`, com risco de cruzamento de dados entre fazendas da mesma organização).

---

#### 11. `src/components/BatchLotManagementModal.tsx`
- **Arquivo**: `src/components/BatchLotManagementModal.tsx` — 2284 linhas — Modal de manejo coletivo de lotes de IATF (abas D0, D9, IA e DG com filtros, busca, ações em massa e salvamento individual por matriz no tronco).
- **Status**: `CRÍTICO`
- **Erros e Bugs**:
  - **CRÍTICO — Perda silenciosa de edições ao salvar matriz individual no tronco (`BatchLotManagementModal.tsx:L174-L290, L576, L627`)**:
    - `handleSaveSingleIaRow` (`L576`) e `handleSaveSingleDgRow` (`L627`) chamam `onSuccess()`, fazendo o componente pai atualizar `lot` e `lotAnimals`.
    - Como o `useEffect` de inicialização (`L174-L290`) depende de `[isOpen, lot, lotAnimals, initialStepCode]`, cada salvamento individual **reinicializa completamente o modal**: volta `activeTab` para `initialStepCode`, limpa buscas/filtros, zera `hasUnsavedChanges`, recarrega `getBulls()`/`getSemenBatches()` e **descarta todas as edições ainda não salvas das outras linhas** (preenchimento de touro padrão, notas, ECC, `skipped`, etc.).
  - **ALTO — Falsa indicação de "Salva" / "Inseminada" antes de persistir no banco (`BatchLotManagementModal.tsx:L409, L825-L828, L1661-L1663, L1833-L1837`)**: `isRowInseminated` é verdadeiro se `savedRowsMap[row.animal_id]` **OU** `(Boolean(row.bull_id) && Boolean(row.semen_batch_id))`. Ao usar `"Preencher Touro Padrão nas Pendentes"` (`L431-L462`, que apenas preenche o estado local sem salvar), todas as linhas passam a exibir o badge **"Inseminada"** e o botão **"Salva"**, induzindo o operador a acreditar que os dados já foram gravados.
  - **ALTO — Bug de associação touro × partida padrão (`BatchLotManagementModal.tsx:L1438-L1447`)**: Ao trocar `iaDefaultBullId` para um touro sem partida cadastrada (ou vazio), `iaDefaultBatchId` **não é limpo**, mantendo a partida do touro anterior e aplicando combinação inválida nas matrizes pendentes.
  - **ALTO — Hardcode de `stepCode: 'D9'` para protocolos D7/D8 (`BatchLotManagementModal.tsx:L60-L67, L196` vs `L701, L719`)**: A abertura normaliza `D7`/`D8`/`D9` para a aba `D9` e lê `stepChecks['D9'] || stepChecks['D8']`, mas ao submeter envia sempre `stepCode: 'D9'` hardcoded (`L701, L719`), dessincronizando protocolos cuja etapa de retirada é `D7` ou `D8`.
  - **MÉDIO — Perdas de implante (`d9DeviceLossIds`) zeradas ao reabrir o modal (`BatchLotManagementModal.tsx:L200`)**: Sempre inicializa `setD9DeviceLossIds([])`, não restaurando perdas previamente registradas.
  - **MÉDIO — `handleSetAllDgStatus` não invalida `savedDgRowsMap` (`BatchLotManagementModal.tsx:L500-L507`)**: Alterar status em massa no DG mantém o botão das linhas já salvas exibindo `"Salvo!"` (`L2207-L2211`), mascarando alterações pendentes.
  - **MÉDIO — Proteção `hasUnsavedChanges` quebrada (`BatchLotManagementModal.tsx:L77-L88, L1008-L1016, L1074-L1079, L1194-L1202, L1264-L1269, L465-L469`)**: Edições nas abas D0 e D9 nunca marcam `hasUnsavedChanges = true` (fecha sem avisar e perde mudanças); nas abas IA/DG, salvar linhas individualmente nunca limpa `hasUnsavedChanges` (alerta falso ao fechar).
  - **MÉDIO — Previsão de parto errada sem `ia_planned_date` (`BatchLotManagementModal.tsx:L510-L517`)**: Quando `lot.ia_planned_date` é nulo, soma `+295` dias sobre `dgDate`, errando a previsão de parto em ~30–45 dias.
  - **MÉDIO — Hardcode de nome pessoal (`BatchLotManagementModal.tsx:L99, L109, L120, L148, L184, L193, L205, L208`)**: `'MV. DR. SAMOEL DUARTE'` como valor default em todas as abas quando `lot.responsible_name` está vazio (em vez de buscar o veterinário padrão da fazenda/organização).
  - **BAIXO — Retorno não verificado e timers/efeitos sem cleanup**: `toggleLotAnimalStepCheck` (`L672, L717`) não checa retorno/erro; `setTimeout(() => setRowSuccessMsg(null), 3500)` (`L461, L575, L626`) não limpa timers anteriores nem no unmount; `loadAux` (`L259-L289`) não verifica `mounted`.
- **Divergências**:
  - `BatchLotManagementModal.tsx:L161, L239` vs `AnimalManagementModal.tsx:L104`: Ignora o status `'inconclusivo'` no DG (trata matrizes inconclusivas como `'pendente'`).
  - `BatchLotManagementModal.tsx:L262-L265`: Chama `getBulls()` e `getSemenBatches()` sem filtrar por `lot.farm_id` e permite selecionar partidas de sêmen com saldo `<= 0` sem validação de estoque suficiente para o lote.
- **Falta de Ligação nos Fluxos de Trabalho**:
  - O fluxo de salvamento incremental no tronco (`handleSaveSingleIaRow` / `handleSaveSingleDgRow`) entra em conflito direto com o `useEffect` de hidratação por `[lot, lotAnimals]`, quebrando a experiência de trabalho contínuo matriz a matriz.
  - `BatchLotManagementModal.tsx:L737-L757`: Ao clicar em `"Salvar Informações do Lote"` na aba IA, reenvia todas as `iaRows` (incluindo linhas já salvas anteriormente e linhas em branco), dependendo integralmente do backend para idempotência e não-duplicação de baixa de doses.
- **Possíveis Brechas de Segurança**:
  - **MÉDIO — Ausência de filtro explícito por `lot.farm_id` (`BatchLotManagementModal.tsx:L262-L265`)**: `getBulls()` e `getSemenBatches()` são buscados sem escopo explícito de fazenda, confiando exclusivamente em RLS/filtro interno e podendo misturar partidas de sêmen entre fazendas da mesma organização.

---

### Lote 08 — Componentes do Módulo de Estoque Criogênico (genetic-inventory)

### Relatório de Auditoria — Lote 08: Componentes do Módulo de Estoque Criogênico (`src/components/genetic-inventory/`)

Resumo executivo do lote: foram auditados integralmente os **11 arquivos** (4.770 linhas) do módulo de estoque criogênico, com verificação cruzada contra os tipos (`src/lib/types/genetic-inventory.ts`), serviço (`src/lib/services/geneticInventoryService.ts`), página orquestradora (`src/app/estoque-semen/page.tsx`) e migração SQL (`supabase/migrations/007_genetic_inventory_module.sql`).

Principais achados críticos/altos do lote:
- **Bug crítico de quebra de constraint SQL** em `MovementWizard.tsx` (`cryopreservation` envia valores inexistentes no `CHECK` do PostgreSQL para embriões).
- **Bypass de trava de segurança e ausência de RBAC/auditoria** no estorno (`MovementsLedgerView.tsx` + `processReversal`) e **operador anônimo (`'Operador'`)** em todas as movimentações/medições.
- **PII/nome pessoal hardcoded** em `MovementWizard.tsx:L119` (`'MV. Dr. Samoel Duarte'`) como recebedor padrão de comprovantes oficiais em ambiente multi-tenant.
- **Shift de data por fuso horário UTC** (`new Date('YYYY-MM-DD').toISOString()`), **impressão quebrada** em `ReceiptViewerModal.tsx` e **múltiplas quebras de fluxo** entre views (dashboard -> mapa, caneca -> transferência, cliente -> movimentação, busca de embriões/botijões).

---

#### 1. `src/components/genetic-inventory/AnimalGeneticLookupModal.tsx`
- **Arquivo**: `src/components/genetic-inventory/AnimalGeneticLookupModal.tsx` | 214 linhas | Modal de consulta rápida de localização de doses (sêmen ou embriões) por animal, com atalhos para retirada e transferência.
- **Status**: `MÉDIO`
- **Erros e Bugs**:
  - **Race condition na busca assíncrona (`L27-46`)**: `useEffect` dispara `handleSearch()` após debounce de 300ms sem controle de cancelamento (`requestId`/`AbortController`). Alterações rápidas em `queryText` ou na troca `SEMEN`/`EMBRYO` podem permitir que uma resposta mais antiga sobrescreva `results` (`L32`) e desligue `loading` (`L33`) antes da requisição mais recente concluir.
  - **Ausência de `try/catch` em `handleSearch` (`L27-34`)**: Se `searchAnimalGeneticPositions` rejeitar (ex.: erro de rede), `setLoading(false)` (`L33`) não é executado, deixando o modal preso no spinner sem feedback de erro.
  - **Dependências incompletas no `useEffect` (`L36-46`)**: Usa `handleSearch` e `farmId`, mas o array de dependências contém apenas `[queryText, animalType]`.
  - **Chave instável na lista (`L140-142`)**: Usa `key={idx}` em vez de chave composta estável (`batchId + tankId + canisterId + ownerClientId`).
- **Divergências**:
  - **Placeholder promete busca por RGD da doadora que não funciona (`L110`, `L148-151`)**: O placeholder indica `"Digite nome, tag ou RGD da doadora..."`, mas `getInventoryBalances` (`geneticInventoryService.ts:L504-515`, `L559-583`) não seleciona nem filtra por `donor_rgd`; consequentemente `pos.animalCode` para embriões é sempre `null`.
  - **Raça omitida quando associada ao touro/animal (`L153-155`)**: Exibe `pos.breedName`, mas `searchAnimalGeneticPositions` (`geneticInventoryService.ts:L619`) lê apenas `mat?.breeds?.name`, sem fallback para `mat?.bulls?.breeds?.name` ou `mat?.animals?.breeds?.name`.
  - **Valor bruto de sexagem (`L177`)**: Renderiza `pos.sexing` cru (`femea`, `macho`, `convencional`) sem formatação/acentuação.
- **Falta de Ligação nos Fluxos de Trabalho**:
  - **Quebra ao acionar `Retirar`/`Transferir` para o tipo de material oposto ao ativo na página (`L190-203`)**: Em `estoque-semen/page.tsx:L217-227`, o callback procura o saldo no array `balances` da página (filtrado pelo `materialType` global). Se a página estiver em `SEMEN` e o usuário buscar uma `Doadora (EMBRYO)` no modal, `targetBalance` será `undefined` e o `MovementWizard` abrirá sem o lote pré-selecionado.
  - **Ignora trava `isMainFarm` (`L190-203`)**: Mantém os botões `Retirar` e `Transferir` habilitados mesmo fora da fazenda matriz; ao clicar, fecha o modal e apenas dispara toast de erro, perdendo a pesquisa.
- **Possíveis Brechas de Segurança**:
  - Nenhum achado crítico direto no componente (strings escapadas pelo React). A isolação multi-tenant depende integralmente de RLS no banco, já que `farmId` vem via prop e `getInventoryBalances` não filtra por `organization_id`.

---

#### 2. `src/components/genetic-inventory/CanisterVisualMap.tsx`
- **Arquivo**: `src/components/genetic-inventory/CanisterVisualMap.tsx` | 263 linhas | Mapa visual interativo das canecas de um botijão criogênico, exibindo ocupação estimada, partidas por caneca e botões rápidos de ação.
- **Status**: `MÉDIO`
- **Erros e Bugs**:
  - **Inconsistência entre "Total no Botijão" e soma das canecas (`L61` vs `L25`, `L90`)**: `L61` exibe `tank.total_doses` (soma global de Sêmen + Embriões vinda de `getTanks`), enquanto as canecas (`L90`) somam apenas os `balances` recebidos via prop — que na página pai (`estoque-semen/page.tsx:L150`) vêm filtrados pelo `materialType` ativo. Isso gera discrepância visível (ex.: topo mostra 200 doses, mas todas as canecas mostram `0 un`).
  - **Indicador visual enganoso para caneca vazia (`L125-128`)**: `style={{ height: \`${Math.max(6, fillPct)}%\` }}` renderiza barra verde de 6% de altura mesmo quando `doses === 0` (`fillPct === 0`), sugerindo conteúdo presente em canecas vazias.
  - **Estado `selectedCanister` não sincroniza se `canisters` atualizar (`L22`, `L35`)**: Mantém referência potencialmente obsoleta do objeto `TankCanister` caso as props mudem sem desmontar o componente.
  - **Classes CSS inválidas/inconsistentes (`L110`, `L191`)**: `hover:bg-slate-850` e `py-0.2` não pertencem à escala padrão do Tailwind.
- **Divergências**:
  - **Capacidade máxima de caneca hardcoded (`L97`)**: Calcula `fillPct` dividindo fixamente por `150` doses, desconsiderando modelo do botijão ou `tank.capacity_notes`.
  - **Ação `'outbound'` tipada na prop mas não implementada (`L11`, `L235-252`)**: `onSelectCanisterForAction` declara `'inbound' | 'outbound' | 'transfer'`, mas a UI só oferece `Entrada Aqui` (`inbound`) e `Transferir` (`transfer`).
- **Falta de Ligação nos Fluxos de Trabalho**:
  - **Botão `Transferir` abre o wizard sem pré-selecionar origem (`L244-249`)**: Chama `onSelectCanisterForAction(activeCanister, 'transfer')`, que em `TanksView.tsx:L199-202` envia `{ tankId, canisterId }` ao `MovementWizard`. Entretanto, `MovementWizard` na aba `transfer` (`MovementWizard.tsx:L127`, `L169-175`) só consome `prefill.balanceId`, ignorando `tankId`/`canisterId`.
  - **Não considera `isMainFarm` (`L235-252`)**: Exibe botões de entrada/transferência habilitados mesmo em fazendas secundárias bloqueadas.
- **Possíveis Brechas de Segurança**:
  - Nenhum achado relevante (componente puramente apresentacional).

---

#### 3. `src/components/genetic-inventory/ClientsView.tsx`
- **Arquivo**: `src/components/genetic-inventory/ClientsView.tsx` | 310 linhas | Tela de gestão de clientes/proprietários sob custódia, exibindo saldo em custódia e modal de cadastro.
- **Status**: `MÉDIO`
- **Erros e Bugs**:
  - **Ausência de `try/catch` em `handleSubmit` (`L37-54`)**: Se `createClientRecord` ou `onRefresh` rejeitar a promise, `saving` pode ficar travado ou gerar unhandled promise rejection.
  - **Sem validação de formato para CPF/CNPJ e telefone (`L244-263`)**: Aceita qualquer texto livre sem validação de dígitos ou máscara.
  - **CRUD incompleto**: Permite apenas criar clientes; não há edição, inativação (`active`) nem exclusão.
- **Divergências**:
  - **Fazendas do grupo misturadas como "Clientes sob Custódia" (`L143-164`)**: `MovementWizard` cria registros em `genetic_clients` para fazendas do grupo (`getOrCreateFarmClientRecord`, com `notes: 'Fazenda do Grupo...'`). `ClientsView` lista todos sem distinção com badge `"Custódia"` (`L162`).
  - **"Total em Custódia" não informa filtro por tipo de material (`L57-65`, `L184-187`)**: `balances` recebidos da página pai estão filtrados por `SEMEN` ou `EMBRYO`, mas o card exibe o total como se fosse consolidado.
  - **Uso de `alert()` nativo (`L40`, `L52`, `L84`, `L122`)**: Diverge do sistema de toast usado na página pai.
- **Falta de Ligação nos Fluxos de Trabalho**:
  - **Ação `onStartActionForClient` desconectada (`L13`, `L197-205`)**: O componente renderiza o botão `"Entrada / Movimentação do Cliente"` apenas se `onStartActionForClient` for fornecido, mas `estoque-semen/page.tsx:L519-526` não passa essa prop, tornando o botão código morto na prática.
- **Possíveis Brechas de Segurança**:
  - **Ausência de RBAC no cadastro de clientes (`L37-54`, `L81-105`)**: Qualquer usuário autenticado na fazenda matriz pode criar clientes de custódia; a trava de fazenda matriz depende de heurística por nome (`%principal%`).

---

#### 4. `src/components/genetic-inventory/GeneticDashboardView.tsx`
- **Arquivo**: `src/components/genetic-inventory/GeneticDashboardView.tsx` | 344 linhas | Dashboard principal do módulo com ações rápidas, 6 KPIs, gráfico de movimentações (Recharts), painel de níveis de N2 e tabela de movimentações recentes.
- **Status**: `MÉDIO`
- **Erros e Bugs**:
  - **Critério de alerta crítico de N2 diverge do KPI (`L235` vs `geneticInventoryService.ts:L118`)**: A barra do botijão fica vermelha/crítica quando `t.currentNitrogen <= t.minimumNitrogen` (`L235`), enquanto o KPI `tanksBelowNitrogenCount` (`L168`) usa `<` estrito no serviço (`geneticInventoryService.ts:L118`). Quando um botijão atinge exatamente o limite mínimo (ex.: 25% === 25%), o card fica vermelho enquanto o KPI exibe `0` ("Níveis seguros").
  - **Coluna "Data / Hora" sem hora (`L293`, `L319`)**: O cabeçalho promete `"Data / Hora"`, mas `L319` usa `toLocaleDateString('pt-BR')`.
  - **Coluna "Localização" incompleta (`L329-331`)**: Exibe apenas `source_tank` ou `dest_tank` (sem caneca e sem origem -> destino em transferências).
- **Divergências**:
  - **Subtítulo do gráfico enganoso sobre filtro de material (`L200`)**: Exibe `{activeMaterialType === 'SEMEN' ? 'Sêmen' : 'Embriões'} • Últimos 6 meses`, mas `getInventoryDashboardMetrics` (`geneticInventoryService.ts:L27-196`) ignora o parâmetro `materialType` em todas as queries (agregando sempre Sêmen + Embriões).
  - **Tipos de movimentação sem tradução (`L323`)**: Renderiza `m.movement_type` bruto em inglês (`INBOUND`, `OUTBOUND`, `TRANSFER_OUT`), divergindo dos badges traduzidos de `MovementsLedgerView.tsx:L80-103`.
- **Falta de Ligação nos Fluxos de Trabalho**:
  - **Clique no botijão não abre o mapa de canecas daquele botijão (`L244-246`)**: Dispara `onSelectTankMap?.(t.tankId)` com tooltip `"Clique para visualizar o mapa de canecas deste botijão"`, mas `estoque-semen/page.tsx:L483` passa `onSelectTankMap={() => setActiveTab('tanks')}`, descartando `t.tankId` e apenas trocando de aba.
  - **Modo `'adjustment'` presente na prop `onOpenWizard` (`L32`) sem atalho na barra de ações rápidas (`L49-101`)**.
- **Possíveis Brechas de Segurança**:
  - Nenhum achado relevante.

---

#### 5. `src/components/genetic-inventory/InventoryTableView.tsx`
- **Arquivo**: `src/components/genetic-inventory/InventoryTableView.tsx` | 491 linhas | Tabela paginada do inventário de lotes com filtros combinados, ordenação, exportação Excel e ações por linha.
- **Status**: `MÉDIO`
- **Erros e Bugs**:
  - **Busca por código/número do botijão quebrada (`L90`)**:
    ```ts
    const tankName = b.semen_tanks?.name?.toLowerCase() || b.semen_tanks?.number?.toLowerCase() || '';
    ```
    Como `semen_tanks.name` é obrigatório (`NOT NULL`), o operador `||` faz `b.semen_tanks?.number` nunca ser avaliado na busca; pesquisar pelo código do botijão (ex.: `BOT-01`) não retorna resultados.
  - **Paginação não reseta quando `activeMaterialType` ou `balances` mudam (`L48`, `L140-141`)**: Se o usuário estiver na página 2+ de `SEMEN` e alternar para `EMBRYO` (com menos páginas), `currentPage` excede `totalPages` e a tabela renderiza vazia.
  - **Botão limpar busca (`X`) não reseta `currentPage` (`L184`)**: Chama apenas `setSearch('')`, sem `setCurrentPage(1)`.
  - **Filtro de posse sensível a `undefined` (`L66-71`)**: Usa `b.owner_client_id !== null` e `b.owner_client_id === null` em vez de truthy/falsy (`!b.owner_client_id`), podendo classificar incorretamente registros se o campo vier `undefined` (permitido pela interface `InventoryBalance`).
  - **Ordenação por `animal` incompleta e case-sensitive (`L110-125`)**: Ignora `animals?.tag_number` (exibido em `L342`) e ordena strings com `<`/`>` sem `localeCompare`.
  - **Classe CSS inválida (`L472`, `L482`)**: `bg-slate-850` nos botões de paginação.
- **Divergências**:
  - **RGD da doadora nunca exibido (`L343`)**: Lê `mat?.donor_rgd`, mas `getInventoryBalances` (`geneticInventoryService.ts:L504-515`) não inclui `donor_rgd` no `.select()`.
  - **Filtros mutuamente excludentes sem feedback (`L62-71`)**: Selecionar `Somente Próprio` junto com um cliente em `selectedClient` zera a tabela silenciosamente.
- **Falta de Ligação nos Fluxos de Trabalho**:
  - **Ações de linha ignoram `isMainFarm` (`L433-450`)**: Botões de saída e transferência permanecem ativos mesmo em fazenda secundária bloqueada.
- **Possíveis Brechas de Segurança**:
  - **Potencial Formula Injection (CSV/Excel Injection) (`L194`)**: `exportInventoryToExcel` grava campos livres (`animalName`, `batch_number`, `rack_code`, `genetic_clients.name`) diretamente em células `.xlsx` via `XLSX.utils.json_to_sheet` sem neutralizar prefixos de fórmula (`=`, `+`, `-`, `@`).

---

#### 6. `src/components/genetic-inventory/MovementWizard.tsx`
- **Arquivo**: `src/components/genetic-inventory/MovementWizard.tsx` | 1.295 linhas | Modal assistente multi-aba para operações de Entrada (`inbound`), Retirada (`outbound`), Transferência (`transfer`) e Ajuste/Perda (`adjustment`).
- **Status**: `CRÍTICO`
- **Erros e Bugs**:
  - **CRÍTICO — Valores de `cryopreservation` violam `CHECK` constraint do banco (`L98`, `L644-654`)**:
    - O banco (`supabase/migrations/007_genetic_inventory_module.sql:L104`) e o tipo `CryopreservationType` (`genetic-inventory.ts:L13`) aceitam somente `'DT' | 'VT' | 'nao_aplicavel'`.
    - O `<select>` em `L649-652` oferece `value="vitrificacao"`, `value="congelamento_lento"` e `value="fresco"`, mascarando o erro de tipo com `as CryopreservationType` (`L646`).
    - **Impacto**: Todo cadastro de novo embrião com qualquer criopreservação selecionada (exceto `nao_aplicavel`) falha com erro de constraint no PostgreSQL.
  - **ALTO — Nome pessoal hardcoded no recebedor padrão (`L119`)**: `useState('MV. Dr. Samoel Duarte')` pré-preenche o campo obrigatório `Responsável / Recebedor` com nome pessoal fixo. Em produção multi-tenant, comprovantes oficiais podem ser emitidos em nome de terceiros por engano.
  - **Shift de data de -1 dia no fuso brasileiro (`L257`, `L276`, `L324`)**: Converte `<input type="date">` (`YYYY-MM-DD`) via `new Date(inboundDate).toISOString()`, que gera `00:00:00.000Z` (UTC). Ao exibir em `pt-BR` (`UTC-3`), a data recua para o dia anterior (`21:00:00`).
  - **Caneca de destino fica dessincronizada ao trocar de botijão com `prefill.canisterId` (`L145-154`)**: Se o wizard abrir com `prefill.canisterId` (botijão A) e o usuário alterar o `Botijão de Destino` para o botijão B, a condição `&& !prefill?.canisterId` (`L149`) impede atualizar `inboundCanisterId`, enviando uma caneca de outro botijão.
  - **`destCanisters` não limpa ao desmarcar botijão de destino na transferência (`L157-166`)**: Voltar o select para `""` mantém as canecas do botijão anterior no dropdown.
  - **`inboundType` ignora `prefill?.materialType` (`L88`)**: Sempre inicia em `'SEMEN'` mesmo se aberto em contexto de `'EMBRYO'`.
  - **Ausência de `try/catch` nos 4 handlers de submit (`L189`, `L291`, `L337`, `L393`) e nos `getCanisters().then()` (`L147`, `L159`)**: Exceções de rede deixam `submitting = true` travado.
  - **Custo unitário sem `min="0"` (`L727-734`, `L250`)**: Permite valores negativos ou `NaN`.
  - **Sêmen sem touro permitido se `inboundSireId === ''` (`L240`)**: Falta validação explícita em JS antes de enviar `sireId: ''` (convertido em `null` no serviço).
- **Divergências**:
  - **Operador não enviado em nenhuma movimentação (`L280`, `L313`, `L370`, `L419`)**: Nenhuma das chamadas passa o 3º parâmetro `operatorName`, gravando todas as operações com o default `'Operador'` no banco.
  - **Ausência de campo de data em `Transferência` e `Ajuste`**: Apenas `Entrada` e `Saída` permitem informar data da operação (`occurredAt`).
  - **Dropdown de "Partida Existente" (`L748-756`) não filtra pelo `inboundType` selecionado no topo (`L544-570`)** e não sincroniza o proprietário da partida selecionada.
- **Falta de Ligação nos Fluxos de Trabalho**:
  - **`prefill` sem `balanceId` não funciona para `transfer` (`L169-175`)**: Quebra o botão `Transferir` vindo de `CanisterVisualMap` / `TanksView`.
  - **Comprovante de retirada não abre após sucesso (`L329`)**: Retorna `receiptNumber` e `receiptId` em `onSuccess`, mas `estoque-semen/page.tsx:L206-207` apenas mostra um toast em vez de abrir `ReceiptViewerModal`.
  - **Botões de submit não são desabilitados quando `!isMainFarm` (`L882`, `L1025`, `L1158`, `L1274`)**: Permitem preencher todo o formulário para só barrar no submit.
- **Possíveis Brechas de Segurança**:
  - **Perda de rastreabilidade / não-repúdio na auditoria (`L280`, `L313`, `L370`, `L419`)**: Todas as movimentações de estoque e comprovantes de retirada são gravados sem o usuário autenticado real (`created_by = 'Operador'`).
  - **Exposição de PII no bundle client-side (`L119`)**: Nome pessoal hardcoded `'MV. Dr. Samoel Duarte'` exposto para todos os tenants.

---

#### 7. `src/components/genetic-inventory/MovementsLedgerView.tsx`
- **Arquivo**: `src/components/genetic-inventory/MovementsLedgerView.tsx` | 345 linhas | Livro razão imutável de movimentações com busca, filtro por tipo, exportação Excel e modal de estorno.
- **Status**: `ALTO`
- **Erros e Bugs**:
  - **Permite tentar estornar movimentação já estornada ou metade de uma transferência (`L179`, `L254`)**: `canReverse = m.movement_type !== 'REVERSAL'` não verifica se já existe estorno vinculado (`reversed_movement_id === m.id`) nem trata `TRANSFER_IN`/`TRANSFER_OUT` em par.
  - **Ausência de `try/catch` em `handleConfirmReversal` (`L63-78`)**: Rejeição de rede trava `submittingReversal = true`.
  - **Busca textual ignora `animals?.tag_number` (`L46`)**: Apesar de `L178` exibir `tag_number` para doadoras sem `donor_name`, o filtro de busca não pesquisa esse campo.
  - **Sem paginação e truncamento silencioso em 100 registros (`L173`, `L140`)**: `estoque-semen/page.tsx:L151` busca `limit: 100`, mas a tela não avisa que o livro razão (e o Excel exportado) está limitado aos últimos 100 registros.
  - **Classe CSS inválida (`L261`)**: `hover:bg-slate-750`.
- **Divergências**:
  - **Trava `isMainFarm` completamente ausente (`L14-28`, `L63-78`, `L254-266`)**: Diferente das demais views de escrita, `MovementsLedgerView` não recebe nem valida `isMainFarm`.
  - **Operador do estorno sempre `'Operador'` (`L69`)**: Não passa `operatorName` para `processReversal`.
- **Falta de Ligação nos Fluxos de Trabalho**:
  - **Sem filtro por período (`startDate`/`endDate`)**: Embora suportado por `getMovementHistory` (`geneticInventoryService.ts:L943-944`), a UI não expõe filtro de datas.
  - **Sem atalho para abrir o comprovante** em linhas do tipo `OUTBOUND`.
- **Possíveis Brechas de Segurança**:
  - **ALTO — Bypass da trava de fazenda matriz + ausência de RBAC no estorno (`L69`, `L254-266` + `geneticInventoryService.ts:L907-932`)**: `processReversal` é a única operação de escrita do serviço que **não chama `validateMainFarmSemenLock`**, e `MovementsLedgerView` não verifica `isMainFarm` nem role do usuário. Qualquer usuário autenticado, mesmo a partir de uma fazenda secundária bloqueada, pode estornar movimentações do estoque centralizado, sem registrar sua identidade real (`created_by = 'Operador'`).
  - **Potencial Formula Injection na exportação Excel (`L140`)**: `exportMovementsToExcel` exporta campos livres (`reason`, `notes`, `animalName`) sem neutralizar fórmulas.

---

#### 8. `src/components/genetic-inventory/ReceiptViewerModal.tsx`
- **Arquivo**: `src/components/genetic-inventory/ReceiptViewerModal.tsx` | 214 linhas | Modal de visualização e impressão/PDF do Comprovante Oficial de Retirada de material genético.
- **Status**: `MÉDIO`
- **Erros e Bugs**:
  - **Impressão (`window.print()`) vaza a página de fundo (`L27-29`, `L32`)**: Usa apenas `window.print()` e classes `print:static` no modal, sem isolar o documento (ex.: `@media print` ocultando o restante do body ou janela/iframe dedicado). Ao imprimir ou salvar em PDF, o fundo da aplicação (menu, tabela, cabeçalho) é impresso junto com o comprovante.
  - **Omite data efetiva da retirada (`L89`)**: Mostra apenas `receipt.generated_at` ("Emissão"), omitindo `mov?.occurred_at` (que pode diferir em lançamentos retroativos).
  - **Fallback incorreto quando `mov` está ausente (`L18`, `L21`, `L103`, `L162`)**: Se `genetic_inventory_movements` vier nulo, `isSemen` resulta em `false`, exibindo `"Embrião"` e `"undefined doses"`.
- **Divergências**:
  - **Falso hash de autenticação (`L206`)**: `Autenticação: {receipt.file_hash || receipt.receipt_number}`. Como `file_hash` não é gerado, o comprovante exibe o próprio número sequencial como se fosse hash criptográfico de autenticidade.
  - **Default `"Fazenda Modelo"` (`L15`)**: Diverge do padrão `"Fazenda"` usado nos demais componentes.
- **Falta de Ligação nos Fluxos de Trabalho**:
  - **Sem abertura automática pós-retirada** a partir do `MovementWizard` (usuário precisa ir manualmente até a aba `Comprovantes`).
  - **Sem fechamento por tecla `Escape` ou clique fora do modal (`L32`)**.
- **Possíveis Brechas de Segurança**:
  - Risco de integridade documental/auditoria em `L196` (operador gravado como `'Operador'` genérico) e `L206` (apresentação de número sequencial como código de autenticação). Sem vulnerabilidade de XSS.

---

#### 9. `src/components/genetic-inventory/ReceiptsView.tsx`
- **Arquivo**: `src/components/genetic-inventory/ReceiptsView.tsx` | 136 linhas | Tabela de listagem e pesquisa de comprovantes de retirada emitidos, com abertura do `ReceiptViewerModal`.
- **Status**: `MÉDIO`
- **Erros e Bugs**:
  - **Busca ignora completamente embriões/doadoras (`L26`)**:
    ```ts
    const animal = mov?.genetic_material_batches?.genetic_materials?.bulls?.name?.toLowerCase() || '';
    ```
    Enquanto a tabela (`L77-79`) exibe `mat?.donor_name || mat?.animals?.tag_number` para embriões, o filtro em `L26` busca apenas em `bulls?.name`, impossibilitando pesquisar comprovantes de embriões pelo nome/tag da doadora.
  - **Sem paginação e truncado em 100 registros (`L73`)**: `getWithdrawalReceipts` (`geneticInventoryService.ts:L1037`) aplica `.limit(100)` sem indicação de truncamento na UI.
- **Divergências**:
  - **Não respeita `activeMaterialType` global (`L8-16`)**: Diferente de `InventoryTableView` e `MovementsLedgerView`, lista juntos comprovantes de Sêmen e Embriões mesmo quando o usuário seleciona apenas um modo no cabeçalho.
  - **Não sinaliza comprovantes cujas retiradas foram estornadas**: Um comprovante de retirada estornada no livro razão continua listado e imprimível sem qualquer marcação de estorno/cancelamento.
- **Falta de Ligação nos Fluxos de Trabalho**:
  - Sem filtro por período, cliente ou exportação de listagem.
- **Possíveis Brechas de Segurança**:
  - Nenhum achado relevante.

---

#### 10. `src/components/genetic-inventory/ReportsView.tsx`
- **Arquivo**: `src/components/genetic-inventory/ReportsView.tsx` | 522 linhas | Painel de 6 relatórios analíticos consolidados (botijão, animal, raça, sexagem, proprietário, estoque baixo) com exportação direta para `.xlsx`.
- **Status**: `MÉDIO`
- **Erros e Bugs**:
  - **Contagem de `Partidas` incorreta em `by_animal` (`L97`)**: Faz `entry.batchesCount += 1` por linha de `balances` em vez de contar `batch_id` únicos com `Set` (como feito em `by_tank` na `L46`). Uma mesma partida distribuída em 3 canecas é contabilizada como 3 partidas.
  - **Colisão de chave de agrupamento em `by_animal` (`L85`)**: `const key = \`${name}_${code}\`` não inclui `type` nem `materialId`, e como `donor_rgd` não é retornado pela query, doadoras sem código podem colidir sob `'Doadora_-'`.
  - **Subcontagem de animais em `by_breed` (`L113`)**: Ignora `animals?.tag_number`, agrupando todas as doadoras identificadas apenas por brinco sob a string `'Animal'`.
  - **Nome em branco em `low_stock` para doadoras sem `donor_name` (`L228`, `L500`)**: Não faz fallback para `mat?.animals?.tag_number`.
  - **Ausência de empty state em 5 das 6 tabelas (`L358-476`)**: Apenas `low_stock` (`L491`) trata lista vazia; as demais renderizam tabela vazia sem mensagem.
  - **Badge de status do botijão sempre verde (`L369-371`)**: Aplica estilo esmeralda fixo mesmo para botijões com status `'manutencao'` ou `'inativo'`.
  - **Uso de `idx` como `key` (`L394`, `L423`, `L444`, `L470`)**.
- **Divergências**:
  - **Filtro global de `materialType` oculto nos relatórios (`estoque-semen/page.tsx:L150, L547-552`)**: `ReportsView` não recebe nem exibe `activeMaterialType`, gerando relatórios parciais (só Sêmen ou só Embriões) rotulados como consolidados, enquanto `tanks` inclui todos os botijões.
  - **Fazendas do grupo listadas como custódia em `by_client` (`L143-158`, `L460`)**: Mesma mistura de `ClientsView`.
- **Falta de Ligação nos Fluxos de Trabalho**:
  - **Relatórios estáticos sem drill-down**: Não permitem clicar em um botijão, animal ou item de estoque baixo para navegar ao detalhe ou abrir ação de reposição.
  - **Exportação Excel duplicada no componente (`L15`, `L173-242`)** em vez de centralizada em `geneticInventoryService.ts`.
- **Possíveis Brechas de Segurança**:
  - **Potencial Formula Injection na exportação Excel (`L173-242`)**: Dados livres do usuário são escritos em `.xlsx` via `XLSX.utils.json_to_sheet` sem sanitização de prefixos de fórmula (`=`, `+`, `-`, `@`).

---

#### 11. `src/components/genetic-inventory/TanksView.tsx`
- **Arquivo**: `src/components/genetic-inventory/TanksView.tsx` | 636 linhas | Gestão de botijões criogênicos: listagem com gauge de N2, cadastro de botijão, mapa visual de canecas, registro e histórico de medições de nitrogênio.
- **Status**: `MÉDIO`
- **Erros e Bugs**:
  - **Medição de N2 não bloqueada na UI em fazenda secundária (`L115-133`, `L342-351`)**: Diferente do botão `Cadastrar Botijão`, o botão de medição abre o modal em fazendas secundárias e só falha ao submeter (via erro do serviço em `alert()`).
  - **`selectedTankForMap` fica obsoleto após `onRefresh()` (`L46`, `L192-205`)**: Armazena o objeto `SemenTank` completo em estado em vez de `tankId`. Após movimentações ou medição de N2, `total_doses` e `tankCanisters` no mapa aberto não refletem os novos dados até fechar e reabrir.
  - **Campo `capacity_notes` órfão no formulário (`L59`, `L480-488`)**: Existe no state `newTankForm.capacity_notes`, mas o textarea rotulado `"Observações de Capacidade / Localização"` grava em `newTankForm.notes`.
  - **Inputs numéricos forçam fallback ao apagar (`L451`, `L462`, `L473`, `L541`)**: `parseInt(e.target.value) || 10` e `parseFloat(e.target.value) || 25` impedem o usuário de limpar o campo para redigitar.
  - **Race condition em `handleOpenMap` (`L77-83`) e `handleOpenHistory` (`L135-141`)**: Cliques rápidos em botijões diferentes podem sobrescrever o estado com a resposta mais lenta.
  - **Ausência de `try/catch` em todas as chamadas assíncronas (`L77-141`)**: Erros de rede podem travar `loadingCanisters`, `creatingTank`, `savingMeasurement` ou `loadingHistory`.
- **Divergências**:
  - **Cor do badge de `tank.status` baseada no N2 em vez do status (`L251-261`, `L279-281`)**: Um botijão `inativo` ou em `manutencao` com N2 alto é exibido em verde.
  - **Critério de alerta N2 (`L246` usa `<=` vs serviço usa `<`)**: Mesma divergência apontada em `GeneticDashboardView`.
  - **Operador na medição de N2 não enviado (`L119-124`)**: Omite o 5º parâmetro `measuredBy`, gravando sempre `'Operador'`.
  - **Uso de `alert()` nativo (`L88`, `L111`, `L131`, `L160`, `L224`)** divergindo do toast global.
  - **Sem UI para editar/inativar botijão ou renomear canecas**, embora `updateTank` exista em `geneticInventoryService.ts:L360`.
- **Falta de Ligação nos Fluxos de Trabalho**:
  - **Sem suporte a `initialTankId`**: Não permite que o clique em um botijão no `GeneticDashboardView` abra diretamente o `CanisterVisualMap` correspondente.
  - **Atalho `Transferir` do mapa de canecas quebrado (`L197-204`)**: Envia `{ tankId, canisterId }` sem `balanceId`, o que não pré-seleciona o lote na aba `transfer` do `MovementWizard`.
- **Possíveis Brechas de Segurança**:
  - **Ausência de RBAC e rastreabilidade de operador**: Qualquer usuário autenticado na fazenda matriz pode criar botijões e registrar medições de N2, todas atribuídas a `'Operador'` genérico.

---

### Lote 09 — Páginas: Dashboard, Login, Team, Import, Inputs, Protocols, Estoque-Semen, Reports e FichaRelatorioFinalView

### Relatório de Auditoria Técnica — Lote 09
**Escopo**: Páginas `Dashboard`, `Login`, `Team`, `Import`, `Inputs`, `Protocols`, `Estoque-Semen`, `Reports` e componentes `FichaRelatorioFinalView` e `masterCriaLogoBase64`.  
**Modo**: Somente leitura (nenhum arquivo alterado).

---

#### Resumo Executivo do Lote

| Arquivo | Linhas | Status | Principais Achados |
|---|---:|---|---|
| `src/app/page.tsx` | 619 | **ALTO** | Botão "Ver Todas" quebrado; `Promise.all` sem `try/catch` trava loading; KPI de perdas P4 ignora filtro de fazenda; Dashboard ignora estação ativa. |
| `src/app/login/page.tsx` | 170 | **ALTO** | Auto-cadastro aberto (`signUp`) cria usuários órfãos sem organização; ausência de "Esqueci minha senha"; `sessionStorage` setado antes de haver sessão. |
| `src/app/team/page.tsx` | 539 | **CRÍTICO** | Ausência total de checagem RBAC na UI (qualquer role vê/aciona controles de admin); `Math.random()` para gerar senhas; falhas de alteração sem feedback; admin pode se auto-inativar/rebaixar. |
| `src/app/import/page.tsx` | 135 | **CRÍTICO** | Tela 100% mock/fake em produção: usa `setTimeout` e dados hardcoded, exibe "Importação Concluída com Sucesso!" sem ler arquivo nem gravar no banco. |
| `src/app/inputs/page.tsx` | 25 | **OK / INFORMATIVO** | Redirecionamento legado client-side para `/estoque-semen` (poderia ser `redirect()` server-side). |
| `src/app/protocols/page.tsx` | 791 | **MÉDIO** | Presets não atualizam nome/descrição ao trocar; texto padrão coloca retirada de P4 no dia da IA; filtros `'other'` e `'all'` sem botão; chamadas async sem `try/catch`. |
| `src/app/estoque-semen/page.tsx` | 589 | **ALTO** | Fazenda principal identificada por substring `'principal'` no nome; trava de matriz apenas no client; loading infinito se `activeFarmId` for `null`; divergência com Dashboard e Reports. |
| `src/app/reports/page.tsx` | 936 | **CRÍTICO** | `useEffect` impede selecionar "Todas as Fazendas" e "Todas as Estações"; botão Exportar Excel na aba `ficha_final` exporta Estoque de Sêmen; cabeçalho e assinatura com `print:hidden`; fallback com nome/CRMV hardcoded. |
| `src/components/FichaRelatorioFinalView.tsx` | 506 | **CRÍTICO** | `includes('prenh')` classifica `"Não Prenha"` como **`PRENHA`**; dados reais de produtor/fazenda hardcoded (`RAMIRO ANTÔNIO DAVI` / `FAZENDA SÃO LUCAS`); `selectedLotId` não reseta ao trocar de fazenda; valores zootécnicos inventados (`MULTÍPARA`, `SEDE`). |
| `src/components/masterCriaLogoBase64.ts` | 1 (~402 KB) | **BAIXO** | Imagem PNG de 412.138 bytes embutida no bundle JS para todos os tenants (mesmo `isMasterCria === false`) e renderizada em 64×64px. |

---

#### 1. `src/app/page.tsx`
- **Arquivo**: `src/app/page.tsx` — 619 linhas analisadas — Dashboard principal de indicadores reprodutivos (KPIs, desempenho por fazenda, estoque de sêmen e painel de workflow da fazenda ativa).
- **Status**: `ALTO`

##### Erros e Bugs
1. **Botão "Ver Todas" completamente inoperante (`page.tsx:L565-L570` e `L68-L71`)**:
   - O botão chama `handleSelectFarm('all')`. `handleSelectFarm` chama `setActiveFarmId('all')` (que retorna imediatamente sem fazer nada em `src/context/FarmContext.tsx:L68-L71`: `if (id === 'all') return;`) e na linha seguinte executa `setViewScope('farm')` (`L70`).
   - **Impacto**: Clicar em "Ver Todas" não muda para visão consolidada; pelo contrário, força `viewScope` para `'farm'`. Deveria chamar `setViewScope('consolidated')`.
2. **Carregamento inicial sem `try/catch` nem `finally` (`page.tsx:L44-L66`)**:
   - `Promise.all([getOrgMetrics(true), getLots(true), getSemenBatches(true), getGeneticInventoryBalancesByFarm(true)])` não possui tratamento de exceção.
   - **Impacto**: Se qualquer uma das 4 chamadas falhar, `setLoading(false)` (`L59`) nunca é executado e o Dashboard trava indefinidamente no spinner (`L141-L150`).
3. **KPI "Perdas de Implantes P4" mistura escopo consolidado com escopo da fazenda (`page.tsx:L181` e `L334`)**:
   - `deviceLosses` usa sempre `metrics?.total_device_losses ?? 0` (total da organização inteira), mesmo quando `isFarmView === true`. Porém `L334` calcula `(deviceLosses / totalAnimals) * 100` usando `totalAnimals` apenas da fazenda ativa.
   - **Impacto**: Taxa de perda de implantes matematicamente incorreta no modo fazenda (podendo superar 100%).
4. **Badge de estoque no banner sempre exibe total global (`page.tsx:L198-L201` e `L120-L129`)**:
   - Mesmo com `viewScope === 'farm'` e o banner exibindo o nome da fazenda ativa (`L195`), o badge mostra `totalSemenAvailable` (soma de todas as fazendas).
5. **Subtítulo do KPI 2 incorreto no modo consolidado (`page.tsx:L294`)**:
   - Renderiza `Em {activeLotsCount} lotes {selectedFarm ? 'da fazenda' : 'ativos'}`. Como `FarmContext` mantém sempre uma fazenda ativa, `selectedFarm` é sempre truthy — exibindo `"lotes da fazenda"` mesmo em `"Consolidado Geral"`.
6. **Bloco 3 ("Workflow Ativo") exibe lotes de todas as fazendas quando `viewScope === 'consolidated'` (`page.tsx:L531-L616`)**:
   - O Bloco 3 renderiza sempre que `selectedFarm` existir e lista `displayedLots` (`L577`, `L586`). No modo `consolidated`, `displayedLots` contém lotes de todas as fazendas (`L133`), mas o card diz `"Workflow Ativo — {selectedFarm.name}"` e `"Lotes vinculados a esta fazenda"`.
7. **Barra de progresso sem clamp (`page.tsx:L432`)**:
   - `style={{ width: `${rate}%` }}` não limita entre `0%` e `100%`.

##### Divergências
1. **Estação reprodutiva ativa ignorada nos dados (`page.tsx:L36`, `L48-L53`, `L192`)**:
   - O cabeçalho exibe `"Estação Reprodutiva {activeSeason?.name || 'Ativa'}"`, mas `getOrgMetrics(true)` e `getLots(true)` não filtram por `activeSeason`. Os números misturam todas as estações.
2. **Duas fontes conflitantes para estoque de sêmen (`page.tsx:L99`, `L120-L129`, `L476-L525`)**:
   - `totalSemenAvailable` soma `farmBalances` (novo módulo `geneticInventoryService`) com fallback para `semenBatches` (legado). Já `farmStats` (`L99`) usa apenas `farmBalances[farm.id] ?? 0`. Além disso, `dosesUsed` (`L100`) assume `totalInseminated`, ignorando perdas e movimentações reais do ledger.
3. **Badge `"Supabase Live"` hardcoded (`page.tsx:L202-L205`)**:
   - Exibido permanentemente mesmo quando o aplicativo está offline operando sobre IndexedDB/Dexie.
4. **Match de fazenda por nome como fallback (`page.tsx:L78-L82`, `L134-L138`)**:
   - Comparar `l.farm_name.trim().toLowerCase() === farm.name.trim().toLowerCase()` pode associar lotes erroneamente em caso de nomes homônimos.

##### Falta de Ligação nos Fluxos de Trabalho
1. **Sem reatividade a mudanças globais (`page.tsx:L44-L66`)**: O `useEffect` roda apenas no mount (`[]`), não escutando `iatf_farm_changed`, troca de estação ou eventos de sincronização offline.
2. **Link `"Abrir Lote"` genérico (`page.tsx:L603-L608`)**: Aponta para `/lots` sem identificar o lote clicado (`lot.id`).
3. **`"Ver Workflow"` no Bloco 2 (`page.tsx:L519-L521`)**: É apenas texto decorativo dentro do card clicável, sem scroll até o Bloco 3 nem navegação.

##### Possíveis Brechas de Segurança
- Nenhum achado relevante diretamente no componente (isolamento multi-tenant depende das consultas em `db.ts` / `geneticInventoryService.ts` e RLS do Supabase).

---

#### 2. `src/app/login/page.tsx`
- **Arquivo**: `src/app/login/page.tsx` — 170 linhas analisadas — Tela de autenticação (login e auto-cadastro) via Supabase Auth.
- **Status**: `ALTO`

##### Erros e Bugs
1. **`sessionStorage.setItem('iatf_tab_session', 'active')` gravado indevidamente no `signUp` (`login/page.tsx:L27-L34`)**:
   - Mesmo quando o Supabase exige confirmação de e-mail (`data.session === null`), o marcador de sessão ativa da aba é gravado. Além disso, o código não inspeciona `data.user?.identities?.length === 0` (comportamento do Supabase quando o e-mail já existe), exibindo falsamente `"Cadastro realizado com sucesso!"`.
2. **`successMsg` não é limpo ao alternar entre Login e Cadastro (`login/page.tsx:L148`, `L158`)**:
   - Limpa apenas `errorMsg`, deixando a mensagem verde anterior visível.
3. **Ausência de `minLength` e `autoComplete` nos inputs (`login/page.tsx:L96-L120`)**:
   - Sem validação de tamanho mínimo de senha no HTML nem campo de confirmação de senha no cadastro.

##### Divergências
1. **Auto-cadastro aberto conflita com modelo multi-tenant gerenciado por equipe (`login/page.tsx:L26-L36` vs `team/page.tsx`)**:
   - Usuários criados via `supabase.auth.signUp({ email, password })` não passam por nenhum fluxo de criação/vínculo de organização (`organization_members`), ficando órfãos.

##### Falta de Ligação nos Fluxos de Trabalho
1. **Sem fluxo de recuperação de senha** ("Esqueci minha senha" / `resetPasswordForEmail`).
2. **Sem redirecionamento se já autenticado**: Um usuário logado que acessar `/login` vê o formulário novamente.
3. **Sem onboarding pós-cadastro**: Quem cria conta por `login/page.tsx` não tem tela para criar sua fazenda/organização.

##### Possíveis Brechas de Segurança
1. **ALTO — Auto-cadastro aberto (Open Self-Registration) sem CAPTCHA/verificação (`login/page.tsx:L26-L36`)**:
   - Qualquer terceiro externo pode registrar contas diretamente no Supabase Auth do projeto. Caso existam triggers ou políticas RLS permissivas para usuários autenticados, isso abre vetor para acesso indevido ou poluição de `auth.users`.
2. **MÉDIO — Ausência de política de senha forte no cadastro (`login/page.tsx:L113-L120`)**.
3. **BAIXO — Exposição direta de `err.message` do Supabase na UI (`login/page.tsx:L50-L51`)**.

---

#### 3. `src/app/team/page.tsx`
- **Arquivo**: `src/app/team/page.tsx` — 539 linhas analisadas — Gestão de equipe, criação direta de usuários com senha, alteração de função e ativação/inativação de colaboradores.
- **Status**: `CRÍTICO`

##### Erros e Bugs
1. **Geração de senha com `Math.random()` (`team/page.tsx:L51-L59`)**:
   - Utiliza PRNG não criptográfico (`Math.random()`) para gerar credenciais de acesso e não garante diversidade de classes de caracteres.
2. **Falhas em `handleToggleStatus` e `handleChangeRole` são silenciosas (`team/page.tsx:L110-L123`)**:
   - Se `toggleTeamMemberStatus` ou `updateTeamMemberRole` retornar `false` (erro de RLS ou rede), nenhuma mensagem de erro é exibida ao usuário.
3. **`setTimeout` sem cleanup ao fechar modal (`team/page.tsx:L98-L101`)**:
   - Fechar e reabrir o modal dentro de 1,8s faz o timer antigo fechar o novo modal.
4. **Data inválida potencial (`team/page.tsx:L295`)**:
   - `new Date(member.created_at).toLocaleDateString('pt-BR')` renderiza `"Invalid Date"` se `created_at` for nulo/vazio.
5. **Contagem de estatísticas e badge incompatíveis com roles extras (`team/page.tsx:L138-L166`, `L324-L332`)**:
   - `stats` soma membros inativos junto com ativos. Além disso, qualquer membro cujo `role` não seja `admin` nem `veterinarian` (ex.: `mastercriareproducao`, ver `src/lib/db.ts:L10216`) cai no `default` de `getRoleBadge` (`L159-L164`), sendo rotulado erroneamente como **"Operador de Curral"**, e não possui `<option>` correspondente no `<select>` (`L324-L332`).

##### Divergências
1. **Roles divergentes com `db.ts` (`team/page.tsx:L28, L329-L331` vs `src/lib/db.ts:L10216`)**:
   - A tela só conhece `admin`, `veterinarian` e `operator`, ignorando `mastercriareproducao`.
2. **Sem trava contra auto-inativação ou auto-rebaixamento (`team/page.tsx:L110-L123`)**:
   - O administrador logado pode inativar a própria conta ou rebaixar seu próprio cargo a `operator`, perdendo acesso administrativo.

##### Falta de Ligação nos Fluxos de Trabalho
1. **Inativar membro não encerra sessão no Supabase Auth (`team/page.tsx:L110-L116` + `db.ts:L8589-L8596`)**:
   - Atualiza apenas `organization_members.status = 'inactive'`; sessões JWT já emitidas continuam válidas até expirar se o RLS não checar `status = 'active'` em todas as tabelas.
2. **Ausência de reset de senha e exclusão de usuário**.
3. **Sem tratamento offline**: Operações falham sem mensagem clara se o usuário estiver sem internet.

##### Possíveis Brechas de Segurança
1. **CRÍTICO — Ausência total de verificação de RBAC na página `/team` (`team/page.tsx:L17-L539`)**:
   - A página não checa se o usuário logado possui role `admin`. Qualquer `operator` ou `veterinarian` que navegar para `/team` vê a lista completa de e-mails dos colaboradores, o botão `"Cadastrar Novo Usuário"`, o seletor de cargo (`handleChangeRole`) e o botão `"Inativar"`.
   - Se o RLS de `organization_members` (para `UPDATE` em `db.ts:L8580-L8596`) ou a RPC `create_team_member_user` (`db.ts:L8556`) não validarem estritamente `role = 'admin'` no servidor, há **escalação de privilégio direta** (operador se promovendo a `admin` ou criando novos admins).
2. **MÉDIO — PRNG inseguro na geração de senhas (`team/page.tsx:L51-L59`)**: Substituir `Math.random()` por `crypto.getRandomValues()`.
3. **BAIXO — Política de senha fraca (`team/page.tsx:L68`)**: Aceita qualquer senha com 6 caracteres (ex.: `123456`).

---

#### 4. `src/app/import/page.tsx`
- **Arquivo**: `src/app/import/page.tsx` — 135 linhas analisadas — Rota `/import` ("Importador Histórico de Planilhas Excel").
- **Status**: `CRÍTICO`

##### Erros e Bugs
1. **CRÍTICO — Implementação 100% simulada/mock em rota ativa (`import/page.tsx:L7-L35`)**:
   - Não existe `<input type="file">`, não lê nenhum arquivo Excel, não importa `xlsx`, não chama nenhuma função de banco (`db.ts` ou Supabase).
   - `fileName` (`L7`), tamanho `(1.19 MB)` (`L59`), `sheetsFound` (`L11-L19`) e `"7 Lotes • 892 Animais Mapeados"` (`L91`) são totalmente hardcoded.
   - `handleAnalyze` (`L21-L27`) e `handleMigrate` (`L29-L35`) apenas rodam `setTimeout` de 1,2s e 1,5s e exibem `"Importação Concluída com Sucesso!"` (`L127`) sem gravar nada.
2. **Botão de migração sem estado `disabled` (`import/page.tsx:L119-L124`)**:
   - Não desabilita enquanto `isAnalyzing` está ativo e não limpa os `setTimeout` no unmount.
3. **Typo na UI (`import/page.tsx:L123`)**: `"Executar Migração Transactional"` (mistura PT/EN).

##### Divergências
1. A interface afirma executar migração transacional normalizada 3FN para o Supabase PostgreSQL com `"0 duplicidades, 100% de integridade referencial"` (`L88`, `L114`), o que não existe no código.

##### Falta de Ligação nos Fluxos de Trabalho
1. **Fluxo completamente desconectado (código morto/protótipo)**: Confirma sucesso ao usuário sem criar nenhum lote, animal, protocolo ou estoque no sistema.

##### Possíveis Brechas de Segurança
1. **BAIXO — Exposição de protótipo não funcional em produção** sem restrição de acesso (`admin`), induzindo falsa sensação de persistência de dados.

---

#### 5. `src/app/inputs/page.tsx`
- **Arquivo**: `src/app/inputs/page.tsx` — 25 linhas analisadas — Rota legada `/inputs` que redireciona para `/estoque-semen`.
- **Status**: `OK / INFORMATIVO`

##### Erros e Bugs
- Nenhum achado relevante.

##### Divergências
1. Usa redirecionamento client-side via `useEffect` + `router.replace('/estoque-semen')` (`L10-L12`), gerando flash de loading no navegador; em Next.js App Router, um Server Component chamando `redirect('/estoque-semen')` seria instantâneo e mais limpo.

##### Falta de Ligação nos Fluxos de Trabalho
- Nenhum achado relevante.

##### Possíveis Brechas de Segurança
- Nenhum achado relevante.

---

#### 6. `src/app/protocols/page.tsx`
- **Arquivo**: `src/app/protocols/page.tsx` — 791 linhas analisadas — CRUD completo de protocolos hormonais e suas etapas (D0, D7/D8/D9, IA, DG), com presets, duplicação e arquivamento.
- **Status**: `MÉDIO`

##### Erros e Bugs
1. **Inconsistência zootécnica nos textos padrão do formulário (`protocols/page.tsx:L87-L88` e `L113-L114` vs `L32-L33`)**:
   - No preset `Tradicional 3 Manejos` (`L32-L33`), a retirada do implante P4 está corretamente no **D9** e a IA no **D11**.
   - Porém no estado inicial (`L88`) e em `resetForm` (`L114`), a etapa **IA (D11)** diz `"Inseminação Artificial (retirada do implante)"` e `"Retirar implante + realizar IA 48h-54h após D9"` — instrução veterinária incorreta que induz erro de manejo caso o usuário salve o formulário default.
2. **Preset não sobrescreve nome/descrição ao trocar de modelo (`protocols/page.tsx:L159-L167`)**:
   - `handleApplyPreset` faz `name: f.name || preset.title` e `description: f.description || preset.desc`. Se o usuário clicar no Preset 1 e depois clicar no Preset 2, as etapas mudam para o Preset 2, mas o nome e a descrição continuam os do Preset 1.
3. **Opções de filtro declaradas sem botões na UI (`protocols/page.tsx:L72-L73`, `L293`, `L376-L423`)**:
   - `filterManagements` prevê `'other'` (protocolos com manejos != 3 e != 4) e `filterStatus` prevê `'all'`, mas nenhum dos dois possui botão na toolbar.
4. **Inputs numéricos impedem apagar dígito ao editar (`protocols/page.tsx:L660`, `L729`)**:
   - `parseInt(e.target.value) || 3` (`L660`) e `parseInt(e.target.value) || 0` (`L729`) forçam imediatamente `3` ou `0` quando o campo fica temporariamente vazio durante a digitação.
5. **Ausência de `try/catch` em operações assíncronas (`protocols/page.tsx:L97-L103`, `L201-L240`, `L242-L258`, `L260-L281`)**:
   - Se `getProtocols`, `createProtocol`, `updateProtocol`, `deleteProtocol` ou `toggleProtocolStatus` rejeitarem com exceção, `loading` ou `saving` fica preso em `true`.
6. **Botões de ação nos cards não respeitam `saving` (`protocols/page.tsx:L493-L528`)**:
   - Permite cliques múltiplos simultâneos em arquivar/excluir.
7. **Timers de toast sobrepostos (`protocols/page.tsx:L236`, `L254`, `L277`)** e **uso de `key={idx}` em lista editável (`L697`)**, além de `alert()`/`confirm()` bloqueantes (`L184`, `L243`, `L265`).

##### Divergências
1. **`number_of_managements` desvinculado de `form.steps.length` (`protocols/page.tsx:L655-L662`)**: O usuário pode salvar `number_of_managements = 3` com 5 ou 6 etapas cadastradas.
2. **Rodapé estático (`protocols/page.tsx:L575`)**: Exibe `"Atualizado no sistema"` fixo em vez da data real de atualização.

##### Falta de Ligação nos Fluxos de Trabalho
1. Ao editar um protocolo existente (`L211-L217`), não há indicação na UI sobre o impacto em lotes/agendas já vinculados àquele protocolo.

##### Possíveis Brechas de Segurança
1. **MÉDIO — Ausência de verificação de RBAC na UI**: Qualquer usuário autenticado (incluindo `operator`) tem acesso aos botões de criar, editar, arquivar e excluir protocolos, dependendo unicamente do RLS no Supabase.

---

#### 7. `src/app/estoque-semen/page.tsx`
- **Arquivo**: `src/app/estoque-semen/page.tsx` — 589 linhas analisadas — Módulo completo de estoque criogênico (Sêmen e Embriões), botijões, canecas, movimentações (ledger), clientes em custódia, comprovantes e relatórios.
- **Status**: `ALTO`

##### Erros e Bugs
1. **Identificação frágil da fazenda principal por substring do nome (`estoque-semen/page.tsx:L73`)**:
   - `const mainFarm = farms.find((f) => f.name.toLowerCase().includes('principal')) || null;`
   - **Impacto**: Renomear a fazenda matriz (removendo `"principal"`) desativa a centralização e a trava de segurança; criar outra fazenda/retiro com `"principal"` no nome pode desviar todo o estoque para a fazenda errada.
2. **Spinner infinito se `activeFarmId` for `null` (`estoque-semen/page.tsx:L81`, `L127-L128`)**:
   - `loading` inicia como `true` (`L81`). Se não houver fazenda cadastrada (`activeFarmId === null`), `loadData` retorna na `L128` sem chamar `setLoading(false)`, travando a tela para sempre.
   - Adicionalmente, `L489`, `L520` e `L531` usam *non-null assertion* `farmId={targetFarmId!}` sem validação prévia.
3. **Seleção rápida de animal quebrada entre Sêmen e Embriões (`estoque-semen/page.tsx:L217-L227`)**:
   - `handleSelectAnimalPosition` procura `targetBalance` dentro de `balances` (que está filtrado pelo `materialType` atual). Se o usuário estiver no modo `SEMEN`, localizar um `EMBRYO` no `AnimalGeneticLookupModal` e iniciar saída/transferência, `targetBalance` será `undefined` (`balanceId: undefined`).
4. **Tipo `ModuleTab` com valores mortos (`estoque-semen/page.tsx:L57-L67`)**:
   - `'inbound' | 'outbound' | 'transfer'` existem no tipo mas nunca são atribuídos a `activeTab` (os botões `L402-L421` abrem o `MovementWizard`).
5. **Texto redundante no banner de trava (`estoque-semen/page.tsx:L230-L232` e `L350`)**:
   - `farmName` já inclui `(Estoque: ${mainFarm.name})`, fazendo o banner exibir `Nesta fazenda (Fazenda X (Estoque: Fazenda Principal))`.
6. **Toast sem limpeza de timer (`estoque-semen/page.tsx:L120-L125`)**.

##### Divergências
1. **Divergência arquitetural entre os 3 módulos de estoque de sêmen**:
   - `estoque-semen/page.tsx` (`L130-L132`) centraliza todo o estoque na `mainFarm` via `geneticInventoryService`.
   - `src/app/page.tsx` (`L99`, `L461-L527`) exibe estoque separado **por fazenda** (mostrando `"Sem Botijão / Saldo 0"` para todas as filiais).
   - `src/app/reports/page.tsx` (`L94`, `L873-L912`) ainda lê da tabela legada `semen_batches` (`getSemenBatches`).
2. **Truncamento silencioso do Ledger em 100 movimentações (`estoque-semen/page.tsx:L151`)**:
   - `getMovementHistory(targetFarmId, { materialType, limit: 100 })` não informa ao usuário que o histórico está limitado aos últimos 100 registros e não oferece paginação.

##### Falta de Ligação nos Fluxos de Trabalho
1. **Refetch desnecessário ao trocar de fazenda (`estoque-semen/page.tsx:L127-L176`)**:
   - Quando `mainFarm` existe, trocar de fazenda não altera `targetFarmId`, mas `activeFarmId` na lista de dependências dispara novamente todas as 8 queries em paralelo.

##### Possíveis Brechas de Segurança
1. **ALTO — Política de trava na fazenda principal aplicada apenas no Frontend (`estoque-semen/page.tsx:L74`, `L193-L196`)**:
   - A restrição de lançamentos apenas na fazenda principal é puramente client-side; se for requisito de integridade/auditoria, precisa ser aplicada no backend/RLS/RPC.
2. **MÉDIO — Ausência de verificação de RBAC na UI**: Não há bloqueio por cargo para ajustes de estoque (`adjustment`), saídas ou transferências.

---

#### 8. `src/app/reports/page.tsx`
- **Arquivo**: `src/app/reports/page.tsx` — 936 linhas analisadas — Central de Relatórios e Indicadores Reprodutivos (5 abas: Ficha Final, Lote × Categoria, Comparativo por Categoria, Visão Geral dos Lotes, Estoque de Sêmen) com exportação Excel e impressão.
- **Status**: `CRÍTICO`

##### Erros e Bugs
1. **CRÍTICO — Impossível selecionar `"Todas as Fazendas"` ou `"Todas as Estações"` (`reports/page.tsx:L71-L82`)**:
   - Os dois `useEffect` incluem `selectedFarmId` (`L76`) e `selectedSeasonId` (`L82`) nas dependências:
     ```ts
     useEffect(() => {
       if (activeFarmId && selectedFarmId === 'all') {
         setSelectedFarmId(activeFarmId);
       }
     }, [activeFarmId, selectedFarmId]);
     ```
   - **Impacto**: Sempre que o usuário escolhe `"Todas as Fazendas (Integrada)"` (`L381`) ou `"Todas as Estações"` (`L399`), o `useEffect` dispara imediatamente e reverte o filtro de volta para a fazenda/estação ativa. Os dois modos consolidados estão 100% quebrados.
2. **CRÍTICO — Botão `"Exportar Excel (.xlsx)"` exporta relatório errado na aba padrão (`reports/page.tsx:L244-L321`)**:
   - `handleExportExcel` trata `lote_categoria`, `comparativo_categoria` e `lotes_geral`, e cai no `else` (`L303-L320`) exportando **`Estoque_Semen`**.
   - **Impacto**: Como a aba inicial padrão é `'ficha_final'` (`L55`), clicar no botão `"Exportar Excel (.xlsx)"` no cabeçalho (`L349`) baixa silenciosamente `Relatorio_IATF_Estoque_Semen_...xlsx` em vez da Ficha Relatório Final.
3. **ALTO — Cabeçalho oficial e assinatura do veterinário escondidos na impressão (`reports/page.tsx:L538` e `L917`)**:
   - Ambas as seções têm `print:hidden`, apesar dos comentários `"Cabeçalho de Relatório Oficial para Impressão"` (`L537`) e `"Assinatura e Rodapé Oficial para Laudo Técnico / Impressão"` (`L916`). Ao imprimir abas que não sejam `ficha_final`, o PDF oficial sai sem título, sem identificação da fazenda e sem assinatura/CRMV.
4. **MÉDIO — Filtro de Estação Reprodutiva ignorado em `getLots` e `getSemenBatches` (`reports/page.tsx:L93-L94`)**:
   - `getLots(forceRefresh, targetFarm)` não recebe `targetSeason`; assim, a aba `lotes_geral` e os lotes enviados a `FichaRelatorioFinalView` ignoram a estação selecionada. `getSemenBatches()` não recebe nem `forceRefresh`, nem `targetFarm`, nem `targetSeason`.
5. **MÉDIO — Cabeçalho exibe `activeSeason` em vez da estação filtrada (`reports/page.tsx:L548`)**:
   - Mostra `{activeSeason?.name || 'Vigente'}` mesmo que o usuário selecione outra estação em `selectedSeasonId`.
6. **MÉDIO — Busca de `"primípara"` sensível a acentuação e fora dos filtros (`reports/page.tsx:L209`, `L217`)**:
   - `primiparaItems` usa `lotCatData` (ignorando `selectedCategory` e `searchQuery`) e busca `'primípara'` com acento; categorias sem acento (`PRIMIPARA`) ficam zeradas.
7. **BAIXO — Falta de estados vazios nas abas `comparativo_categoria`, `lotes_geral` e `semen` (`reports/page.tsx:L720-L912`)**.

##### Divergências
1. **Fórmula de Taxa de Prenhez divergente entre módulos**:
   - `reports/page.tsx` (`L194`, `L206`, `L212`) divide `pregnant_qty / inseminated_qty`.
   - `src/app/page.tsx` (`L96`) divide `totalPregnancies / totalDiagnosed`.
   - `FichaRelatorioFinalView.tsx` (`L131`) divide `prenhas / total` (todas as fêmeas do lote).
2. **Aba `semen` (`reports/page.tsx:L873-L912`) usa tabela legada `semen_batches`**, divergindo totalmente do novo módulo `/estoque-semen` (`geneticInventoryService`).

##### Falta de Ligação nos Fluxos de Trabalho
1. **Filtros `selectedCategory` e `searchQuery` inoperantes em 4 das 5 abas**: Permanecem visíveis em `ficha_final`, `comparativo_categoria`, `lotes_geral` e `semen`, mas só afetam `lote_categoria`.
2. **Props desalinhadas passadas para `FichaRelatorioFinalView` (`reports/page.tsx:L571-L576`)**: Passa `activeFarmId` e `activeSeasonId` do contexto global em vez de `selectedFarmId` e `selectedSeasonId`.
3. **Sem botão de refresh manual (`loadData(true)`)**.

##### Possíveis Brechas de Segurança
1. **MÉDIO — Dados pessoais hardcoded como fallback de laudo (`reports/page.tsx:L240-L241`)**:
   - `'DR. SAMOEL DUARTE'` e `'CRMV-SP 12345'` são exibidos como responsável técnico padrão para qualquer tenant sem veterinário cadastrado.
2. **BAIXO — Risco de Excel Formula Injection (`reports/page.tsx:L248-L320`)**:
   - Campos de texto livre exportados via `XLSX.utils.json_to_sheet` sem neutralização de caracteres iniciais de fórmula (`=`, `+`, `-`, `@`).

---

#### 9. `src/components/FichaRelatorioFinalView.tsx`
- **Arquivo**: `src/components/FichaRelatorioFinalView.tsx` — 506 linhas analisadas — Visualização, impressão A4 e exportação XLSX da "Ficha Relatório Final" de campo (10 colunas) com marca condicional Master Cria.
- **Status**: `CRÍTICO`

##### Erros e Bugs
1. **CRÍTICO — Bug grave na detecção de prenhez: `"Não Prenha"` é classificada como `PRENHA` (`FichaRelatorioFinalView.tsx:L112-L118`, `L193-L196`, `L447-L450`)**:
   - Em 3 lugares do componente, a verificação é:
     ```ts
     const isPrenha =
       a.pregnancy_status?.toLowerCase().includes('prenh') ||
       a.pregnancy_status === 'PRENHA' ||
       a.pregnancy_status === 'P';
     ```
   - **Causa raiz e impacto**: Qualquer registro salvo como `"Não Prenha"`, `"NÃO PRENHA"` ou `"nao prenha"` contém a substring `'prenh'`, logo `includes('prenh')` retorna **`true`**! O animal vazio é contabilizado como **PRENHA** nas estatísticas, na ficha impressa e no Excel exportado.
   - Além disso, animais **sem DG realizado** (`null`, `'pendente'`) ou **não inseminados** caem no `else` (`vazias++`), são exibidos como `'Não Prenha '` (com espaço sobrando no final em `L206` e `L476`) e reduzem artificialmente a taxa de concepção (`L131`).
2. **ALTO — `selectedLotId` não atualiza ao trocar de fazenda (`FichaRelatorioFinalView.tsx:L63-L67`)**:
   - O `useEffect` só seleciona `lots[0].id` quando `!selectedLotId`. Ao mudar o filtro de fazenda em `reports/page.tsx`, `lots` muda, mas `selectedLotId` continua apontando para o lote da fazenda anterior, mantendo os animais errados na tela.
3. **MÉDIO — Sobrescrita de metadados editados + race condition no `fetchAnimals` (`FichaRelatorioFinalView.tsx:L70-L101`)**:
   - O `useEffect` depende de `[selectedLotId, lots, farms, orgName]`. Quando `orgName` termina de carregar de forma assíncrona (`L53-L60`), ele dispara novamente, refaz a query de animais e sobrescreve o que o usuário digitou em `produtor`, `propriedade` e `dataFicha`. Falta também flag `cancelled` para evitar race condition ao alternar lotes rapidamente.
4. **MÉDIO — Valores zootécnicos inventados quando dados estão ausentes (`FichaRelatorioFinalView.tsx:L201-L202`, `L461-L464`)**:
   - Se categoria ou retiro estiverem vazios no banco, o relatório preenche automaticamente `'MULTÍPARA'` e `'SEDE'`, distorcendo dados oficiais de campo.
5. **BAIXO — `formatMonthParto` (`L159-L167`) retorna data completa (`DD/MM/AAAA`)** em vez de mês/ano para a coluna `MÊS P.P` (`L442`).
6. **BAIXO — `handleExportXLSX` (`L175-L213`)** não tem `try/catch` nem indicador de carregamento, e exporta `animals` completo mesmo quando há filtro `searchTerm` ativo na tabela (`filteredAnimals`), assim como o rodapé (`L497-L500`) soma `animals` enquanto a tabela mostra `filteredAnimals`.

##### Divergências
1. **Props não utilizadas (`FichaRelatorioFinalView.tsx:L21-L31`)**: `activeFarmId` e `activeSeasonId` são declaradas na interface `Props` e passadas por `reports/page.tsx`, mas completamente ignoradas.
2. **Datas planejadas vs reais (`FichaRelatorioFinalView.tsx:L205, L207, L473, L479`)**: Usa sempre `ia_planned_date` e `dg_planned_date` do lote para todos os animais, ignorando eventuais datas individuais reais de IA/DG.

##### Falta de Ligação nos Fluxos de Trabalho
1. **Metadados de campo não persistidos (`L42-L47`)**: `produtor`, `propriedade`, `horaInicio`, `horaTermino` e `observacoes` se perdem ao trocar de aba ou recarregar a página.
2. **`dataFicha` sem campo de edição na UI (`L44`, `L270-L358`, `L400`)**: Existe estado `dataFicha`, mas não há `<input>` para alterá-la nos controles superiores.

##### Possíveis Brechas de Segurança
1. **MÉDIO — Vazamento de dados reais de cliente/produtor hardcoded no código (`FichaRelatorioFinalView.tsx:L183-L184`, `L394`)**:
   - `'RAMIRO ANTÔNIO DAVI'` e `'FAZENDA SÃO LUCAS'` estão hardcoded como fallback na folha impressa e no Excel exportado, expondo dados de um produtor específico para outros tenants da plataforma caso os campos fiquem em branco.
2. **BAIXO — Verificação de marca oficial Master Cria vulnerável a spoofing de e-mail (`FichaRelatorioFinalView.tsx:L55-L56` + `src/lib/db.ts:L10215-L10218`)**:
   - Combinado com o auto-cadastro aberto em `login/page.tsx`, qualquer pessoa que registrar um e-mail contendo `mastercriareproducao` recebe o selo `"Master Cria Oficial"` e a logomarca nos laudos.

---

#### 10. `src/components/masterCriaLogoBase64.ts`
- **Arquivo**: `src/components/masterCriaLogoBase64.ts` — 1 linha (412.138 bytes / ~402 KB) — Exporta `MASTER_CRIA_LOGO_BASE64` (Data URI `data:image/png;base64,...`).
- **Status**: `BAIXO`

##### Erros e Bugs
1. **Impacto de performance no bundle JS**: Embutir um PNG de ~402 KB como string literal em um módulo TS faz com que o asset seja baixado e parseado dentro do JavaScript do cliente em toda carga de `/reports` (inclusive em redes rurais móveis), impedindo cache HTTP separado de imagem estática (`/public/...`) e desperdiçando banda para uma imagem renderizada em apenas `w-16 h-16` (64×64px em `FichaRelatorioFinalView.tsx:L377`).

##### Divergências
- Nenhum achado relevante.

##### Falta de Ligação nos Fluxos de Trabalho
1. **Carregamento incondicional para todos os tenants**: É importado estaticamente em `FichaRelatorioFinalView.tsx:L10`, sendo incluído no bundle mesmo para organizações onde `isMasterCria === false` (poderia usar `import()` dinâmico ou arquivo estático em `public/`).

##### Possíveis Brechas de Segurança
- Nenhum achado relevante.

---

### Lote 10 — Páginas: Agenda, Animals e Animals/[id]

### Relatório de Auditoria — Lote 10 (Páginas: Agenda, Animals e Animals/[id])

---

#### 1. `src/app/agenda/page.tsx`

- **Arquivo**: `src/app/agenda/page.tsx` — **1.763 linhas analisadas** — Página cliente da Agenda Integrada de Manejos (calendário mensal unificado entre fazendas para eventos de lote IATF e serviços veterinários avulsos, com KPIs, filtros, criação, conclusão, exclusão e reagendamento por drag-and-drop/manual).
- **Status**: `ALTO`

##### Erros e Bugs
1. **Re-fetch em cascata por dependência `createLotId` no `useCallback` (`agenda/page.tsx:L140-L163`, `L1401`)**:
   - **Causa raiz**: `loadData` declara `createLotId` em seu array de dependências (`L159`). Na carga inicial, `setCreateLotId(lotsData[0].id)` (`L150-L152`) altera o estado e dispara `useEffect([loadData])` (`L161-L163`) uma segunda vez imediatamente. Além disso, sempre que o usuário troca o lote selecionado no modal de criação (`L1401`), toda a agenda e a lista de lotes são recarregadas do banco em segundo plano.
   - **Impacto**: Requisições duplicadas ao banco/IndexedDB e flicker de loading durante a interação com o modal.
2. **`createLotId` obsoleto ao trocar de fazenda (`agenda/page.tsx:L150-L152`, `L229-L230`, `L543`)**:
   - **Causa raiz**: Quando `selectedFarmId` muda, `loadData` carrega apenas os lotes da nova fazenda, mas `if (lotsData.length > 0 && !createLotId)` não substitui um `createLotId` que já estava preenchido com um lote da fazenda anterior.
   - **Impacto**: Ao salvar um manejo de lote sem mexer no `<select>`, `selectedLot` (`L229`) resulta em `undefined` e `targetFarmId` cai no fallback da nova fazenda (`L230`), podendo inserir um evento vinculando um `lot_id` de uma fazenda ao `farm_id` de outra.
3. **Overflow de mês em `goPrevMonth` / `goNextMonth` nos dias 29, 30 e 31 (`agenda/page.tsx:L196-L206`)**:
   - **Causa raiz**: `d.setMonth(d.getMonth() - 1)` e `d.setMonth(d.getMonth() + 1)` mantêm o dia atual do objeto `Date`. Ex.: em 31/01, `setMonth(1)` pula fevereiro e avança para 03/03; em 31/03, `setMonth(1)` retorna para 03/03 (mês não muda).
   - **Impacto**: Navegação do calendário falha em finais de mês. Deveria usar `new Date(year, month +/- 1, 1)`.
4. **Filtro rápido `DG` oculta `DG1` e `DG2` (`agenda/page.tsx:L437-L445`, `L487`, `L701-L706`)**:
   - **Causa raiz**: O KPI `monthStats.dgCount` (`L487`) contabiliza `['DG', 'DG1', 'DG2']`, mas `filteredEvents` (`L442`) exige igualdade estrita `ev.step_code !== filterStep` quando `filterStep === 'DG'`.
   - **Impacto**: Eventos `DG1` e `DG2` somem do calendário ao clicar no filtro "DG", gerando inconsistência com o próprio KPI.
5. **Formatação manual de datas com `.split('-').reverse().join('/')` e mistura de fuso horário (`agenda/page.tsx:L83`, `L194`, `L387-L390`, `L985`, `L1122`, `L1170`)**:
   - **Causa raiz**: `formatDateBR` é importado em `L15`, mas ignorado em `L985`, `L1122` e `L1170`. Se `execution_date` vier como timestamp ISO (`YYYY-MM-DDTHH:mm:ssZ`), `split('-').reverse().join('/')` exibe texto corrompido. Além disso, `currentDate` (`L83`, `L194`) usa o fuso local do navegador enquanto `todayStr` (`L390`) usa `America/Sao_Paulo`.
   - **Impacto**: Exibição quebrada para datas com hora e possível virada incorreta de mês em fusos fora de Brasília.
6. **Drag & Drop e reagendamento habilitados para eventos já concluídos sem aviso (`agenda/page.tsx:L850`, `L1012-L1043`)**:
   - **Causa raiz**: Cards concluídos permanecem com `draggable={true}` (`L850`) e o bloco "Alterar / Reagendar Data" continua ativo no modal. Em `src/lib/db.ts:L1639`, reagendar um evento concluído sobrescreve `execution_date` sem confirmação específica na UI.
   - **Impacto**: Alteração acidental de histórico já executado.
7. **Validação insuficiente em `handleCompleteSubmit` (`agenda/page.tsx:L310-L314`, `L1083-L1110`)**:
   - **Causa raiz**: `parseInt(animalsWorked) || 0` e `parseInt(lossesCount) || 0` não bloqueiam números negativos digitados manualmente no input.
8. **`showToast` sem cancelamento de timeout anterior (`agenda/page.tsx:L134-L137`)**:
   - **Causa raiz**: Múltiplos `setTimeout(..., 4000)` concorrentes fazem mensagens novas desaparecerem antes do tempo ou executarem após desmontagem.
9. **Classes Tailwind inexistentes/inválidas (`agenda/page.tsx:L799`, `L825`, `L873`, `L1677`)**:
   - `hover:bg-slate-850/50` (`L799`) e `py-0.2` (`L825`, `L873`, `L1677`) não existem na escala padrão do Tailwind.

##### Divergências
1. **Offline vs Online na criação de eventos (`agenda/page.tsx:L238-L288` vs `src/lib/db.ts:L1451-L1477`)**:
   - No modo offline, `insertManagementEvent` persiste `eventRecord` no IndexedDB (`offlineDb.management_events.put`) **sem** `title`, `start_time`, `end_time` e `notes` (esses campos só vão para a fila `syncEngine.enqueueMutation`). Ao recarregar a agenda offline (`loadData(true)`), serviços avulsos perdem título, horário e observações localmente até sincronizar.
2. **Seleção de fazenda na Agenda vs `FarmContext` (`agenda/page.tsx:L74`, `L80` vs `src/context/FarmContext.tsx:L68-L71`)**:
   - `FarmContext` impõe seleção estrita de fazenda única, mas `AgendaPage` ignora `activeFarmId` e sempre inicia em `'all'`.
3. **Etiqueta `D8/D9` vs filtro `D7/D8/D9` (`agenda/page.tsx:L439` vs `L693`)**:
   - O botão exibe `D8/D9`, mas o filtro inclui `D7`.
4. **Inconsistência no código padrão do modo "Serviço Avulso" (`agenda/page.tsx:L1367-L1368` vs `L1482`)**:
   - Ao alternar para a aba "Serviço Avulso", define `createStepCode('SRV')` com `createTitle('Exame Andrológico')`, enquanto a sugestão rápida para "Exame Andrológico" usa `code: 'ANDR'`.
5. **Texto do modal de reagendamento (`agenda/page.tsx:L1708`)**:
   - Menciona apenas `(D9, IA, DG)`, omitindo `D7`, `D8`, `DG1` e `DG2`.

##### Falta de Ligação nos Fluxos de Trabalho
1. **Parâmetros de URL `?date=` e `?lot=` lidos apenas uma vez na montagem (`agenda/page.tsx:L166-L182`)**:
   - Usa `window.location.search` em `useEffect(..., [])` em vez de `useSearchParams()`. Navegações subsequentes para `/agenda?date=...&lot=...` não reposicionam o mês nem o filtro.
2. **Atalho `/lots?lotId=...` não sincroniza a fazenda ativa global (`agenda/page.tsx:L1047-L1060`, `L1280-L1289`)**:
   - Na visão integrada (`all`), abrir a ficha de um lote de outra fazenda navega para `/lots?lotId=...` sem atualizar `activeFarmId` no `FarmContext`.
3. **Conclusão de manejo pela Agenda desconectada do apontamento de matrizes (`agenda/page.tsx:L306-L327`)**:
   - `completeManagementEvent` atualiza apenas `management_events`, sem atualizar ou vincular apontamentos em `iatf_lot_animals` / `animal_managements`.
4. **Toast de erro renderizado com visual de sucesso (`agenda/page.tsx:L507-L512`)**:
   - Todas as chamadas a `showToast` — incluindo erros (`L155`, `L256`, `L297`, `L322`, `L338`, `L363`) — exibem fundo verde (`bg-emerald-600`) com ícone `<Check />`.
5. **Métricas calculadas e não exibidas (`agenda/page.tsx:L489-L490`, `L498-L499`)**:
   - `avulsoCount` e `concludedCount` são computados em `monthStats`, mas nunca renderizados.

##### Possíveis Brechas de Segurança
1. **Ausência de verificação de RBAC/permissões na UI (`agenda/page.tsx:L220`, `L306`, `L330`, `L343`)**:
   - Criação, conclusão, reagendamento em cascata e exclusão ficam expostos a qualquer usuário autenticado; no modo offline, mutações são enfileiradas localmente no Dexie sem checagem de papel.
2. **Inconsistência de tenant/fazenda por `createLotId` obsoleto (`agenda/page.tsx:L229-L248`)**:
   - Permite submeter `lot_id` de uma fazenda com `farm_id` de outra caso o usuário alterne o filtro de fazenda sem re-selecionar o lote.
3. **Dado pessoal hardcoded em placeholder (`agenda/page.tsx:L1565`)**:
   - `placeholder="Ex: Dr. Samoel Duarte"` expõe nome real no código-fonte (informativo/baixo).

---

#### 2. `src/app/animals/page.tsx`

- **Arquivo**: `src/app/animals/page.tsx` — **1.166 linhas analisadas** — Página cliente de listagem paginada, busca, cadastro, edição, inativação/exclusão de matrizes bovinas, com painel lateral de resumo/histórico e gatilho para `AnimalManagementModal`.
- **Status**: `ALTO`

##### Erros e Bugs
1. **Ordenação da lista diverge do rótulo da interface (`animals/page.tsx:L120-L127`, `L501-L514` vs `src/lib/db.ts:L2388`)**:
   - **Causa raiz**: O botão exibe `"Menor → Maior"` / `"Maior → Menor"`, sugerindo ordenação por número de brinco (`tag_number`), mas `fetchAnimals` não passa `sortBy: 'tag_number'` para `getAnimalsPaginated`. O padrão em `db.ts:L2388` é `sortBy = 'created_at'`.
   - **Impacto**: A lista é ordenada por data de criação e não pelo número do brinco.
2. **Painel lateral (`selectedAnimal`) fica obsoleto após editar matriz ou concluir manejo (`animals/page.tsx:L316-L330`, `L1152-L1157`)**:
   - **Causa raiz**: Após `updateAnimal`, `fetchAnimals` recarrega `animals`, mas `selectedAnimal` não é atualizado. No `onSuccess` de `AnimalManagementModal` (`L1152-L1157`), `selectAnimal(selectedAnimal)` recebe o objeto antigo em memória, recarregando apenas o `history` e mantendo `selectedAnimal.reproductive_status` desatualizado.
   - **Impacto**: O usuário edita o brinco/raça/status ou aponta uma inseminação/DG e o cabeçalho da ficha lateral continua exibindo os dados antigos.
3. **Campo `Status da Matriz` editável no cadastro, mas silenciosamente ignorado (`animals/page.tsx:L302-L311`, `L1001-L1013` vs `src/lib/db.ts:L2722`, `L2752`)**:
   - **Causa raiz**: O modal exibe o `<select>` de `status` (`active` / `inactive`) também no modo de criação, mas `handleSaveAnimal` não envia `status` para `createAnimal` (que sempre grava `'active'`).
   - **Impacto**: Selecionar `Inativa / Descarte` ao criar uma matriz não surte efeito.
4. **Atalho `"+ Cadastrar brinco agora"` reutiliza sujeira do formulário anterior (`animals/page.tsx:L555-L559`)**:
   - **Causa raiz**: Define apenas `tag_number` e abre o modal sem chamar `handleOpenCreateAnimal`, deixando `modalError`, `rfid_number`, `birth_date`, `reproductive_status`, `status` e `editingAnimalId` potencialmente contaminados por interações anteriores.
   - **Impacto**: Cadastro acidental com dados de outra matriz ou atualização indevida.
5. **Race condition na carga inicial e na seleção de histórico (`animals/page.tsx:L177-L190`, `L219-L225`)**:
   - **Causa raiz**: Na montagem, `selectedFarmFilter` inicia como `'all'` (`L71`) enquanto `activeFarmId` ainda é `null`, disparando uma consulta global; em seguida `activeFarmId` muda `selectedFarmFilter` e dispara outra consulta sem cancelamento (`AbortController`). Além disso, `selectAnimal` (`L219-L225`) não possui `try/catch` (se `getAnimalHistory` rejeitar, `loadingHistory` fica preso em `true`) nem controle de concorrência entre cliques rápidos.
6. **Datas em formato ISO bruto na linha do tempo (`animals/page.tsx:L821`, `L830`)**:
   - **Causa raiz**: `lot?.ia_planned_date` e `h.expected_parturition_date` são convertidos com `String(...)` sem `formatDateBR`.
7. **Ausência de normalização de caixa em `tag_number` (`animals/page.tsx:L902` vs `animals/[id]/page.tsx:L773`)**:
   - **Causa raiz**: Permite minúsculas na criação/edição nesta tela, enquanto `animals/[id]/page.tsx` força `.toUpperCase()` e o offline compara case-insensitive (`db.ts:L2696-L2697`). Online, uma constraint `UNIQUE` padrão no Postgres permite duplicatas como `100a` e `100A`.
8. **Chave de lista usando índice (`animals/page.tsx:L812`) e `setTimeout` sem cleanup (`L329`, `L353`, `L382`)**:
   - `key={i}` na timeline e timers de `feedbackMsg` sem `clearTimeout`.

##### Divergências
1. **Offline vs Online na exibição de Fazenda/Retiro (`animals/page.tsx:L621-L625`, `L740-L744` vs `src/lib/db.ts:L2439-L2440`, `L2521-L2522`)**:
   - Online, `getAnimalsPaginated` retorna `farms(name)` e `properties(name)`. Offline (e no fallback de erro), retorna `farms: null, properties: null`, ocultando a localização nos cards.
2. **Carregamento duplicado de fazendas (`animals/page.tsx:L58`, `L76`, `L143`)**:
   - Ignora `farms` já carregado no `FarmContext` e chama `getFarms()` novamente em `loadInitialData`.
3. **Exclusão de matrizes doadoras (`donorCount`) omitida na UI (`animals/page.tsx:L81-L87`, `L1098-L1110` vs `src/lib/db.ts:L2933-L2955`)**:
   - `deleteAnimal` contabiliza `genetic_materials.donor_id` em `totalRefs`, mas não retorna `donorCount` nem exclui esses registros em `force = true`. O modal exibe `0 lote(s)` e `0 ciclo(s)` para uma doadora bloqueada, e a exclusão forçada pode falhar por FK.
4. **Fallback perigoso de `farmId` no `AnimalManagementModal` (`animals/page.tsx:L1160`)**:
   - Faz fallback para `activeFarmId` caso `selectedAnimal.farm_id` esteja ausente; na visão `"Todas as Fazendas"`, isso pode vincular um manejo à fazenda errada.

##### Falta de Ligação nos Fluxos de Trabalho
1. **Matrizes inativadas ficam inacessíveis na listagem (`animals/page.tsx:L367-L386`, `L1011` vs `src/lib/db.ts:L2398`, `L2472`)**:
   - O fluxo recomenda "Inativar / Marcar como Descarte" (`L1124`), porém `getAnimalsPaginated` filtra exclusivamente `status = 'active'` e a página não possui filtro para listar ou reativar matrizes inativas. Após inativar, a matriz some definitivamente da tela `/animals`.
2. **Fluxo de edição/manejo não sincroniza o painel lateral (`animals/page.tsx:L324-L329`, `L1152-L1157`)**:
   - Quebra a continuidade visual imediata da ficha selecionada.

##### Possíveis Brechas de Segurança
1. **Ausência de controle de acesso por papel (RBAC) na UI (`animals/page.tsx:L278`, `L337`, `L1129`)**:
   - A ação destrutiva "Excluir Definitivamente (Apaga todo o histórico)" (`force = true`) está disponível para qualquer usuário autenticado na rota, dependendo integralmente de RLS no banco.
2. **Validação de entrada ausente para `birth_date`, `tag_number` e `rfid_number` (`animals/page.tsx:L280-L312`)**:
   - Não impede datas futuras de nascimento nem limita comprimento/caracteres especiais de `tag_number` ou `rfid_number`.

---

#### 3. `src/app/animals/[id]/page.tsx`

- **Arquivo**: `src/app/animals/[id]/page.tsx` — **1.018 linhas analisadas** — Página de detalhe individual da matriz (`/animals/[id]`), com cabeçalho zootécnico, previsão de parto, linha do tempo sequencial de protocolos individuais (`animal_managements`), histórico consolidado de safras (`getAnimalHistory`), modais de edição, exclusão/descarte e `AnimalManagementModal`.
- **Status**: `CRÍTICO`

##### Erros e Bugs
1. **Duplicação sistemática de protocolos entre as seções "Protocolos Realizados" e "Histórico Consolidado de Safras" (`animals/[id]/page.tsx:L86-L96`, `L404-L667`, `L674-L730` vs `src/lib/db.ts:L3047-L3100`)**:
   - **Causa raiz**: `getAnimalHistory(id)` já concatena `iatf_lot_animals` e `animal_managements`. A página renderiza `managements` na seção principal (`L404`) e renderiza todo o `history` novamente na seção inferior (`L674`), marcada no código como `"HISTÓRICO ANTERIOR / LEGADO"` (`L672`).
   - **Impacto**: Todo manejo individual aparece duplicado na ficha da vaca.
2. **Protocolo sem `d0_executed_at` fica travado na UI sem botão de apontamento (`animals/[id]/page.tsx:L499-L508`, `L547`, `L595`, `L650`)**:
   - **Causa raiz**: Os botões de D9, IA e DG só aparecem quando a etapa anterior foi executada (`hasD0`, `hasD9`, `hasIa`). Se `d0_executed_at` estiver nulo, o card de D0 exibe `"Pendente de apontamento"` (`L505`), mas não oferece nenhum botão para apontar D0.
   - **Impacto**: O ciclo fica permanentemente bloqueado pela interface.
3. **Previsão de parto no cabeçalho em formato ISO bruto e com fallback potencialmente incorreto (`animals/[id]/page.tsx:L248-L254`, `L325-L333`)**:
   - **Causa raiz**: `L331` renderiza `{String(activeParturitionDate)}` sem `formatDateBR` (enquanto `L646` e `L712` usam `formatDateBR`). Além disso, `activeParturitionDate` (`L252-L254`) pode cair no fallback `history[0]?.expected_parturition_date` de uma safra anterior caso o manejo ativo ainda não tenha data.
   - **Impacto**: Data fora do padrão brasileiro e risco de exibir previsão de parto de gestação antiga.
4. **Estado `animal` não é limpo quando `getAnimalById(id)` retorna `null` (`animals/[id]/page.tsx:L92-L94`)**:
   - **Causa raiz**: `if (animalData) { setAnimal(animalData); }` não trata o ramo `else` (`setAnimal(null)`).
   - **Impacto**: Se o parâmetro `id` mudar para um registro inexistente após carregar um animal válido, a UI mantém os dados do animal anterior na tela.
5. **Etapa de retirada fixa como `"2º Passo — D9"` (`animals/[id]/page.tsx:L528`)**:
   - **Causa raiz**: Rótulo hardcoded como `D9` mesmo para protocolos de 7 ou 8 dias.
6. **`handleOpenEdit` sem tratamento de erro (`animals/[id]/page.tsx:L108-L137`)**:
   - **Causa raiz**: `await Promise.all([getFarms(), getBreeds(), getAnimalCategories()])` não tem `try/catch` nem indicador de carregamento; uma falha de rede impede a abertura do modal silenciosamente.
7. **Fallback quebrado de `farmId` no `AnimalManagementModal` (`animals/[id]/page.tsx:L1012`)**:
   - **Causa raiz**: Tenta ler `(animal as ...).properties?.farm_id`, mas `getAnimalById` (`src/lib/db.ts:L3028`) seleciona apenas `properties (name)`. O fallback sempre resolve para `''`.
8. **Uso inconsistente de `alert()` nativo (`animals/[id]/page.tsx:L189`, `L204`), `key={i}` (`L687`) e `setTimeout` sem cleanup (`L163`, `L202`)**:
   - Erros de exclusão/inativação usam `alert()` em vez de `editFeedback`; `key={i}` no histórico; timers sem cancelamento no unmount.

##### Divergências
1. **Edição de fazenda limpa `property_id` vs seleciona primeira propriedade (`animals/[id]/page.tsx:L804` vs `animals/page.tsx:L227-L234`)**:
   - Comportamento inconsistente entre os dois modais de edição da mesma entidade.
2. **Ordenação de raças e capitalização de `tag_number` (`animals/[id]/page.tsx:L116`, `L773` vs `animals/page.tsx:L147-L153`, `L902`)**:
   - Aqui `tag_number` força `.toUpperCase()` e não prioriza Nelore na lista de raças, ao contrário de `animals/page.tsx`.
3. **Exclusão de doadoras (`donorCount`) omitida no modal (`animals/[id]/page.tsx:L52-L57`, `L959-L968` vs `src/lib/db.ts:L2933-L2955`)**:
   - Mesma divergência de `animals/page.tsx`: `genetic_materials.donor_id` bloqueia a exclusão sem ser exibido no modal nem removido no `force = true`.

##### Falta de Ligação nos Fluxos de Trabalho
1. **Impossibilidade de editar ou excluir protocolos individuais (`animals/[id]/page.tsx:L404-L667`)**:
   - Apesar de `deleteAnimalManagement` existir em `src/lib/db.ts:L8174`, a ficha não oferece ação para corrigir etapas já apontadas (ex.: erro em touro, ECC ou DG) nem remover um ciclo criado por engano.
2. **Códigos de lote exibidos como texto estático sem link (`animals/[id]/page.tsx:L452`, `L694`)**:
   - Não há `<Link href="/lots?lotId=...">` para navegar da matriz para o lote correspondente.
3. **Navegação de retorno fixa para `/animals` (`animals/[id]/page.tsx:L277`)**:
   - Perde o contexto quando o usuário acessa a ficha da vaca a partir de `/lots` ou relatórios.

##### Possíveis Brechas de Segurança
1. **CRÍTICO — Risco de IDOR / Acesso Cross-Tenant nas operações por `id` da URL (`animals/[id]/page.tsx:L44`, `L86-L90`, `L146`, `L175`, `L195` + `src/lib/db.ts:L2862-L2865`, `L2957-L2960`, `L3021-L3032`)**:
   - **Evidência**: O `id` da rota `/animals/[id]` é repassado diretamente a `getAnimalById(id)`, `updateAnimal(id, ...)` e `deleteAnimal(id, ...)`. Diferente de `getAnimalsPaginated` (que filtra `.eq('organization_id', orgId)`), nenhuma dessas três funções aplica filtro de `organization_id` na query Supabase nem valida ownership no cliente (nem no IndexedDB offline).
   - **Impacto**: Toda a isolação multi-tenant de leitura, edição e exclusão definitiva desta tela depende 100% de políticas RLS impecáveis no PostgreSQL. Qualquer lacuna de RLS (ou dados residuais no IndexedDB offline entre sessões) permite acesso/alteração/deleção de matrizes de outras organizações por manipulação direta do UUID na URL.
2. **Ausência de validação de formato UUID no parâmetro `id` (`animals/[id]/page.tsx:L44`, `L87`)**:
   - Strings inválidas na URL são enviadas diretamente ao PostgREST, disparando erro `22P02` desnecessário no banco.
3. **Ausência de verificação de RBAC na UI (`animals/[id]/page.tsx:L337-L364`, `L984-L992`)**:
   - Edição, inativação e exclusão definitiva em cascata ficam expostas a qualquer usuário autenticado na rota.

---

##### Resumo Executivo do Lote 10
| Arquivo | Linhas | Status | Principais Pontos |
|---|---:|---|---|
| `src/app/agenda/page.tsx` | 1.763 | `ALTO` | Re-fetch em loop por `createLotId`; `createLotId` obsoleto entre fazendas; overflow de mês em dias 29–31; filtro `DG` exclui `DG1/DG2`; perda de campos de serviço avulso offline; toast de erro verde. |
| `src/app/animals/page.tsx` | 1.166 | `ALTO` | Ordenação real por `created_at` apesar do rótulo de UI; `selectedAnimal` obsoleto após editar/manejar; `status` ignorado na criação; matrizes inativadas somem sem filtro para visualização/reativação; race conditions. |
| `src/app/animals/[id]/page.tsx` | 1.018 | `CRÍTICO` | Risco de IDOR cross-tenant (queries por `id` sem `organization_id` no `db.ts`); duplicação de protocolos entre `managements` e `history`; protocolo sem `d0_executed_at` travado na UI; falta edição/exclusão de protocolos individuais. |

---

### Lote 11 — Páginas: Lots e Registries

### Relatório de Auditoria — Lote 11 (Páginas: Lots e Registries)

---

#### 1. `src/app/lots/page.tsx`

- **Arquivo**: `src/app/lots/page.tsx` — 3.598 linhas analisadas
- **Papel no sistema**: Página principal de gestão de lotes de IATF. Concentra listagem/filtro/ordenação de lotes, criação de lotes, edição inline de código e observações, exclusão, alteração de protocolo hormonal e cronograma, modal de ficha do lote com tabela de matrizes, marcação individual/coletiva por fase (`D0`, `D8/D9`, `IA`, `DG`), entrada rápida no tronco (curral), vínculo/cadastro rápido de matrizes, abertura de manejos individuais/coletivos e ressincronização (2ª IATF) para matrizes vazias.
- **Status**: `ALTO`

##### Erros e Bugs
1. **Reabertura/re-seleção em loop do modal de lote quando acessado via query string (`?lotId=` ou `?lot=`)** (`src/app/lots/page.tsx:L750-763`)
   - **Causa raiz**: O `useEffect` depende de `[lots]` e lê `window.location.search` sem limpar a URL nem marcar o parâmetro como já consumido em um `ref`.
   - **Impacto**: Sempre que `loadLots()` executa (após qualquer marcação de fase em `L700`/`L746`, edição, exclusão ou adição de animal), `lots` muda de referência e `handleSelectLot(lotIdParam)` é disparado novamente — reabrindo o modal mesmo após o usuário fechá-lo (`setSelectedLotId(null)`), tentando selecionar lotes recém-excluídos e resetando `lotAnimalSearch`, `focusedStepCode` e `phaseStatusFilter`.
2. **Marcar checkbox da etapa `DG`/`DG1` força `pregnancy_status: 'prenha'` para matrizes (inclusive "Todos")** (`src/app/lots/page.tsx:L674-688`, `L718-728`)
   - **Causa raiz**: Em `handleToggleAnimalStepCheck` e `handleToggleAllStepCheck`, marcar `DG`/`DG1` define otimisticamente `pregnancy_status: 'prenha'` e calcula `expected_parturition_date` (+295 dias); ao desmarcar, sobrescreve para `'pendente'`.
   - **Impacto**: Clicar em "Todos" na coluna `DG` marca 100% do lote como prenha; desmarcar apaga diagnósticos `'vazia'`. Distorce diretamente a taxa de prenhez e previsão de partos.
3. **Mutação otimista sem verificação de erro nem rollback em `toggleLotAnimalStepCheck`** (`src/app/lots/page.tsx:L690-700`, `L736-746`)
   - **Causa raiz**: O retorno `{ success }` de `toggleLotAnimalStepCheck` é ignorado e `loadLots()` não é aguardado (`await`).
   - **Impacto**: Em caso de falha na persistência (online ou offline), `stepChecks` e `lotAnimals` permanecem alterados na tela sem aviso de erro ou reversão.
4. **`handleCreateLot` falha silenciosamente sem feedback ao usuário** (`src/app/lots/page.tsx:L787-815`)
   - **Causa raiz**: Apenas o ramo `if (id)` é tratado; não há `else` para exibir toast de erro quando `createLot(...)` retorna `null`/`undefined`.
   - **Impacto**: Se a criação falhar (ex.: erro de rede, validação ou permissão), o botão para de girar e o modal permanece aberto sem qualquer explicação.
5. **Resolução frágil de `property_id` por comparação de nome (`property_name`) e fallback inseguro** (`src/app/lots/page.tsx:L849`, `L996`, `L1115-1116`)
   - **Causa raiz**: `handleQuickChuteAdd` (`L849`), `handleCreateAndAddQuick` (`L996`) e `handleExecuteResync` (`L1115`) procuram o retiro usando `properties.find((p) => p.name === currentLot?.property_name)` em vez de um `property_id` explícito. Em `L1115`, há fallback para `p.farm_id === selectedLot.farm_id` ou `properties[0]`, podendo enviar `property_id: ''` (`L1116`).
   - **Impacto**: Pode vincular matrizes novas ou o lote de ressincronização (2ª IA) ao retiro errado (ou a nenhum retiro) quando existem retiros homônimos ou renomeados.
6. **Risco de `Invalid Date` / `NaN` ao concatenar `'T00:00:00'` em datas já com timestamp** (`src/app/lots/page.tsx:L111`, `L185-186`)
   - **Causa raiz**: `new Date(lot.start_date + 'T00:00:00')` e `new Date(nextStep.date + 'T00:00:00')` assumem formato estrito `YYYY-MM-DD`. Se o banco/offline retornar ISO completo (`YYYY-MM-DDTHH:mm:ssZ`), gera `Invalid Date`, produzindo `NaN-NaN-NaN` (`L124`) e `em NaNd` (`L187`).
7. **Possível disparo duplicado no inline edit de código do lote (`Enter` + `onBlur`)** (`src/app/lots/page.tsx:L492-525`, `L1368-1378`, `L1688-1698`)
   - **Causa raiz**: Pressionar `Enter` chama `handleSaveLotCode`, que seta `savingLotId` (desabilitando o `<input>`), o que pode disparar `onBlur` antes de `setEditingLotId(null)` concluir, disparando uma segunda chamada concorrente a `updateLotCode`.
8. **Timer de toast sem cancelamento (`setTimeout` órfão)** (`src/app/lots/page.tsx:L452-455`)
   - **Causa raiz**: `showToast` agenda `setTimeout(() => setToast(null), 4500)` sem cancelar timers anteriores.
   - **Impacto**: Em lançamentos rápidos no tronco (`handleQuickChuteAdd`), toasts novos desaparecem prematuramente quando o timer do toast anterior expira.

##### Divergências
1. **Texto da interface diverge do filtro real de Estação de Monta (`activeSeasonId`)** (`src/app/lots/page.tsx:L1045-1057`, `L1294`; confirmado em `src/lib/db.ts:L327-414`)
   - O subtítulo exibe `${filteredLots.length} lotes da ${activeFarm?.name} na estação ${activeSeason?.name}` (`L1294`), porém nem `getLots` nem `filteredLots` filtram por `activeSeasonId`. Lotes de todas as estações (incluindo encerradas) são exibidos juntos.
2. **Status padrão offline (`'ativo'`) não mapeado em `STATUS_LABELS`** (`src/app/lots/page.tsx:L65-69`, `L1349` vs `src/lib/db.ts:L345, L380, L433`)
   - No modo offline, `getLots` retorna `status: 'ativo'` como fallback, mas `STATUS_LABELS` só contempla `concluido`, `em_andamento` e `planejado`, exibindo lotes ativos como `Planejado`.
3. **Regra de preservação do `D0` no modal de alteração de protocolo contradiz o campo editável** (`src/app/lots/page.tsx:L3123-3129`, `L3205-3211`, `L3241`)
   - Quando `hasCompletedD0` é `true`, o banner informa que o `D0` já realizado será mantido intacto e trava o `day_offset` da etapa `D0` (`L3241`), mas o input `Data D0 (Início do Protocolo)` (`L3205-3211`) não recebe `disabled={hasCompletedD0}`.
4. **Nome pessoal de veterinário hardcoded como fallback em ambiente multi-tenant** (`src/app/lots/page.tsx:L244`, `L612`, `L773`, `L800`, `L1099`, `L3221`, `L3456`)
   - O literal `'MV. DR. SAMOEL DUARTE'` é usado como valor padrão e condição de substituição (`L612`). Outras organizações sem veterinário cadastrado herdam esse nome indevidamente.
5. **Chamadas de `loadLots()` usam `forceRefresh = false`** (`src/app/lots/page.tsx:L563-566`)
   - Após operações de escrita, `loadLots()` recarrega com `getLots(false, ...)` e `getManagementEvents(false, ...)`, dependendo integralmente de invalidação manual de cache em cada função de `db.ts`.

##### Falta de Ligação nos Fluxos de Trabalho
1. **`handleOpenBatchManagement` faz fallback silencioso para `'D9'` em etapas não listadas** (`src/app/lots/page.tsx:L431-437`, `L1823`)
   - `validSteps` aceita apenas `['D0', 'D7', 'D8', 'D9', 'IA', 'DG']`. Protocolos com etapas como `DG1`, `DG2`, `D10` ou `D11` abrem silenciosamente o modal de manejo coletivo na etapa `D9` (retirada de implante) ao clicar no stepper do lote.
2. **Botão "Ação em Lote" na barra da tabela ignora a fase em foco** (`src/app/lots/page.tsx:L1995-1997`)
   - Chama `handleOpenBatchManagement('D9')` fixo, ignorando `activePhaseCode` (diferente do botão acima em `L1913`).
3. **Troca da fazenda ativa (`activeFarmId`) não reseta `selectedLotId`, `lotAnimals` e `stepChecks`** (`src/app/lots/page.tsx:L214`, `L219`, `L560-574`)
   - Se o usuário trocar de fazenda com a ficha do lote aberta, os estados auxiliares (`lotAnimals`, `stepChecks`, `selectedLotId`) permanecem residuais até nova seleção.
4. **Consulta desperdiçada em `loadAuxData`: `getFarms()` carregado e nunca utilizado** (`src/app/lots/page.tsx:L231`, `L580`, `L595`)
   - `const [, setFarms] = useState<Farm[]>([])` descarta o estado após buscá-lo a cada montagem/troca de fazenda.
5. **Imports no meio do arquivo** (`src/app/lots/page.tsx:L209-210`)
   - `useActiveFarm` e `useActiveSeason` estão importados após `computeLotProgress`, fora do bloco superior de imports.

##### Possíveis Brechas de Segurança
1. **Ausência de controle RBAC na interface para operações destrutivas e de escrita** (`src/app/lots/page.tsx:L461`, `L1031`, `L1417`, `L1756`)
   - Não há verificação de perfil/permissão do usuário antes de expor exclusão de lote (`deleteLot`), remoção de animal do lote (`removeAnimalFromLot`), alteração de protocolo ou marcação em massa. Toda proteção depende exclusivamente de RLS no Supabase (sem enforcement no modo offline/Dexie).
2. **Risco de associação cross-farm em `handleExecuteResync`, `handleQuickChuteAdd` e `handleCreateAndAddQuick`** (`src/app/lots/page.tsx:L849`, `L996`, `L1115`)
   - A busca de propriedade sem restringir `p.farm_id === farmId` (e o fallback `|| properties[0]` em `L1115`) pode vincular registros a propriedades de outra fazenda dentro da organização.
3. **Consumo direto de `lotId` da URL sem validação de formato ou escopo** (`src/app/lots/page.tsx:L753-756`)
   - `lotIdParam` é passado diretamente para `getLotAnimals(lotIdParam)` e `getLotAnimalStepChecks(lotIdParam)` sem validar se é UUID válido ou se pertence à lista de lotes autorizados da fazenda ativa (dependendo integralmente de RLS para evitar IDOR).
4. **Exposição de dado pessoal (nome do profissional) hardcoded no bundle cliente** (`src/app/lots/page.tsx:L244`, `L773`, `L800`, `L1099`, `L3221`, `L3456`).

---

#### 2. `src/app/registries/page.tsx`

- **Arquivo**: `src/app/registries/page.tsx` — 3.327 linhas analisadas
- **Papel no sistema**: Central de Cadastros Gerais com 6 abas (`Fazendas & Retiros`, `Estações de Monta`, `Matrizes & Fêmeas`, `Touros & Centrais`, `Raças & Categorias` e `Médicos Veterinários`), cobrindo listagem, filtros e operações de CRUD via modais.
- **Status**: `ALTO`

##### Erros e Bugs
1. **Edição de Retiro exibe seletor de Fazenda editável, mas descarta a alteração ao salvar** (`src/app/registries/page.tsx:L698-702`, `L3039-3049`; confirmado em `src/lib/db.ts:L6019-6025`)
   - **Causa raiz**: O `<select>` de `Fazenda Pertencente *` (`L3039`) permanece habilitado durante a edição (`editingPropertyId !== null`), porém `handleSaveProperty` envia apenas `{ name, code }` para `updateProperty`, e a função no `db.ts` nem aceita `farm_id`.
   - **Impacto**: A UI mostra "Retiro atualizado com sucesso!", mas a transferência do retiro para outra fazenda nunca ocorre.
2. **Trocar a Fazenda no modal de Matriz mantém `property_id` da fazenda anterior** (`src/app/registries/page.tsx:L2444-2468`)
   - **Causa raiz**: O `onChange` do `<select>` de fazenda (`L2447`) atualiza apenas `farm_id`, sem limpar `property_id`.
   - **Impacto**: Ao editar ou cadastrar uma matriz e alterar a fazenda, `animalForm.property_id` permanece com o UUID de um retiro da fazenda anterior (invisível na lista `availableProperties`), gravando uma inconsistência de integridade referencial (matriz na Fazenda B apontando para retiro da Fazenda A).
3. **Criação de Matriz ignora o campo `Status da Matriz` (`active`/`inactive`)** (`src/app/registries/page.tsx:L277-286`, `L2503-2512`; confirmado em `src/lib/db.ts:L2674-2683`)
   - **Causa raiz**: O campo `status` é renderizado no modal tanto na criação quanto na edição, mas `createAnimal` não recebe nem persiste `status`.
   - **Impacto**: Cadastrar uma matriz selecionando "Inativa / Descarte" salva silenciosamente como ativa.
4. **Abertura do `AnimalManagementModal` na aba Matrizes omite `a.farm_id`** (`src/app/registries/page.tsx:L80-87`, `L1318`)
   - **Causa raiz**: `handleOpenAnimalMgmt` recebe `farmId?` como 3º parâmetro, mas `L1318` chama `handleOpenAnimalMgmt(a.id, a.tag_number)` sem passar `a.farm_id`.
   - **Impacto**: Quando o usuário filtra "Todas as Fazendas" ou outra fazenda diferente da `activeFarmId`, o modal de manejo recebe o `farm_id` errado (`activeFarmId`), podendo gravar manejos na fazenda incorreta.
5. **`handleCreateBreed` e `handleCreateCategory` sem `trim()`, sem `saving` e com falha silenciosa** (`src/app/registries/page.tsx:L763-781`)
   - **Causa raiz**: Aceitam strings com apenas espaços (`if (!newBreedName) return;`), não bloqueiam múltiplos submits e não exibem erro se `createBreed`/`createAnimalCategory` retornarem `false`.
6. **`handleFreezeFarm` e `handleUnfreezeFarm` sem tratamento de erro nem estado de loading** (`src/app/registries/page.tsx:L745-761`)
   - **Causa raiz**: Se `freezeFarm` ou `unfreezeFarm` falhar (`ok === false`), não há toast de erro; também não usa `saving` para impedir cliques duplicados.
7. **Ausência de validação de intervalo de datas na Estação de Monta (`end_date < start_date`)** (`src/app/registries/page.tsx:L783-809`, `L3141-3158`)
   - **Causa raiz**: Valida apenas preenchimento obrigatório, permitindo salvar estações cuja data de término é anterior à data de início.
8. **Edição de Fazenda perde visualmente o RT se o valor salvo não existir na tabela `veterinarians`** (`src/app/registries/page.tsx:L2937-2949`)
   - **Causa raiz**: Diferente de `lots/page.tsx:L2904`, não há `<option>` fallback para `farmForm.technical_responsible` quando o valor atual não coincide com nenhum item de `veterinarians`. Ao salvar outra edição na fazenda, o RT legado pode ser perdido ou confundido.
9. **Timers de `feedbackMsg` sem cancelamento e erros sem botão de fechamento** (`src/app/registries/page.tsx:L301, L322, L348, L426, L643, L820, L1027-1042`)
   - **Causa raiz**: Múltiplos `setTimeout(() => setFeedbackMsg(null), 4000)` concorrentes podem apagar alertas recentes antes do tempo, enquanto mensagens de erro nunca são limpas automaticamente e não possuem botão para fechar.

##### Divergências
1. **Truncamento silencioso do rebanho em 1.000 matrizes** (`src/app/registries/page.tsx:L166`; confirmado em `src/lib/db.ts:L2231-2247`)
   - A página chama `getAnimals(1000, true)` sem paginação nem aviso de limite atingido, apesar de `getAnimalsPaginated` existir em `src/lib/db.ts`. Rebanhos acima de 1.000 fêmeas ficam incompletos na listagem e nos contadores (`Todas as Fazendas (${animals.length})`).
2. **Divergência offline na listagem e busca de Matrizes por Fazenda/Retiro** (`src/app/registries/page.tsx:L966-967`, `L1337-1338` vs `src/lib/db.ts:L2262-2263`)
   - No modo offline, `getAnimals` retorna `farms: null` e `properties: null`. A tabela exibe `'-'` nas colunas Fazenda e Retiro e a busca textual por nome de fazenda/retiro falha offline, mesmo com `farms` já carregado no componente e `a.farm_id`/`a.property_id` disponíveis.
3. **Relacionamento fraco (texto livre) entre Touro (`owner_central`) e Central (`GeneticCenter`)** (`src/app/registries/page.tsx:L130`, `L2727-2744`)
   - Touros armazenam o nome da central como string livre (`<datalist>`), sem chave estrangeira. Renomear ou excluir uma central não reflete nos touros já cadastrados.
4. **Dados pessoais hardcoded (`'MV. DR. SAMOEL DUARTE'` e `'CRMV-MT 1234'`)** (`src/app/registries/page.tsx:L636`, `L2279-2280`, `L2953`, `L3227`)
   - Ao resetar `farmForm` após salvar (`L636`) e ao clicar em "Cadastrar Primeiro Veterinário" (`L2279-2280`), pré-preenche dados pessoais fixos em ambiente multi-tenant.

##### Falta de Ligação nos Fluxos de Trabalho
1. **`loadAllData` recarrega todos os 7 conjuntos globais sempre que `activeFarmId` muda** (`src/app/registries/page.tsx:L162-211`)
   - `loadAllData` tem `activeFarmId` na lista de dependências, mas nenhuma das 7 chamadas (`getAnimals`, `getBulls`, `getFarms`, `getBreeds`, `getAnimalCategories`, `getVeterinarians`, `getGeneticCenters`) recebe `activeFarmId`. Trocar a fazenda ativa dispara 7 queries completas desnecessariamente apenas para atualizar o default de `animalForm`/`propertyForm`.
2. **Filtro `animalFarmFilter` não é resetado se a fazenda selecionada for excluída** (`src/app/registries/page.tsx:L649-666`)
   - Se o usuário excluir a fazenda atualmente selecionada em `animalFarmFilter`, o filtro continua apontando para o ID removido e exibe lista vazia na aba Matrizes.
3. **Raças e Categorias sem fluxo de edição ou exclusão** (`src/app/registries/page.tsx:L2047-2111`)
   - A aba permite apenas inserir novos itens, sem possibilidade de corrigir erros de digitação ou remover registros duplicados.
4. **Inconsistência de confirmação destrutiva (`window.confirm` vs modal customizado)** (`src/app/registries/page.tsx:L311, L433, L545, L650, L729, L746, L839, L926` vs `L2574-2638`)
   - Apenas matrizes com relações possuem modal de confirmação; todas as demais exclusões e congelamentos usam `confirm()` nativo do navegador.

##### Possíveis Brechas de Segurança
1. **Ausência de verificação de papel/permissão (RBAC) na UI para cadastros e exclusões críticas** (`src/app/registries/page.tsx:L309`, `L432`, `L544`, `L649`, `L728`, `L745`, `L838`, `L925`)
   - Qualquer usuário autenticado visualiza e pode acionar exclusão permanente de fazendas, retiros, matrizes (`force = true`), touros, centrais, estações e veterinários. A segurança depende exclusivamente de RLS no Supabase (sem proteção RBAC no modo offline/Dexie).
2. **Exclusão definitiva de matriz com histórico (`force = true`) em 1 clique sem confirmação reforçada** (`src/app/registries/page.tsx:L309-316`, `L2619-2627`)
   - Dentro do modal de exclusão com vínculos, clicar em "Excluir Definitivamente (Apaga todo o histórico)" executa imediatamente `deleteAnimal(a.id, true)` sem confirmação adicional, elevando o risco de perda irreversível de histórico reprodutivo por clique acidental.
3. **Corrupção de integridade cross-farm no vínculo de matrizes e manejos** (`src/app/registries/page.tsx:L1318`, `L2444-2468`)
   - Tanto a persistência de `property_id` de outra fazenda ao trocar `farm_id` no formulário (`L2447`) quanto a omissão de `a.farm_id` ao abrir o `AnimalManagementModal` (`L1318`) podem gravar associações incorretas entre fazendas distintas.
4. **Exposição de dados pessoais (nome e CRMV) hardcoded no código cliente** (`src/app/registries/page.tsx:L636`, `L2279-2280`).
