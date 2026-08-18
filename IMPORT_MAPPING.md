# MAPEAMENTO DE IMPORTAÇÃO — PLANILHA EXCEL MODELO CONTROLE GERAL IATF 2025

## 1. Visão Geral

Este documento define as regras de de-para entre as abas da planilha `MODELO CONTROLE GERAL IATF 2025.xlsx` e o modelo de banco de dados relacional normalizado.

---

## 2. Mapeamento de Abas e Tabelas

| Aba da Planilha Excel | Entidade do Banco de Dados | Colunas Mapeadas |
| :--- | :--- | :--- |
| **`INICIO`** | `organizations`, `farms` | `FAZENDA:` -> `farms.name`<br>`PROPRIETÁRIO:` -> `farms.owner_name`<br>`RESPONSÁVEL TÉCNICO:` -> `farms.technical_responsible`<br>`ESTAÇÃO:` -> `reproductive_seasons.name` |
| **`CONTROLE LOTE`** | `iatf_lots` | `LOTE` -> `iatf_lots.code`<br>`FAZENDA` -> `farms.name`<br>`PROPRIEDADE` -> `properties.name`<br>`PROTOCOLO` -> `protocols.name`<br>`DATA D0` -> `iatf_lots.start_date`<br>`QTD TRABALHADA` -> `actual_quantity`<br>`PRENHAS` -> `pregnancies_count`<br>`VAZIAS` -> `empty_count` |
| **`CONTROLE HORARIO`** | `management_events` | `LOTE` -> `iatf_lots.code`<br>`MANEJO` -> `step_code`<br>`DATA` -> `execution_date`<br>`HORÁRIO INÍCIO` -> `start_time`<br>`HORÁRIO FIM` -> `end_time`<br>`ANIMAIS TRABALHADOS` -> `animals_worked_count`<br>`RESPONSÁVEL` -> `responsible_name` |
| **`CONTROLE PROTOCOLO`** | `protocols`, `protocol_steps` | `PROTOCOLO` -> `protocols.name`<br>`ETAPA` -> `protocol_steps.code`<br>`DIA OFFSET` -> `protocol_steps.day_offset`<br>`MEDICAMENTO / DISPOSITIVO` -> `protocol_steps.name`<br>`DOSE / INSTRUÇÃO` -> `dosage_instruction` |
| **`CONTROLE SEMEN`** | `bulls`, `semen_batches` | `TOURO` -> `bulls.name`<br>`RAÇA` -> `breeds.name`<br>`CENTRAL` -> `semen_batches.supplier_central`<br>`PARTIDA / BATCH` -> `semen_batches.batch_number`<br>`QTD PALHETAS COMPRADAS` -> `initial_quantity`<br>`QTD USADA` -> `used_quantity`<br>`PERDAS` -> `lost_quantity` |
| **`Lote 01` .. `Lote 07`** | `animals`, `iatf_lot_animals` | `BRINCO MATRIZ` -> `animals.tag_number`<br>`CATEGORIA` -> `animal_categories.name`<br>`RAÇA` -> `breeds.name`<br>`ECC IA` -> `iatf_lot_animals.ecc_ia`<br>`TOURO` -> `bulls.name`<br>`SÊMEN` -> `semen_batches.batch_number`<br>`INSEMINADOR` -> `inseminator_name`<br>`DIAGNÓSTICO DG` -> `pregnancy_status`<br>`ECC DG` -> `ecc_dg`<br>`PREVISÃO PARTO` -> `expected_parturition_date` |

---

## 3. Pipeline de Validação Pré-Importação

```text
[ Arquivo Excel .xlsx ]
         │
         ▼
[ 1. Leitura & Extração (openpyxl / xlsx) ]
         │
         ▼
[ 2. Sanitização de Nomes e Trimming de Espaços ]
         │
         ▼
[ 3. Validação de Duplicidades ]
    ├── Brincos Duplicados no Mesmo Lote
    ├── Touros / Partidas Não Encontradas
    └── Datas Inválidas / Formatos de Hora Inconsistentes
         │
         ▼
[ 4. Tela de Pré-Visualização com Alertas para o Usuário ]
         │
         ▼
[ 5. Execução Transactional (Commit ou Rollback Total) ]
```
