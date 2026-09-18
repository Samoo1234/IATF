'use client';

import { useState, useEffect } from 'react';
import { 
  DownloadCloud, 
  X, 
  CheckCircle2, 
  Building2, 
  Calendar, 
  Sparkles,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import { syncEngine } from '@/lib/offline/syncEngine';
import { useActiveFarm } from '@/context/FarmContext';
import { useActiveSeason } from '@/context/SeasonContext';
import { getLots, type LotStat } from '@/lib/db';

interface CurralPrepModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CurralPrepModal({ isOpen, onClose }: CurralPrepModalProps) {
  const { activeFarmId, activeFarm } = useActiveFarm();
  const { activeSeason, activeSeasonId } = useActiveSeason();

  const [lots, setLots] = useState<LotStat[]>([]);
  const [selectedLotIds, setSelectedLotIds] = useState<string[]>([]);
  const [downloadAll, setDownloadAll] = useState(true);
  const [isLoadingLots, setIsLoadingLots] = useState(false);

  // Download state
  const [isDownloading, setIsDownloading] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressStep, setProgressStep] = useState('');
  const [downloadResult, setDownloadResult] = useState<{
    animalsCount: number;
    lotsCount: number;
    batchesCount: number;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !activeFarmId) return;

    let mounted = true;
    async function loadFarmLots() {
      setIsLoadingLots(true);
      try {
        const loadedLots = await getLots(false, activeFarmId!);
        if (!mounted) return;
        setLots(loadedLots);
        setSelectedLotIds(loadedLots.map((l) => l.id));
      } catch (err) {
        console.error('Erro ao carregar lotes para o curral:', err);
      } finally {
        if (mounted) setIsLoadingLots(false);
      }
    }

    loadFarmLots();
    return () => {
      mounted = false;
    };
  }, [isOpen, activeFarmId]);

  if (!isOpen) return null;

  const handleStartDownload = async () => {
    if (!activeFarmId) return;

    setIsDownloading(true);
    setErrorMsg(null);
    setProgressPercent(5);
    setProgressStep('Iniciando preparação...');

    try {
      const targetLotIds = downloadAll ? undefined : selectedLotIds;
      const result = await syncEngine.downloadFarmDataForCurral(
        activeFarmId,
        activeSeasonId || undefined,
        targetLotIds,
        (p) => {
          setProgressPercent(p.percent);
          setProgressStep(p.step);
        }
      );

      setDownloadResult(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao baixar dados do servidor';
      setErrorMsg(msg);
    } finally {
      setIsDownloading(false);
    }
  };

  const toggleLotSelection = (lotId: string) => {
    if (selectedLotIds.includes(lotId)) {
      setSelectedLotIds(selectedLotIds.filter((id) => id !== lotId));
    } else {
      setSelectedLotIds([...selectedLotIds, lotId]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 overflow-hidden">
        {/* Glow Effect */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shadow-sm">
              <DownloadCloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-white">Preparar para o Curral</h3>
              <p className="text-xs text-slate-400">
                Baixar dados no celular/tablet para operar 100% offline
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isDownloading}
            className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-all disabled:opacity-30"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        {!downloadResult ? (
          <div className="space-y-4 py-4">
            {/* Farm & Season Banner */}
            <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-emerald-400" />
                  Propriedade:
                </span>
                <span className="font-bold text-white">{activeFarm?.name || 'Fazenda Principal'}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-sky-400" />
                  Estação Reprodutiva:
                </span>
                <span className="font-bold text-white">{activeSeason?.name || 'Vigente'}</span>
              </div>
            </div>

            {/* Selection Options */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-slate-300">
                  Lotes para o Manejo de Hoje:
                </label>
                <button
                  type="button"
                  onClick={() => setDownloadAll(!downloadAll)}
                  className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300"
                >
                  {downloadAll ? 'Selecionar lotes manualmente' : 'Baixar todos os lotes'}
                </button>
              </div>

              {downloadAll ? (
                <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/20 text-xs text-emerald-300 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Todos os lotes ativos ({lots.length}) e suas matrizes serão cacheados.</span>
                </div>
              ) : (
                <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                  {isLoadingLots ? (
                    <p className="text-xs text-slate-500 py-3 text-center">Carregando lotes...</p>
                  ) : lots.length === 0 ? (
                    <p className="text-xs text-slate-500 py-3 text-center">Nenhum lote cadastrado.</p>
                  ) : (
                    lots.map((lot) => {
                      const isSelected = selectedLotIds.includes(lot.id);
                      return (
                        <div
                          key={lot.id}
                          onClick={() => toggleLotSelection(lot.id)}
                          className={`flex items-center justify-between p-2 rounded-xl border text-xs cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-white'
                              : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}}
                              className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-0"
                            />
                            <span className="font-bold font-mono">{lot.code}</span>
                            <span className="truncate max-w-[160px]">{lot.protocol_name || 'Lote IATF'}</span>
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {lot.worked_qty || 0} animais
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* Checklist of what will be offline */}
            <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-1 text-[11px] text-slate-400">
              <p className="font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                Disponível 100% no Curral:
              </p>
              <div className="grid grid-cols-2 gap-1 text-[10px]">
                <span className="flex items-center gap-1">✓ Fichas de Matrizes</span>
                <span className="flex items-center gap-1">✓ Baixa de Sêmen/Botijão</span>
                <span className="flex items-center gap-1">✓ Manejos D0, D9, IA, DG</span>
                <span className="flex items-center gap-1">✓ Protocolos Hormonais</span>
              </div>
            </div>

            {/* Progress Bar (During download) */}
            {isDownloading && (
              <div className="space-y-2 pt-1">
                <div className="flex justify-between text-xs text-slate-300">
                  <span className="font-medium">{progressStep}</span>
                  <span className="font-mono font-bold text-emerald-400">{progressPercent}%</span>
                </div>
                <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full transition-all duration-300 ease-out rounded-full shadow-sm"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            )}

            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Download Action Button */}
            <button
              onClick={handleStartDownload}
              disabled={isDownloading || (!downloadAll && selectedLotIds.length === 0)}
              className="w-full py-3 px-4 rounded-2xl font-bold text-sm text-slate-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
            >
              <DownloadCloud className="w-4 h-4" />
              {isDownloading ? 'Baixando e Preparando Base...' : 'Baixar Dados para o Curral'}
            </button>
          </div>
        ) : (
          /* Success Screen */
          <div className="py-6 text-center space-y-4 animate-in zoom-in-95 duration-200">
            <div className="w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 mx-auto flex items-center justify-center shadow-lg shadow-emerald-500/10">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div>
              <h4 className="text-lg font-black text-white">Base Local Pronta!</h4>
              <p className="text-xs text-slate-400 max-w-xs mx-auto mt-1">
                Todos os dados foram gravados no dispositivo. Você pode ir para o curral e trabalhar sem conexão à internet.
              </p>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-3 gap-2 p-3 rounded-2xl bg-slate-950 border border-slate-800 text-xs">
              <div className="p-2 rounded-xl bg-slate-900/50">
                <p className="text-lg font-mono font-black text-emerald-400">{downloadResult.animalsCount}</p>
                <p className="text-[10px] text-slate-400 font-medium">Matrizes</p>
              </div>
              <div className="p-2 rounded-xl bg-slate-900/50">
                <p className="text-lg font-mono font-black text-sky-400">{downloadResult.lotsCount}</p>
                <p className="text-[10px] text-slate-400 font-medium">Lotes IATF</p>
              </div>
              <div className="p-2 rounded-xl bg-slate-900/50">
                <p className="text-lg font-mono font-black text-amber-400">{downloadResult.batchesCount}</p>
                <p className="text-[10px] text-slate-400 font-medium">Partidas Sêmen</p>
              </div>
            </div>

            <button
              onClick={() => {
                setDownloadResult(null);
                onClose();
              }}
              className="w-full py-3 px-4 rounded-2xl font-bold text-sm text-slate-950 bg-emerald-400 hover:bg-emerald-300 transition-all shadow-lg shadow-emerald-500/20"
            >
              Pronto para o Campo!
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
