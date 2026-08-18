# FÓRMULAS E MÉTRICAS REPRODUTIVAS — CALCULATIONS.md

## 1. Visão Geral

Este documento detalha todas as fórmulas matemáticas e estatísticas utilizadas no sistema para calcular os indicadores de desempenho da estação reprodutiva.

---

## 2. Métricas Reprodutivas Principais

### 2.1. Taxa de Prenhez do Lote ($\text{TP}_{\text{lote}}$)
$$\text{TP}_{\text{lote}} = \left( \frac{\text{Quantidade de Matrizes Prenhas}}{\text{Quantidade de Matrizes Diagnosticadas}} \right) \times 100$$
- **Regra de Exibição**: `59,1% (68 / 115)`

### 2.2. Previsão de Parto
$$\text{Data de Previsão de Parto} = \text{Data da IA} + 295 \text{ dias}$$
- Aplicado apenas para matrizes com `pregnancy_status = 'prenha'`.

### 2.3. Taxa de Perda de Dispositivos P4 ($\text{TPD}$)
$$\text{TPD} = \left( \frac{\text{Quantidade de Dispositivos Perdidos/Caídos}}{\text{Quantidade de Animais Trabalhados}} \right) \times 100$$

### 2.4. Taxa de Prenhez por Touro ($\text{TP}_{\text{touro}}$)
$$\text{TP}_{\text{touro}} = \left( \frac{\text{Matrizes Prenhas com o Touro } X}{\text{Total de Inseminações Realizadas com o Touro } X} \right) \times 100$$

### 2.5. Taxa de Prenhez por Inseminador ($\text{TP}_{\text{inseminador}}$)
$$\text{TP}_{\text{inseminador}} = \left( \frac{\text{Matrizes Prenhas Inseminadas por } Y}{\text{Total de Inseminações Realizadas por } Y} \right) \times 100$$

### 2.6. Distribuição de Prenhez por Faixa de ECC
Para cada faixa de ECC ($<2.50$, $2.50-2.74$, $2.75-2.99$, $3.00-3.24$, $\ge 3.25$):
$$\text{TP}_{\text{faixa}} = \left( \frac{\text{Matrizes Prenhas na Faixa } F}{\text{Matrizes Diagnosticadas na Faixa } F} \right) \times 100$$
