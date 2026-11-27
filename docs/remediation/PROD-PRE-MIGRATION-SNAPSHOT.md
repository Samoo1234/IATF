# Snapshot Pré-Migração — Produção (`skjllqqdhtbrwspwxgqe`)

- **Data:** `2026-11-27`
- **Contagem de registros antes das migrations `012`–`016`:**
  - `organizations`: `2`
  - `organization_members`: `2` (ambos `active`)
  - `farms`: `15`
  - `animals`: `1870`
  - `iatf_lots`: `45`
  - `iatf_lot_animals`: `1991`
  - `animal_managements`: `906`
  - `management_events`: `174`
  - `genetic_inventory_balances`: `76`
  - `genetic_inventory_movements`: `797`
  - `semen_batches`: `75`

- **Estado anterior das políticas RLS:**
  - 13 tabelas com política `{public} ALL USING (true) WITH CHECK (true)`: `animal_managements`, `veterinarians`, `genetic_audit_logs`, `genetic_centers`, `genetic_clients`, `genetic_inventory_balances`, `genetic_inventory_movements`, `genetic_material_batches`, `genetic_materials`, `genetic_withdrawal_receipts`, `semen_tank_canisters`, `semen_tanks`, `tank_nitrogen_measurements`.
  - `organization_members`: `tenant_org_members` permitindo `(organization_id IN (SELECT get_user_org_ids())) OR (user_id = auth.uid())`.
  - Demais tabelas com `tenant_*` apontando para `get_user_org_ids()`.
