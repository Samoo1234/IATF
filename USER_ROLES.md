# MATRIZ DE PERFIS E PERMISSÕES DE USUÁRIOS (RBAC)

## 1. Perfis do Sistema (`Roles`)

O sistema define 7 perfis operacionais para garantir o controle de acesso e auditoria das ações de campo:

1. **Administrador (`admin`)**: Gestão total da organização, membros, configurações e faturamento.
2. **Gestor (`manager`)**: Acesso a todas as fazendas da organização, relatórios, lotes e estoque.
3. **Veterinário (`vet`)**: Responsável técnico pelo planejamento de protocolos, lotes, liberação de manejos e diagnósticos de gestação (DG).
4. **Técnico (`tech`)**: Executa manejos no campo, registra animais trabalhados e perdas de insumos.
5. **Inseminador (`inseminator`)**: Registra as inseminações (matriz, touro, sêmen, ECC).
6. **Operador (`operator`)**: Auxilia no manejo de curral e digitação rápida.
7. **Visualizador (`viewer`)**: Acesso somente leitura para proprietários ou consultores externos.

---

## 2. Matriz de Permissões por Funcionalidade

| Funcionalidade / Ação | Admin | Gestor | Vet | Técnico | Inseminador | Operador | Visualizador |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Gerenciar Organização / Usuários** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Cadastrar Fazendas / Propriedades** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Cadastrar Animais / Touros** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Cadastrar / Editar Protocolos** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Criar e Iniciar Lote IATF** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Lançar Manejos de Campo (Agenda)** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Lançar Inseminações (IA)** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Lançar Diagnósticos de Gestação (DG)**| ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Lançar Perdas de Insumos / Implantes**| ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Visualizar Dashboard e Indicadores** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Exportar Relatórios (PDF/Excel)** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| **Importar Planilha Excel Historica** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
