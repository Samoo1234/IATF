'use client';

import { useState, useEffect, useRef } from 'react';
import { 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  DownloadCloud, 
  FileDown, 
  CheckCircle2, 
  AlertTriangle,
  ChevronDown
} from 'lucide-react';
import { syncEngine, type SyncState } from '@/lib/offline/syncEngine';

interface SyncStatusBadgeProps {
  onOpenPrepModal?: () => void;
}

export default function SyncStatusBadge({ onOpenPrepModal }: SyncStatusBadgeProps) {
  const [syncState, setSyncState] = useState<SyncState>({
    isOnline: typeof window !== 'undefined' ? navigator.onLine : true,
    isSyncing: false,
    pendingCount: 0,
    lastSyncAt: null,
    lastError: null,
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = syncEngine.subscribe((state) => {
      setSyncState(state);
    });

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      unsubscribe();
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSyncNow = async () => {
    await syncEngine.syncNow();
  };

  const handleExportBackup = async () => {
    try {
      const backupJson = await syncEngine.exportBlackboxBackup();
      const blob = new Blob([backupJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `iatf-backup-curral-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Erro ao exportar backup:', err);
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition-all shadow-sm ${
          !syncState.isOnline
            ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20'
            : syncState.isSyncing
            ? 'bg-sky-500/10 border-sky-500/30 text-sky-400 hover:bg-sky-500/20'
            : syncState.pendingCount > 0
            ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20'
            : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white'
        }`}
        title={syncState.isOnline ? 'Online - Sincronizado' : 'Modo Curral (Offline)'}
      >
        {syncState.isSyncing ? (
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-400" />
        ) : !syncState.isOnline ? (
          <WifiOff className="w-3.5 h-3.5 text-amber-400" />
        ) : (
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
        )}

        <span className="hidden sm:inline font-mono">
          {!syncState.isOnline
            ? 'Curral (Offline)'
            : syncState.isSyncing
            ? 'Sincronizando...'
            : 'Online'}
        </span>

        {syncState.pendingCount > 0 && (
          <span className="px-1.5 py-0.2 text-[10px] font-black rounded-full bg-amber-500 text-slate-950">
            {syncState.pendingCount}
          </span>
        )}

        <ChevronDown className="w-3 h-3 text-slate-400 ml-0.5" />
      </button>

      {/* Popover Menu */}
      {menuOpen && (
        <div className="absolute right-0 mt-2 w-72 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-3 z-50 animate-in fade-in zoom-in-95 duration-150">
          {/* Header Status */}
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
              {syncState.isOnline ? (
                <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Wifi className="w-4 h-4" />
                </div>
              ) : (
                <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <WifiOff className="w-4 h-4" />
                </div>
              )}
              <div>
                <p className="text-xs font-bold text-white">
                  {syncState.isOnline ? 'Conexão Estabelecida' : 'Modo Curral Ativo'}
                </p>
                <p className="text-[10px] text-slate-400">
                  {syncState.isOnline ? 'Pronto para sincronização' : 'Trabalho offline local'}
                </p>
              </div>
            </div>

            {syncState.isOnline && (
              <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> OK
              </span>
            )}
          </div>

          {/* Info Rows */}
          <div className="space-y-1.5 text-[11px] text-slate-300 mb-3 px-1">
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Mutações pendentes:</span>
              <span className={`font-mono font-bold ${syncState.pendingCount > 0 ? 'text-amber-400' : 'text-slate-200'}`}>
                {syncState.pendingCount}
              </span>
            </div>
            {syncState.lastSyncAt && (
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Último sync:</span>
                <span className="font-mono text-[10px] text-slate-300">
                  {syncState.lastSyncAt.toLocaleTimeString('pt-BR')}
                </span>
              </div>
            )}
            {syncState.lastError && (
              <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] flex items-start gap-1.5 mt-1">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{syncState.lastError}</span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="space-y-1.5 pt-1 border-t border-slate-800">
            {/* Sync Now */}
            <button
              onClick={() => {
                handleSyncNow();
                setMenuOpen(false);
              }}
              disabled={syncState.isSyncing || !syncState.isOnline}
              className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-semibold text-white bg-slate-800/80 hover:bg-slate-700/80 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <span className="flex items-center gap-2">
                <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${syncState.isSyncing ? 'animate-spin' : ''}`} />
                Sincronizar Agora
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                {syncState.isSyncing ? 'Enviando...' : 'Enviar fila'}
              </span>
            </button>

            {/* Prepare for Curral */}
            {onOpenPrepModal && (
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onOpenPrepModal();
                }}
                className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-semibold text-emerald-300 bg-emerald-950/40 hover:bg-emerald-900/50 border border-emerald-500/20 transition-all"
              >
                <span className="flex items-center gap-2">
                  <DownloadCloud className="w-3.5 h-3.5 text-emerald-400" />
                  Preparar para o Curral
                </span>
                <span className="text-[10px] text-emerald-400/80 font-mono">
                  Baixar dados
                </span>
              </button>
            )}

            {/* Export Backup Log */}
            <button
              onClick={() => {
                handleExportBackup();
                setMenuOpen(false);
              }}
              className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-[11px] font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-all"
              title="Baixar cópia de segurança dos manejos do dia em JSON"
            >
              <span className="flex items-center gap-2">
                <FileDown className="w-3.5 h-3.5 text-slate-400" />
                Backup Local (Caixa-Preta)
              </span>
              <span className="text-[9px] text-slate-500 font-mono">JSON</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
