import ExcelJS from 'exceljs';

export async function exportRowsToExcel(
  rows: Array<Record<string, unknown>>,
  sheetName: string,
  fileName: string,
  colWidths?: number[]
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'IATF Master';
  workbook.created = new Date();

  const safeSheetName = sheetName.slice(0, 31).replace(/[\\/*?:[\]]/g, '_');
  const ws = workbook.addWorksheet(safeSheetName);

  if (rows.length > 0) {
    const keys = Object.keys(rows[0]);
    ws.columns = keys.map((key, idx) => ({
      header: key,
      key,
      width: colWidths?.[idx] || Math.max(14, Math.min(34, key.length + 6)),
    }));

    const headerRow = ws.getRow(1);
    headerRow.font = { name: 'Arial', size: 10, bold: true };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    for (const r of rows) {
      ws.addRow(r);
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);
}
