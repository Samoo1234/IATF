# REGRAS DE NEGÓCIO — SISTEMA DE GESTÃO IATF

## 1. Visão Geral

Este documento define as regras operacionais, lógicas de validação e restrições de integridade derivadas da planilha `MODELO CONTROLE GERAL IATF 2025.xlsx` e das boas práticas de reprodução animal bovina.

---

## 2. Regras de Cadastro e Validação

### RN-01: Identificação Única de Matrizes
- O número de brinco (`tag_number`) da matriz deve ser **único dentro da mesma propriedade/fazenda** da organização.
- Não é permitido cadastrar duas matrizes ativas com o mesmo brinco na mesma fazenda.

### RN-02: Isolamento Multi-Tenant
- Todo registro criado deve receber o `organization_id` da sessão do usuário logado.
- É estritamente proibido que um usuário veja ou modifique registros de outra organização.

### RN-03: Categorização Obrigatória
- Toda matriz deve possuir uma categoria reprodutiva:
  - **Novilha**: Fêmea jovem que nunca pariu.
  - **Primípara**: Fêmea de 1º parto.
  - **Secundípara**: Fêmea de 2º parto.
  - **Multípara**: Fêmea de 3 ou mais partos.

---

## 3. Regras de Protocolo e Agendamento

### RN-04: Derivação de Datas dos Manejos
A partir da data inicial do lote (`Data D0`), as datas operacionais devem ser automaticamente calculadas somando o `day_offset` de cada etapa do protocolo:
- **D0**: Data Início (Offset: +0 dias)
- **D7**: Data D0 + 7 dias
- **D9**: Data D0 + 9 dias
- **IA (Inseminação)**: Data D0 + 11 dias (Inseminar 48h a 54h após D9)
- **DG (Diagnóstico de Gestação)**: Data D0 + 44 dias (30 a 35 dias após a IA)

### RN-05: Ajuste de Fuso Horário
- Todas as datas de manejos de campo e relatórios operacionais devem considerar o fuso horário da fazenda (padrão: `America/Cuiaba` - UTC-4).

---

## 4. Regras Reprodutivas e Inseminação

### RN-06: Previsão de Parto
- Sempre que uma matriz receber o diagnóstico de **Prenha** (`pregnancy_status = 'prenha'`), o sistema deve calcular a previsão de parto utilizando o período gestacional médio bovino de **295 dias**:
  $$\text{Previsão de Parto} = \text{Data da IA} + 295 \text{ dias}$$
- Se a matriz for diagnosticada como **Vazia**, a previsão de parto deve ser formatada como nula ou hífen (`-`).

### RN-07: Faixas de Escore de Condição Corporal (ECC)
O ECC da matriz deve ser avaliado no momento da IA e no DG na escala clássica de 1 a 5 (com precisão decimal):
- **Faixa 1**: $< 2,50$ (Condição Crítica / Magra)
- **Faixa 2**: $2,50 \text{ a } 2,74$ (Condição Regular -)
- **Faixa 3**: $2,75 \text{ a } 2,99$ (Condição Regular +)
- **Faixa 4**: $3,00 \text{ a } 3,24$ (Condição Boa)
- **Faixa 5**: $\ge 3,25$ (Condição Excelente / Gorda)

---

## 5. Regras de Estoque e Perdas de Insumos

### RN-08: Baixa Automática de Sêmen
- A realização de cada Inseminação Artificial deve abater 1 palheta da partida de sêmen selecionada (`semen_batches`).
- Tentativa de inseminação com partida de sêmen sem saldo suficiente deve emitir alerta no sistema.

### RN-09: Registro de Perdas de Dispositivos e Insumos
- Dispositivos de progesterona (P4) caídos, perdidos no pasto ou danificados durante o manejo devem ser obrigatoriamente lançados como perda (`input_losses`), permitindo calcular a taxa de perda do lote e o ranking de eficiência por responsável.

---

## 6. Regras de Cálculo e Indicadores (KPIs)

### RN-10: Exibição Transparente de Índices (Absoluto + Percentual)
Fórmulas e exibição de percentuais devem **SEMPRE** vir acompanhadas dos valores numéricos brutos:
$$\text{Taxa de Prenhez} = \frac{\text{Quantidade de Prenhas}}{\text{Animais Diagnosticados}} \times 100$$
- **Formatação Visual Obrigatória**: Exibir `57,4% (512 / 892)` ao invés de apenas `57,4%`.

### RN-11: Imutabilidade de Registros Históricos
- Alterações em diagnósticos de gestação concluídos ou dados de inseminações passadas geram logs automáticos na tabela `audit_logs`.
