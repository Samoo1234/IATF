# Fase 0 — Preservação e Preparação (`00-PREPARATION.md`)

**Projeto:** `iatf-app` (`IATF Master`) — `f:\IATF`  
**Data:** `2026-11-22`  
**Protocolo:** Fase 0 (Primeira Execução) — Preservação e Preparação sem alterações em código-fonte, dependências, migrations ou banco remoto.

---

## 1. Estado do Repositório e Baseline

- **Diretório raiz:** `f:\IATF`
- **Repositório remoto:** `https://github.com/Samoo1234/IATF.git` (`origin`)
- **Branch original preservada:** `main` — mantida intacta no commit auditado `fbbd6516892b10a766e28946782745d4bb3723da` (`fbbd651`).
- **Branch local de remediação:** `remediation/iatf-master-audit` (criada localmente a partir de `main@fbbd651`, sem `commit` nem `push`).
- **Estado do working tree:** Nenhum arquivo rastreado em `src/`, `public/`, `supabase/`, `package.json` ou `.env*` foi alterado. Apenas arquivos documentais não rastreados foram gerados (`AUDIT-FINAL.md` e `docs/remediation/`).

---

## 2. Confirmação de Leitura e Revalidação do `AUDIT-FINAL.md`

- Foi realizada leitura integral do relatório oficial [AUDIT-FINAL.md](file:///f:/IATF/AUDIT-FINAL.md) (linhas 1–657).
- Comparação com o estado atual do repositório e do ambiente Supabase remoto `"IATF"`:
  - O HEAD do projeto permanece exatamente no commit auditado (`fbbd651`).
  - Nenhuma alteração de código ou migration foi aplicada desde a auditoria.
  - **Resultado da revalidação:** Todos os **21 achados (`AUD-001` a `AUD-021`) continuam confirmados e abertos**; **0 achados** foram corrigidos anteriormente; nenhuma divergência entre `AUDIT-FINAL.md` e o estado atual foi encontrada.

---

## 3. Inventário de Dependências e Segurança (`package.json` vs `package-lock.json`)

Confirmado via [package.json](file:///f:/IATF/package.json) e `package-lock.json`:

### Dependências de Produção
| Pacote | Range (`package.json`) | Versão efetiva (`package-lock.json`) | Observação |
|---|---|---|---|
| `next` | `^15.1.7` | `15.5.23` | **1 Critical** no `npm audit` (+ transitivas `postcss`, `sharp`) |
| `react` | `^19.0.0` | `19.2.8` | — |
| `react-dom` | `^19.0.0` | `19.2.8` | — |
| `@supabase/supabase-js` | `^2.49.1` | `2.112.3` | — |
| `@supabase/ssr` | `^0.5.2` | `0.5.2` | — |
| `dexie` | `^4.4.6` | `4.4.6` | IndexedDB offline (`IATF_Master_Offline_DB` v5) |
| `lucide-react` | `^0.475.0` | `0.475.0` | — |
| `recharts` | `^2.15.1` | `2.15.4` | — |
| `clsx` | `^2.1.1` | `2.1.1` | — |
| `tailwind-merge` | `^3.0.1` | `3.6.0` | — |
| `xlsx` | `^0.18.5` | `0.18.5` | **High** (Prototype Pollution + ReDoS — *No fix available*) |

### Dependências de Desenvolvimento
| Pacote | Range (`package.json`) | Versão efetiva (`package-lock.json`) | Observação |
|---|---|---|---|
| `typescript` | `^5.7.3` | `5.9.3` | — |
| `tailwindcss` | `^4.0.6` | `4.3.3` | — |
| `@tailwindcss/postcss` | `^4.0.6` | `4.3.3` | — |
| `postcss` | `^8.5.2` | `8.5.26` | Transitivo/directo no `npm audit` |
| `eslint` | `^9` | `9.39.5` | — |
| `eslint-config-next` | `^15.1.7` | `15.5.23` | `next lint` com aviso de depreciação |
| `@eslint/eslintrc` | `^3` | `3.3.6` | — |
| `@types/node` | `^22.13.1` | `22.20.1` | — |
| `@types/react` | `^19.0.8` | `19.2.18` | — |
| `@types/react-dom` | `^19.0.3` | `19.2.4` | — |

- **Resumo `npm audit`:** `AUDIT_EXIT=1` — **13 vulnerabilidades** (`1` Critical em `next`, `6` High em `xlsx`, `postcss`, `sharp`, `source-map-js`, `js-yaml`, `brace-expansion`, e `6` Moderate em `minimatch` e `@typescript-eslint/*`).

---

## 4. Cobertura de Testes e Lacunas

- **Testes automatizados existentes:** **0 arquivos** (`0` unitários, `0` integração, `0` contrato, `0` E2E, `0` segurança).
- **CI/CD:** **0 workflows** configurados no repositório.
- **Verificações disponíveis hoje:** Apenas `npx tsc --noEmit` (`PASS`) e `npm run lint` (`PASS` com 2 warnings `react-hooks/exhaustive-deps`). `npm run build` não foi executado em modo read-only para preservar `.next/`.
- **Lacunas críticas:** Ausência de cobertura automatizada para RLS/RBAC multi-tenant, RPCs do livro razão genético, fluxos `executeStepIA`/`executeBatchLotManagementIA` e sincronização offline→online (`SyncEngine`).

---

## 5. Mapa de Dependências entre Lotes e Achados

```text
[Gate 0: Staging Isolado + Baseline Schema-Only (AUD-011 parcial) + Seed Sintético]
   │
   ├──► [Lote 0 — Segurança: AUD-001, AUD-002, AUD-003, AUD-005, AUD-014]
   │       │
   │       ├──► [Lote 1 — Deps & Sessão: AUD-004, AUD-012, AUD-017]
   │       │
   │       └──► [Lote 2 — Integridade & Domínio: AUD-006, AUD-007, AUD-009, AUD-010, AUD-015]
   │               │
   │               └──► [Lote 3 — Modo Curral Offline: AUD-008]
   │                       │
   │                       └──► [Lote 4 — Governança, Performance & UX: AUD-011, AUD-013, AUD-016, AUD-018, AUD-019, AUD-020, AUD-021]
```

- **`AUD-011` (extração schema-only read-only do live)** funciona como pré-requisito operacional para montar um staging fiel ao banco atual (devido ao drift entre `supabase/migrations/` e o live).
- **`AUD-001`, `AUD-002`, `AUD-003` e `AUD-005` (Lote 0)** devem preceder **`AUD-009`** (onboarding/equipe) e **`AUD-012`** (sessão/logout/offline).
- **`AUD-006`, `AUD-007` e `AUD-010` (Lote 2)** precedem **`AUD-008` (Lote 3)** porque o `SyncEngine` offline precisa alinhar-se às RPCs e chaves idempotentes corrigidas no Lote 2.

---

## 6. Achados que Exigem Investigação Adicional (Somente Leitura) Antes de Sua Implementação

1. **`AUD-006` (Lote 2):** Inspecionar `executeBatchLotManagementD0`, `executeBatchLotManagementD9` e `executeBatchLotManagementDG` em [db.ts](file:///f:/IATF/src/lib/db.ts) para verificar se replicam o mesmo padrão de inserção sem colunas `NOT NULL` ou ausência de checagem `{ error }` observado em `executeBatchLotManagementIA`.
2. **`AUD-007` (Lote 2):** Produzir diagnóstico read-only detalhado das **4 partidas negativas** (`-511`, `-52`, `-5`, `-1`), da diferença líquida de **405 doses** entre `semen_batches` (`3.454`) e `genetic_inventory_balances` (`3.859`) e das movimentações associadas, elaborando proposta de reconciliação por registro antes de qualquer alteração.
3. **`AUD-015` (Lote 2):** Investigar via SQL read-only a origem dos **2 `management_events` órfãos** (`lot_id IS NULL AND farm_id IS NULL`), dos **2 códigos de lote duplicados** e identificar quais fazendas ativas devem receber a flag explícita `is_genetic_hub`.
4. **`AUD-011` (Pré-requisito de Staging / Lote 4):** Extrair o DDL schema-only completo do banco `"IATF"` (tabelas, constraints, índices, triggers, funções, views e políticas atuais) para reconstruir o ambiente de staging sem copiar dados reais.
5. **`AUD-004` (Lote 1):** Avaliar impacto de compatibilidade ao atualizar `next@15.5.23` (React `19.2.8` / Tailwind `4.3.3` / ESLint `9`) e mapear os 3 pontos de uso de `xlsx@0.18.5` ([reports/page.tsx](file:///f:/IATF/src/app/reports/page.tsx), [ReportsView.tsx](file:///f:/IATF/src/components/genetic-inventory/ReportsView.tsx) e [geneticInventoryService.ts](file:///f:/IATF/src/lib/services/geneticInventoryService.ts)) para substituição segura.

---

## 7. Estratégia Inicial de Backup, Recuperação e Rollback (Gate 0)

- **Evidência atual:** `get_organization` no Supabase MCP retornou `Forbidden`, impedindo verificar o plano de assinatura e a política de backups/PITR configurada no projeto `"IATF"`.
- **Controles obrigatórios antes de qualquer promoção futura para produção:**
  1. Confirmar no painel Supabase a existência de backup diário / Point-in-Time Recovery (PITR) ativo e realizar snapshot manual antes da janela de aplicação.
  2. Exportar backup schema-only (`pg_dump --schema-only`) e guardar a definição original de cada view, política RLS, trigger e função SQL em `docs/remediation/ROLLBACK-PLAN.md` antes de alterá-los.
  3. Validar toda migration e seu respectivo script de rollback primeiro no ambiente **staging** isolado.
  4. **Nunca** aplicar correções destrutivas (`DROP`, `DELETE`, `TRUNCATE`, resets ou ajuste automático de saldos) para mascarar inconsistências históricas.

---

## 8. Plano Detalhado do Lote 0 — Contenção Emergencial de Segurança

**Achados cobertos:** `AUD-001`, `AUD-002`, `AUD-003`, `AUD-005`, `AUD-014`.  
**Pré-requisito bloqueante (Gate 0):** Staging isolado disponível + seed sintético + aprovações do usuário listadas na Seção 12 da resposta.

1. **Passo L0.1 — Montagem do Staging e Seed Sintético:**
   - Aplicar baseline DDL schema-only no staging e popular apenas dados sintéticos: `Org Alpha`, `Org Beta`, fazendas/botijões/lotes fictícios e 6 contas `@example.test` (`admin_a`, `veterinarian_a`, `operator_a`, `viewer_a`, `inactive_a`, `admin_b`).
2. **Passo L0.2 — Contenção e Fluxo Seguro de Equipe (`AUD-001`):**
   - Migration no staging revogando `EXECUTE` de `PUBLIC`, `anon` e `authenticated` na RPC `create_team_member_user` e removendo escrita direta em `auth.users`/`auth.identities` por RPC pública.
   - Criar Route Handlers Next.js server-side (`/api/team/members` e `/api/team/members/[id]`) utilizando [server.ts](file:///f:/IATF/src/lib/supabase/server.ts) para autenticar o usuário via sessão/cookies, validar papel `admin` ativo na organização e acionar `supabase.auth.admin.createUser()` com `SUPABASE_SERVICE_ROLE_KEY` estritamente no servidor (proibindo redefinição de senha de usuários já existentes).
   - Atualizar [db.ts](file:///f:/IATF/src/lib/db.ts#L8546-L8596) e [team/page.tsx](file:///f:/IATF/src/app/team/page.tsx) para consumir os Route Handlers.
3. **Passo L0.3 — Isolamento de `organization_members` e Revisão de `/login` (`AUD-002`):**
   - Substituir `tenant_org_members` por políticas separadas por operação (`SELECT`: membros ativos da própria org ou próprio registro via `(SELECT auth.uid())`; `INSERT`/`UPDATE`/`DELETE`: restritos a `admin` ativo daquela `organization_id`, removendo `OR user_id = auth.uid()` do `WITH CHECK`).
   - Ajustar [login/page.tsx](file:///f:/IATF/src/app/login/page.tsx) conforme decisão aprovada pelo usuário para auto-cadastro.
4. **Passo L0.4 — RBAC no Banco e Backend/UI + Bloqueio de Inativos (`AUD-005`):**
   - Atualizar `public.get_user_org_ids()` para filtrar `AND status = 'active'` e fixar `SET search_path`.
   - Criar `public.has_org_role(p_org_id uuid, p_roles text[])` (`SECURITY DEFINER`, `STABLE`, `SET search_path = public, pg_temp`) após confirmação da matriz de papéis com o usuário.
   - Aplicar políticas diferenciadas por papel (`viewer` somente leitura; `operator` sem ações administrativas/exclusão destrutiva; ações clínicas/genéticas conforme matriz aprovada) e sincronizar inativação com revogação/banimento no Auth via rota server-side.
   - Remover badge hardcoded `"Admin"` em [Sidebar.tsx](file:///f:/IATF/src/components/Sidebar.tsx#L301) e refletir permissões reais na UI.
5. **Passo L0.5 — RLS das 13 Tabelas, Views Invoker e RPCs `SECURITY DEFINER` (`AUD-003`):**
   - Substituir as 13 políticas `*_dev_policy` / `"Dev full access..."` (`animal_managements`, `veterinarians`, `genetic_centers`, `genetic_clients`, `semen_tanks`, `semen_tank_canisters`, `tank_nitrogen_measurements`, `genetic_materials`, `genetic_material_batches`, `genetic_inventory_movements`, `genetic_inventory_balances`, `genetic_withdrawal_receipts`, `genetic_audit_logs`) por políticas `TO authenticated` compatíveis com o domínio de cada tabela.
   - Executar `ALTER VIEW public.lot_stats SET (security_invoker = true);` e `ALTER VIEW public.organization_metrics SET (security_invoker = true);` revogando `SELECT` de `anon`.
   - Revogar `EXECUTE` de `PUBLIC` e `anon` nas 12 demais RPCs `SECURITY DEFINER` (`fn_process_genetic_*`, `fn_record_nitrogen_measurement`, `freeze_farm`, `unfreeze_farm`, etc.) e adicionar dentro de cada função validação explícita de `auth.uid()`, pertinência ativa a `p_organization_id`, papel autorizado e pertinência de `p_farm_id`/`p_tank_id`/`p_movement_id` ao tenant.
6. **Passo L0.6 — Hardening (`AUD-014`):**
   - Fixar `SET search_path` nas 14 funções em `public`.
   - Revogar `TRUNCATE`, `TRIGGER`, `REFERENCES` de `anon` e `authenticated`, além de privilégios desnecessários de `anon`, nas 29 tabelas e 2 views.
   - Configurar headers HTTP de segurança em [next.config.mjs](file:///f:/IATF/next.config.mjs).
   - Ativar *Leaked Password Protection* no painel Supabase Auth (no staging e posteriormente em produção).
7. **Passo L0.7 — Bateria de 9 Testes Obrigatórios do Lote 0 (Staging):**
   1. Usuário anônimo (`anon`) não consegue criar administrador nem ler tabelas/views/RPCs protegidas.
   2. Usuário autenticado (`operator`/`veterinarian`) não consegue elevar o próprio papel nem inserir a si mesmo em outra org.
   3. Organização A não consegue consultar ou alterar dados da Organização B (tabelas, views e RPCs).
   4. Usuário com `status = 'inactive'` não consegue ler nem gravar dados.
   5. Papel `viewer` não consegue executar operações de escrita.
   6. Papel `operator` não consegue executar operações administrativas.
   7. RPCs protegidas rejeitam chamadas sem autorização ou cross-tenant.
   8. Views `lot_stats` e `organization_metrics` respeitam o isolamento multi-tenant do chamador.
   9. `get_advisors(security)` em staging não apresenta alertas críticos não resolvidos.
