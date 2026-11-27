'use client';

import { useState, useRef } from 'react';
import ExcelJS from 'exceljs';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Database,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useActiveFarm } from '@/context/FarmContext';
import {
  createAnimal,
  getAnimalCategories,
  getBreeds,
  getProperties,
} from '@/lib/db';

interface ParsedAnimalRow {
  rowNumber: number;
  tagNumber: string;
  categoryName: string;
  breedName: string;
  propertyName: string;
  notes: string;
  valid: boolean;
  error?: string;
}

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export default function ImportPage() {
  const { activeFarmId, activeFarm } = useActiveFarm();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [fileName, setFileName] = useState<string>('');
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [rows, setRows] = useState<ParsedAnimalRow[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{
    imported: number;
    skipped: number;
    errors: string[];
  } | null>(null);

  const isFarmFrozen = activeFarm?.status === 'frozen';

  const parseWorksheet = (worksheet: ExcelJS.Worksheet): ParsedAnimalRow[] => {
    let headerRowIdx = -1;
    let colTag = -1;
    let colCategory = -1;
    let colBreed = -1;
    let colProperty = -1;
    let colNotes = -1;

    const maxScan = Math.min(worksheet.rowCount, 20);
    for (let r = 1; r <= maxScan; r++) {
      const row = worksheet.getRow(r);
      const values = row.values as unknown[];
      if (!Array.isArray(values)) continue;

      for (let c = 1; c < values.length; c++) {
        const h = normalizeHeader(values[c]);
        if (!h) continue;
        if (
          colTag === -1 &&
          (h.includes('brinco') || h.includes('numero da femea') || h === 'tag' || h === 'animal' || h === 'identificacao')
        ) {
          colTag = c;
          headerRowIdx = r;
        } else if (colCategory === -1 && h.includes('categoria')) {
          colCategory = c;
        } else if (colBreed === -1 && (h.includes('raca') || h.includes('breed'))) {
          colBreed = c;
        } else if (colProperty === -1 && (h.includes('retiro') || h.includes('propriedade') || h.includes('pasto'))) {
          colProperty = c;
        } else if (colNotes === -1 && (h.includes('obs') || h.includes('nota'))) {
          colNotes = c;
        }
      }
      if (headerRowIdx !== -1) break;
    }

    if (headerRowIdx === -1 || colTag === -1) {
      throw new Error(
        'Não foi possível localizar a coluna de identificação do animal (ex: "Brinco" ou "Número da fêmea") nas primeiras 20 linhas da aba.'
      );
    }

    const parsed: ParsedAnimalRow[] = [];
    const seenTags = new Set<string>();

    for (let r = headerRowIdx + 1; r <= worksheet.rowCount; r++) {
      const row = worksheet.getRow(r);
      const rawTag = String(row.getCell(colTag).text || row.getCell(colTag).value || '').trim();
      if (!rawTag) continue;

      const upperTag = rawTag.toUpperCase();
      const isDuplicate = seenTags.has(upperTag);
      seenTags.add(upperTag);

      const categoryName =
        colCategory > 0 ? String(row.getCell(colCategory).text || row.getCell(colCategory).value || '').trim() : '';
      const breedName =
        colBreed > 0 ? String(row.getCell(colBreed).text || row.getCell(colBreed).value || '').trim() : '';
      const propertyName =
        colProperty > 0 ? String(row.getCell(colProperty).text || row.getCell(colProperty).value || '').trim() : '';
      const notes =
        colNotes > 0 ? String(row.getCell(colNotes).text || row.getCell(colNotes).value || '').trim() : '';

      parsed.push({
        rowNumber: r,
        tagNumber: rawTag,
        categoryName,
        breedName,
        propertyName,
        notes,
        valid: !isDuplicate && rawTag.length > 0,
        error: isDuplicate ? 'Brinco duplicado na planilha' : undefined,
      });
    }

    return parsed;
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg(null);
    setImportResult(null);
    setRows([]);
    setFileName(file.name);
    setIsParsing(true);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);

      const names = workbook.worksheets.map((ws) => ws.name);
      if (names.length === 0) {
        throw new Error('A planilha não contém nenhuma aba legível.');
      }

      setSheetNames(names);
      const firstSheet = workbook.worksheets[0];
      setSelectedSheet(firstSheet.name);
      const parsed = parseWorksheet(firstSheet);
      setRows(parsed);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao ler o arquivo Excel (.xlsx).');
    } finally {
      setIsParsing(false);
    }
  };

  const handleImport = async () => {
    if (!activeFarmId) {
      setErrorMsg('Selecione uma fazenda ativa antes de importar.');
      return;
    }
    if (isFarmFrozen) {
      setErrorMsg('Esta fazenda está congelada e não permite novos cadastros.');
      return;
    }

    const validRows = rows.filter((r) => r.valid);
    if (validRows.length === 0) {
      setErrorMsg('Nenhuma linha válida para importar.');
      return;
    }

    setIsImporting(true);
    setErrorMsg(null);
    setImportResult(null);

    try {
      const [categories, breeds, properties] = await Promise.all([
        getAnimalCategories(),
        getBreeds(),
        getProperties(false, activeFarmId),
      ]);

      const catMap = new Map(categories.map((c) => [normalizeHeader(c.name), c.id]));
      const breedMap = new Map(breeds.map((b) => [normalizeHeader(b.name), b.id]));
      const propMap = new Map(properties.map((p) => [normalizeHeader(p.name), p.id]));

      let imported = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (const item of validRows) {
        try {
          const res = await createAnimal({
            farm_id: activeFarmId,
            tag_number: item.tagNumber,
            category_id: catMap.get(normalizeHeader(item.categoryName)) || undefined,
            breed_id: breedMap.get(normalizeHeader(item.breedName)) || undefined,
            property_id: propMap.get(normalizeHeader(item.propertyName)) || undefined,
            reproductive_status: 'vazia',
          });

          if (res.success) {
            imported++;
          } else {
            skipped++;
            errors.push(`Linha ${item.rowNumber} (${item.tagNumber}): ${res.error || 'falha ao cadastrar'}`);
          }
        } catch (err) {
          skipped++;
          errors.push(`Linha ${item.rowNumber} (${item.tagNumber}): ${err instanceof Error ? err.message : 'erro desconhecido'}`);
        }
      }

      setImportResult({ imported, skipped, errors });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Falha ao executar importação.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleReset = () => {
    setFileName('');
    setSheetNames([]);
    setSelectedSheet('');
    setRows([]);
    setErrorMsg(null);
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const validCount = rows.filter((r) => r.valid).length;
  const invalidCount = rows.length - validCount;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/80 p-6 rounded-2xl border border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Upload className="w-6 h-6 text-emerald-400" />
            Importador de Matrizes (Excel .xlsx)
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Carregue uma planilha <span className="text-emerald-400 font-semibold font-mono">.xlsx</span> com colunas como{' '}
            <span className="font-mono text-slate-200">Brinco / Número da fêmea</span>,{' '}
            <span className="font-mono text-slate-200">Categoria</span>,{' '}
            <span className="font-mono text-slate-200">Raça</span> e{' '}
            <span className="font-mono text-slate-200">Retiro</span> para importar diretamente na fazenda ativa ({activeFarm?.name || 'nenhuma selecionada'}).
          </p>
        </div>
        {fileName && (
          <button
            onClick={handleReset}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold inline-flex items-center gap-2 self-start sm:self-auto"
          >
            <Trash2 className="w-4 h-4" /> Limpar
          </button>
        )}
      </div>

      {isFarmFrozen && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          A fazenda ativa está congelada. Descongele-a em Cadastros para habilitar importações.
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {errorMsg}
        </div>
      )}

      <div className="glass-card p-8 rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center mx-auto">
          <FileSpreadsheet className="w-8 h-8" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-white">
            {fileName ? fileName : 'Selecione uma planilha Excel (.xlsx)'}
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            {sheetNames.length > 0
              ? `Aba analisada: ${selectedSheet} (${rows.length} registros lidos)`
              : 'O processamento e a pré-visualização ocorrem localmente antes de gravar no banco.'}
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx"
          onChange={handleFileSelected}
          className="hidden"
          id="excel-import-input"
        />
        <label
          htmlFor="excel-import-input"
          className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-6 py-3 rounded-xl transition-all shadow-lg text-sm inline-flex items-center gap-2 cursor-pointer"
        >
          {isParsing ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" /> Lendo Planilha...
            </>
          ) : (
            <>
              <Upload className="w-4 h-4" /> Escolher Arquivo .xlsx
            </>
          )}
        </label>
      </div>

      {rows.length > 0 && (
        <div className="space-y-4">
          <div className="glass-card p-6 rounded-2xl border border-slate-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Database className="w-5 h-5 text-emerald-400" />
                Pré-visualização ({validCount} válidos • {invalidCount} ignorados)
              </h3>
              <button
                onClick={handleImport}
                disabled={isImporting || validCount === 0 || isFarmFrozen || !activeFarmId}
                className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-xs inline-flex items-center gap-2 cursor-pointer"
              >
                {isImporting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Importando...
                  </>
                ) : (
                  <>Importar {validCount} Matrizes</>
                )}
              </button>
            </div>

            <div className="overflow-x-auto max-h-80 border border-slate-800 rounded-xl">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 text-[10px] uppercase text-slate-400 sticky top-0">
                  <tr>
                    <th className="p-2.5">Linha</th>
                    <th className="p-2.5">Brinco</th>
                    <th className="p-2.5">Categoria</th>
                    <th className="p-2.5">Raça</th>
                    <th className="p-2.5">Retiro</th>
                    <th className="p-2.5">Validação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {rows.slice(0, 100).map((r) => (
                    <tr key={`${r.rowNumber}-${r.tagNumber}`} className="hover:bg-slate-900/60">
                      <td className="p-2.5 font-mono text-slate-500">{r.rowNumber}</td>
                      <td className="p-2.5 font-mono font-bold text-white">{r.tagNumber}</td>
                      <td className="p-2.5">{r.categoryName || '-'}</td>
                      <td className="p-2.5">{r.breedName || '-'}</td>
                      <td className="p-2.5">{r.propertyName || '-'}</td>
                      <td className="p-2.5">
                        {r.valid ? (
                          <span className="text-emerald-400 font-semibold">OK</span>
                        ) : (
                          <span className="text-rose-400 font-semibold">{r.error}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > 100 && (
              <p className="text-[11px] text-slate-500">
                Exibindo as primeiras 100 linhas de {rows.length} registros lidos.
              </p>
            )}
          </div>

          {importResult && (
            <div className="glass-card p-5 rounded-2xl border border-emerald-500/30 bg-emerald-950/15 space-y-2">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                <CheckCircle2 className="w-5 h-5" />
                Importação finalizada: {importResult.imported} cadastrada(s), {importResult.skipped} ignorada(s).
              </div>
              {importResult.errors.length > 0 && (
                <ul className="text-xs text-rose-300 list-disc pl-5 space-y-1 max-h-32 overflow-y-auto">
                  {importResult.errors.slice(0, 20).map((e, idx) => (
                    <li key={idx}>{e}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
