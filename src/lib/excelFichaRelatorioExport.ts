import ExcelJS from 'exceljs';
import { MASTER_CRIA_LOGO_BASE64 } from '@/components/masterCriaLogoBase64';
import { getTodayDateString } from '@/lib/dateUtils';

export interface ExportFichaParams {
  lotName: string;
  produtor: string;
  propriedade: string;
  dataFicha: string;
  horaInicio: string;
  horaTermino: string;
  observacoes: string;
  isMasterCria: boolean;
  iaPlannedDate: string;
  dgPlannedDate: string;
  animals: Array<{
    seq: number;
    tagNumber: string;
    category: string;
    property: string;
    bullName: string;
    breed: string;
    iaDate: string;
    diagnostico: string;
    dgDate: string;
    parturitionDate: string;
  }>;
  stats: {
    total: number;
    prenhas: number;
    vazias: number;
    taxa: number;
    porTouro: Record<string, { total: number; prenhas: number }>;
    porCategoria: Record<string, { total: number; prenhas: number }>;
  };
}

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  bottom: { style: 'thin' },
  right: { style: 'thin' },
};

function applyBorder(ws: ExcelJS.Worksheet, row: number, col: number) {
  const cell = ws.getCell(row, col);
  cell.border = thinBorder;
}

function applyRangeBorder(ws: ExcelJS.Worksheet, startRow: number, startCol: number, endRow: number, endCol: number) {
  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      applyBorder(ws, r, c);
    }
  }
}

export async function exportFichaRelatorioFinalExcel(params: ExportFichaParams) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'IATF Master';
  workbook.created = new Date();

  const ws = workbook.addWorksheet('Planilha3', {
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: 0.25,
        right: 0.25,
        top: 0.4,
        bottom: 0.4,
        header: 0.2,
        footer: 0.2,
      },
    },
    views: [{ showGridLines: true }],
  });

  // Configuração das 18 colunas exatas da Planilha original
  const colWidths = [
    5,    // A: Seq.
    2.5,  // B: Número fêmea (merged B..F)
    2,    // C
    6,    // D
    2,    // E
    5,    // F
    6,    // G: CATEGORIA (merged G..I)
    4,    // H
    6,    // I
    12,   // J: RETIRO
    2.5,  // K: TOURO (merged K..L)
    16,   // L
    8,    // M: RAÇA
    12,   // N: DATA I.A
    6,    // O: DIAGNÓSTICO (merged O..P)
    9,    // P
    13,   // Q: DATA D.G
    12,   // R: MÊS P.P
  ];

  colWidths.forEach((w, idx) => {
    ws.getColumn(idx + 1).width = w;
  });

  // Linhas 1 a 4
  ws.getRow(2).height = 24;

  // Título: Ficha Relatório Final. (mesclado I2..P2)
  ws.mergeCells('I2:P2');
  const titleCell = ws.getCell('I2');
  titleCell.value = 'Ficha Relatório Final.';
  titleCell.font = { name: 'Arial', size: 15, bold: true };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // Se for Master Cria, insere a imagem no topo esquerdo (A1..G3)
  if (params.isMasterCria && MASTER_CRIA_LOGO_BASE64) {
    try {
      const imageId = workbook.addImage({
        base64: MASTER_CRIA_LOGO_BASE64,
        extension: 'png',
      });
      ws.addImage(imageId, {
        tl: { col: 0.2, row: 0.2 },
        ext: { width: 150, height: 75 },
      });
    } catch (e) {
      console.warn('Não foi possível inserir imagem no Excel:', e);
    }
  }

  // Linha 5: Produtor e Propriedade (A5..R5)
  ws.getRow(5).height = 22;
  ws.mergeCells('A5:R5');
  const r5Cell = ws.getCell('A5');
  r5Cell.value = `Produtor:      ${params.produtor || 'Não informado'}                          - Propriedade: ${params.propriedade || 'Não informada'}`;
  r5Cell.font = { name: 'Arial', size: 9, bold: true };
  r5Cell.alignment = { horizontal: 'center', vertical: 'middle' };
  applyRangeBorder(ws, 5, 1, 5, 18);

  // Linha 6: Data, Hora início e Hora término
  ws.getRow(6).height = 20;
  ws.mergeCells('A6:L6');
  const a6 = ws.getCell('A6');
  a6.value = `Data:${params.dataFicha || ''}`;
  a6.font = { name: 'Arial', size: 9, bold: true };
  a6.alignment = { horizontal: 'left', vertical: 'middle' };

  ws.mergeCells('M6:O6');
  const m6 = ws.getCell('M6');
  m6.value = `Hora início: ${params.horaInicio || ''}`;
  m6.font = { name: 'Arial', size: 9, bold: true };
  m6.alignment = { horizontal: 'left', vertical: 'middle' };

  ws.mergeCells('P6:R6');
  const p6 = ws.getCell('P6');
  p6.value = `Hora término: ${params.horaTermino || ''}`;
  p6.font = { name: 'Arial', size: 9, bold: true };
  p6.alignment = { horizontal: 'left', vertical: 'middle' };

  applyRangeBorder(ws, 6, 1, 6, 18);

  // Linha 7: Observações (mesclada de A7:R7 com wrapText para nunca truncar texto longo)
  ws.getRow(7).height = 28;
  ws.mergeCells('A7:R7');
  const a7 = ws.getCell('A7');
  a7.value = `Observações: ${params.observacoes || ''}`;
  a7.font = { name: 'Arial', size: 9, bold: true };
  a7.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
  applyRangeBorder(ws, 7, 1, 7, 18);

  // Linha 8: Linha vazia delimitadora (A8..R8)
  ws.getRow(8).height = 14;
  ws.mergeCells('A8:R8');
  applyRangeBorder(ws, 8, 1, 8, 18);

  // Linha 9: Vazia
  ws.getRow(9).height = 10;

  // Linha 10: Cabeçalho das 10 Colunas
  ws.getRow(10).height = 24;

  const colHeaders: Array<{ text: string; merge?: string; col: number; align?: 'center' | 'left' | 'right' }> = [
    { text: 'Seq.', col: 1, align: 'center' },
    { text: 'Número da fêmea', merge: 'B10:F10', col: 2, align: 'center' },
    { text: 'CATEGORIA ', merge: 'G10:I10', col: 7, align: 'center' },
    { text: 'RETIRO', col: 10, align: 'center' },
    { text: 'TOURO', merge: 'K10:L10', col: 11, align: 'center' },
    { text: 'RAÇA', col: 13, align: 'center' },
    { text: 'DATA I.A', col: 14, align: 'center' },
    { text: 'DIAGNÓSTICO', merge: 'O10:P10', col: 15, align: 'center' },
    { text: 'DATA D.G', col: 17, align: 'center' },
    { text: 'MÊS P.P', col: 18, align: 'center' },
  ];

  colHeaders.forEach((h) => {
    if (h.merge) {
      ws.mergeCells(h.merge);
    }
    const c = ws.getCell(10, h.col);
    c.value = h.text;
    c.font = { name: 'Arial', size: 9, bold: true };
    c.alignment = { horizontal: h.align || 'center', vertical: 'middle' };
  });
  applyRangeBorder(ws, 10, 1, 10, 18);

  // Linhas de Animais (a partir da linha 11)
  params.animals.forEach((a, idx) => {
    const rowNum = 11 + idx;
    ws.getRow(rowNum).height = 20;

    // Mesclagens por linha exatamente como a planilha
    ws.mergeCells(`B${rowNum}:F${rowNum}`);
    ws.mergeCells(`G${rowNum}:I${rowNum}`);
    ws.mergeCells(`K${rowNum}:L${rowNum}`);
    ws.mergeCells(`O${rowNum}:P${rowNum}`);

    // Seq (A)
    const cA = ws.getCell(rowNum, 1);
    cA.value = a.seq;
    cA.alignment = { horizontal: 'center', vertical: 'middle' };

    // Número da fêmea (B..F)
    const cB = ws.getCell(rowNum, 2);
    cB.value = a.tagNumber || 'SN';
    cB.alignment = { horizontal: 'center', vertical: 'middle' };

    // Categoria (G..I)
    const cG = ws.getCell(rowNum, 7);
    cG.value = (a.category || 'MULTÍPARA').toUpperCase();
    cG.alignment = { horizontal: 'center', vertical: 'middle' };

    // Retiro (J)
    const cJ = ws.getCell(rowNum, 10);
    cJ.value = (a.property || 'SEDE').toUpperCase();
    cJ.alignment = { horizontal: 'center', vertical: 'middle' };

    // Touro (K..L)
    const cK = ws.getCell(rowNum, 11);
    cK.value = a.bullName || 'Rep. Touro';
    cK.alignment = { horizontal: 'center', vertical: 'middle' };

    // Raça (M)
    const cM = ws.getCell(rowNum, 13);
    cM.value = (a.breed || 'N.E').toUpperCase();
    cM.alignment = { horizontal: 'center', vertical: 'middle' };

    // Data IA (N)
    const cN = ws.getCell(rowNum, 14);
    cN.value = a.iaDate || '-';
    cN.alignment = { horizontal: 'center', vertical: 'middle' };

    // Diagnóstico (O..P)
    const cO = ws.getCell(rowNum, 15);
    cO.value = a.diagnostico;
    cO.alignment = { horizontal: 'center', vertical: 'middle' };
    if (a.diagnostico.includes('PRENHA')) {
      cO.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF047857' } }; // Verde escuro
    } else {
      cO.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFBE123C' } }; // Rose/Vermelho
    }

    // Data DG (Q)
    const cQ = ws.getCell(rowNum, 17);
    cQ.value = a.dgDate || '-';
    cQ.alignment = { horizontal: 'center', vertical: 'middle' };

    // Mês PP (R)
    const cR = ws.getCell(rowNum, 18);
    cR.value = a.parturitionDate || '';
    cR.alignment = { horizontal: 'center', vertical: 'middle' };

    // Formatação de fonte para todas as células da linha
    for (let c = 1; c <= 18; c++) {
      const cell = ws.getCell(rowNum, c);
      if (!cell.font) {
        cell.font = { name: 'Arial', size: 9, bold: true };
      }
    }

    applyRangeBorder(ws, rowNum, 1, rowNum, 18);
  });

  // Aba 2: Resumo Estatístico Zootécnico
  const wsResumo = workbook.addWorksheet('Resumo_Estatistico');
  wsResumo.columns = [
    { header: 'Indicador / Grupo', key: 'indicador', width: 32 },
    { header: 'Total Doses / Fêmeas', key: 'total', width: 22 },
    { header: 'Prenhas Confirmadas', key: 'prenhas', width: 22 },
    { header: 'Taxa de Prenhez (%)', key: 'taxa', width: 20 },
  ];

  wsResumo.getRow(1).font = { name: 'Arial', size: 10, bold: true };
  wsResumo.getRow(1).alignment = { horizontal: 'center' };

  wsResumo.addRow({
    indicador: `Lote: ${params.lotName}`,
    total: params.stats.total,
    prenhas: params.stats.prenhas,
    taxa: `${params.stats.taxa.toFixed(2)}%`,
  });

  wsResumo.addRow({});
  wsResumo.addRow({ indicador: 'DESEMPENHO POR TOURO' });
  wsResumo.getRow(wsResumo.rowCount).font = { bold: true };

  Object.entries(params.stats.porTouro).forEach(([touro, d]) => {
    wsResumo.addRow({
      indicador: touro,
      total: d.total,
      prenhas: d.prenhas,
      taxa: d.total > 0 ? `${((d.prenhas / d.total) * 100).toFixed(2)}%` : '0.00%',
    });
  });

  wsResumo.addRow({});
  wsResumo.addRow({ indicador: 'DESEMPENHO POR CATEGORIA' });
  wsResumo.getRow(wsResumo.rowCount).font = { bold: true };

  Object.entries(params.stats.porCategoria).forEach(([cat, d]) => {
    wsResumo.addRow({
      indicador: cat,
      total: d.total,
      prenhas: d.prenhas,
      taxa: d.total > 0 ? `${((d.prenhas / d.total) * 100).toFixed(2)}%` : '0.00%',
    });
  });

  // Geração do buffer e download direto no navegador
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `Ficha_Relatorio_Final_${params.lotName}_${getTodayDateString()}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);
}
