# ESTRUTURA DE MÓDULOS E NAVEGAÇÃO — SISTEMA IATF

## 1. Visão Geral da Arquitetura de Módulos

A aplicação é dividida em módulos focados na operação de campo, gestão administrativa, controle de insumos e análise inteligente de desempenho.

```text
Sistema IATF SaaS
 ├── 1. Módulo Dashboard & Analytics (`/dashboard`)
 ├── 2. Módulo Agenda Operacional / Manejos (`/agenda`)
 ├── 3. Módulo Gestão de Lotes IATF (`/lots`)
 ├── 4. Módulo Ficha da Matriz / Animais (`/animals`)
 ├── 5. Módulo Cadastros & Insumos (`/registries` & `/inputs`)
 ├── 6. Módulo Protocolos Reprodutivos (`/protocols`)
 ├── 7. Módulo Relatórios & Exportação (`/reports`)
 └── 8. Módulo Importação Planilha Excel (`/import`)
```

---

## 2. Detalhamento dos Módulos

### 2.1. Dashboard Principal (`/dashboard`)
- **Objetivo**: Apresentar KPIs em tempo real e visão geral da estação reprodutiva.
- **Componentes**:
  - Cards de Resumo: Total de Matrizes Trabalhadas, Total de Lotes Ativos, Diagnósticos Realizados, Taxa de Prenhez Geral (`% (Prenhas/Diagnosticadas)`), Perdas de Implantes.
  - Gráficos Analíticos:
    - Prenhez por Lote (Gráfico de Barras)
    - Prenhez por Protocolo (Gráfico Comparativo)
    - Prenhez por Touro e por Inseminador (Ranking)
    - Impacto do ECC na Prenhez (Gráfico de Linha/Dispersão)

### 2.2. Agenda Operacional de Campo (`/agenda`)
- **Objetivo**: Guia prático para a equipe de campo e veterinário sobre as atividades do dia.
- **Exibição**:
  - Filtro por Data (Hoje, Próximos 7 dias, Atrasados).
  - Cards de Manejo com Status Visual:
    - 🟢 **Concluído** (Verde)
    - 🟡 **Próximo / Agendado** (Amarelo)
    - 🔴 **Atrasado / Pendente** (Vermelho)
  - Botão de Ação Rápida de Campo: Lançamento de Animais Trabalhados e Registro de Perdas em 2 cliques.

### 2.3. Gestor de Lotes IATF (`/lots`)
- **Objetivo**: Criação, configuração e acompanhamento de lotes de IATF.
- **Funcionalidades**:
  - Novo Lote: Seleção da Fazenda/Retiro, Protocolo, Data D0 e Veterinário Responsável.
  - Adição de Animais ao Lote (em massa ou por busca rápida de brincos).
  - Ficha do Lote: Lista de matrizes, touro atribuído, partida do sêmen, inseminador, ECC e resultado de DG.

### 2.4. Ficha Individual da Matriz (`/animals/[id]`)
- **Objetivo**: Ficha completa da fêmea bovina com histórico reprodutivo temporal.
- **Informações**:
  - Cabeçalho: Brinco, Raça, Categoria, Idade, Fazenda e Retiro Atual.
  - Situação Atual: Última IA, Último Touro, ECC Atual, Último DG e Previsão de Parto.
  - Timeline Reprodutiva: Histórico imutável de todas as estações e lotes que a matriz participou (ex: `2024 - Prenha`, `2025 - Vazia`, `2026 - Prenha`).

### 2.5. Gestor de Protocolos (`/protocols`)
- **Objetivo**: Cadastro de protocolos hormonais customizados.
- **Funcionalidades**:
  - Definição das Etapas (D0, D7, D9, IA, DG), dias de offset e dosagens dos medicamentos.
  - Associação de insumos (Benzoato, PGF2a, eCG, Cipionato, Implante P4).

### 2.6. Estoque de Sêmen e Insumos (`/inputs`)
- **Objetivo**: Gestão de palhetas de sêmen por touro/partida e descarte de dispositivos.
- **Funcionalidades**:
  - Entrada de partidas de sêmen com quantidade de palhetas.
  - Relatório de saldo atualizado em tempo real à medida que as IA são realizadas.

### 2.7. Importador da Planilha Excel (`/import`)
- **Objetivo**: Upload e migração histórica a partir da planilha `MODELO CONTROLE GERAL IATF 2025.xlsx`.
- **Fluxo**:
  1. Upload do arquivo `.xlsx`.
  2. Pré-visualização e mapeamento de colunas.
  3. Validação de duplicidades (animais/touros existentes).
  4. Execução da importação com relatório de erros e acertos.
