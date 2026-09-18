'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { 
  getManagementEvents, 
  completeManagementEvent, 
  insertManagementEvent, 
  deleteManagementEvent, 
  getLots, 
  type ManagementEvent, 
  type LotStat 
} from '@/lib/db';
import { useActiveFarm } from '@/context/FarmContext';
import { 
  CheckCircle2, 
  RefreshCw, 
  X, 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Trash2, 
  Search,
  Calendar,
  Layers,
  Clock,
  User,
  Building2,
  Syringe,
  Microscope,
  Check
} from 'lucide-react';

const STEP_COLORS: Record<string, { bg: string; text: string; border: string; label: string; badge: string }> = {
  'D0': { bg: 'bg-sky-500/15 hover:bg-sky-500/25', text: 'text-sky-400', border: 'border-sky-500/40', label: 'D0 - Implante / Início', badge: 'bg-sky-500 text-slate-950' },
  'D7': { bg: 'bg-indigo-500/15 hover:bg-indigo-500/25', text: 'text-indigo-400', border: 'border-indigo-500/40', label: 'D7 - Retirada PGF', badge: 'bg-indigo-500 text-white' },
  'D8': { bg: 'bg-purple-500/15 hover:bg-purple-500/25', text: 'text-purple-400', border: 'border-purple-500/40', label: 'D8 - Retirada / Indutor', badge: 'bg-purple-500 text-white' },
  'D9': { bg: 'bg-fuchsia-500/15 hover:bg-fuchsia-500/25', text: 'text-fuchsia-400', border: 'border-fuchsia-500/40', label: 'D9 - Retirada / Indutor', badge: 'bg-fuchsia-500 text-white' },
  'IA': { bg: 'bg-emerald-500/15 hover:bg-emerald-500/25', text: 'text-emerald-400', border: 'border-emerald-500/40', label: 'IA - Inseminação Artificial', badge: 'bg-emerald-500 text-slate-950' },
  'DG': { bg: 'bg-amber-500/15 hover:bg-amber-500/25', text: 'text-amber-400', border: 'border-amber-500/40', label: 'DG - Diagnóstico Gestação', badge: 'bg-amber-500 text-slate-950' },
  'DG1': { bg: 'bg-amber-500/15 hover:bg-amber-500/25', text: 'text-amber-400', border: 'border-amber-500/40', label: 'DG 1 - Diagnóstico Precoce', badge: 'bg-amber-500 text-slate-950' },
  'DG2': { bg: 'bg-orange-500/15 hover:bg-orange-500/25', text: 'text-orange-400', border: 'border-orange-500/40', label: 'DG 2 - Confirmação', badge: 'bg-orange-500 text-slate-950' },
  'VAC': { bg: 'bg-rose-500/15 hover:bg-rose-500/25', text: 'text-rose-400', border: 'border-rose-500/40', label: 'Vacinação / Sanitário', badge: 'bg-rose-500 text-white' },
  'PES': { bg: 'bg-teal-500/15 hover:bg-teal-500/25', text: 'text-teal-400', border: 'border-teal-500/40', label: 'Pesagem / Avaliação', badge: 'bg-teal-500 text-slate-950' },
  'OUTRO': { bg: 'bg-slate-500/15 hover:bg-slate-500/25', text: 'text-slate-300', border: 'border-slate-500/40', label: 'Outro Manejo Operacional', badge: 'bg-slate-400 text-slate-950' },
};

const FARM_COLOR_PALETTES = [
  { text: 'text-emerald-300', bg: 'bg-emerald-500/15', border: 'border-emerald-500/30' },
  { text: 'text-amber-300', bg: 'bg-amber-500/15', border: 'border-amber-500/30' },
  { text: 'text-cyan-300', bg: 'bg-cyan-500/15', border: 'border-cyan-500/30' },
  { text: 'text-purple-300', bg: 'bg-purple-500/15', border: 'border-purple-500/30' },
  { text: 'text-rose-300', bg: 'bg-rose-500/15', border: 'border-rose-500/30' },
  { text: 'text-blue-300', bg: 'bg-blue-500/15', border: 'border-blue-500/30' },
];

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const WEEKDAY_NAMES_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export default function AgendaPage() {
  const { farms } = useActiveFarm();
  const [events, setEvents] = useState<ManagementEvent[]>([]);
  const [lots, setLots] = useState<LotStat[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtro de Fazenda: 'all' = Integrada (Todas as Fazendas)
  const [selectedFarmId, setSelectedFarmId] = useState<string>('all');
  
  // Date State - Foco exclusivo no Mês
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  
  // Filtros rápidos
  const [filterStep, setFilterStep] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pendente' | 'concluido'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modais
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createDate, setCreateDate] = useState(new Date().toISOString().split('T')[0]);
  const [createTime, setCreateTime] = useState('08:00');
  const [createLotId, setCreateLotId] = useState('');
  const [createStepCode, setCreateStepCode] = useState('D0');
  const [createResponsible, setCreateResponsible] = useState('Equipe de Campo');
  const [createNotes, setCreateNotes] = useState('');
  const [creating, setCreating] = useState(false);

  // Modal Ver/Concluir Manejo
  const [selectedEvent, setSelectedEvent] = useState<ManagementEvent | null>(null);
  const [completing, setCompleting] = useState(false);
  const [animalsWorked, setAnimalsWorked] = useState('');
  const [lossesCount, setLossesCount] = useState('0');
  
  // Toast feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Carregar dados de todas as fazendas ou da fazenda selecionada
  const loadData = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    try {
      const targetFarm = selectedFarmId === 'all' ? undefined : selectedFarmId;
      const [eventsData, lotsData] = await Promise.all([
        getManagementEvents(forceRefresh, targetFarm),
        getLots(forceRefresh, targetFarm)
      ]);
      setEvents(eventsData);
      setLots(lotsData);
      if (lotsData.length > 0 && !createLotId) {
        setCreateLotId(lotsData[0].id);
      }
    } catch (err) {
      console.error('Erro ao carregar dados da agenda integrada:', err);
      showToast('Falha ao carregar eventos da agenda.');
    } finally {
      setLoading(false);
    }
  }, [selectedFarmId, createLotId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Capturar parâmetros da URL quando o veterinário vem da tela de Lotes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const dateParam = params.get('date');
    const lotParam = params.get('lot');

    if (dateParam) {
      const parsedDate = new Date(dateParam + 'T00:00:00');
      if (!isNaN(parsedDate.getTime())) {
        setCurrentDate(parsedDate);
      }
    }

    if (lotParam) {
      setSearchQuery(lotParam);
    }
  }, []);

  // Mapear cores para cada fazenda
  const farmColorMap = useMemo(() => {
    const map = new Map<string, { text: string; bg: string; border: string }>();
    farms.forEach((f, idx) => {
      map.set(f.id, FARM_COLOR_PALETTES[idx % FARM_COLOR_PALETTES.length]);
    });
    return map;
  }, [farms]);

  // Navegação de Mês
  const goToday = () => setCurrentDate(new Date());
  
  const goPrevMonth = () => {
    const d = new Date(currentDate);
    d.setMonth(d.getMonth() - 1);
    setCurrentDate(d);
  };

  const goNextMonth = () => {
    const d = new Date(currentDate);
    d.setMonth(d.getMonth() + 1);
    setCurrentDate(d);
  };

  // Abrir Modal de Criação para um dia específico
  const openCreateForDate = (dateStr: string) => {
    setCreateDate(dateStr);
    setShowCreateModal(true);
  };

  // Submeter Novo Manejo
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createLotId || !createDate) return;
    setCreating(true);

    const ok = await insertManagementEvent({
      lot_id: createLotId,
      step_code: createStepCode,
      planned_date: createDate,
      start_time: createTime ? `${createTime}:00` : null,
      responsible_name: createResponsible,
      notes: createNotes || null,
      status: 'pendente'
    });

    if (ok) {
      showToast('Manejo agendado com sucesso!');
      await loadData(true);
      setShowCreateModal(false);
      setCreateNotes('');
    } else {
      showToast('Erro ao agendar manejo.');
    }
    setCreating(false);
  };

  // Concluir Manejo
  const handleCompleteSubmit = async () => {
    if (!selectedEvent) return;
    setCompleting(true);
    const ok = await completeManagementEvent(
      selectedEvent.id,
      parseInt(animalsWorked) || 0,
      parseInt(lossesCount) || 0
    );
    if (ok) {
      showToast('Manejo concluído com sucesso!');
      await loadData(true);
      setSelectedEvent(null);
      setAnimalsWorked('');
      setLossesCount('0');
    } else {
      showToast('Erro ao concluir manejo.');
    }
    setCompleting(false);
  };

  // Excluir Manejo
  const handleDeleteEvent = async (id: string) => {
    if (!confirm('Deseja realmente remover este manejo agendado?')) return;
    const ok = await deleteManagementEvent(id);
    if (ok) {
      showToast('Manejo removido com sucesso!');
      setSelectedEvent(null);
      await loadData(true);
    } else {
      showToast('Erro ao remover manejo.');
    }
  };

  // Cálculo dos dias do mês
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const formattedMonthYear = `${MONTH_NAMES[month]} de ${year}`;
  const todayStr = new Date().toISOString().split('T')[0];

  // Grid de dias do mês (com preenchimento de semanas completas)
  const monthGridDays = useMemo(() => {
    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    
    const days: { date: Date; isCurrentMonth: boolean; dateStr: string; dayNum: number }[] = [];

    // Preenchimento do mês anterior
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, prevMonthLastDay - i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      days.push({ date: d, isCurrentMonth: false, dateStr: `${yyyy}-${mm}-${dd}`, dayNum: prevMonthLastDay - i });
    }

    // Dias do mês atual
    for (let i = 1; i <= totalDaysInMonth; i++) {
      const d = new Date(year, month, i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      days.push({ date: d, isCurrentMonth: true, dateStr: `${yyyy}-${mm}-${dd}`, dayNum: i });
    }

    // Preenchimento do próximo mês
    const remaining = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      days.push({ date: d, isCurrentMonth: false, dateStr: `${yyyy}-${mm}-${dd}`, dayNum: i });
    }

    return days;
  }, [year, month]);

  // Filtragem dos eventos
  const filteredEvents = useMemo(() => {
    return events.filter(ev => {
      // Filtro de etapa
      if (filterStep !== 'ALL') {
        if (filterStep === 'RETIRADA') {
          if (!['D7', 'D8', 'D9'].includes(ev.step_code)) return false;
        } else if (ev.step_code !== filterStep) {
          return false;
        }
      }

      // Filtro de status
      if (filterStatus === 'pendente' && ev.status === 'concluido') return false;
      if (filterStatus === 'concluido' && ev.status !== 'concluido') return false;

      // Busca de texto
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const lotCode = ev.iatf_lots?.code?.toLowerCase() || '';
        const farmName = ev.iatf_lots?.farms?.name?.toLowerCase() || '';
        const resp = ev.responsible_name?.toLowerCase() || '';
        const notes = ev.notes?.toLowerCase() || '';
        const step = ev.step_code?.toLowerCase() || '';

        const match = lotCode.includes(q) || farmName.includes(q) || resp.includes(q) || notes.includes(q) || step.includes(q);
        if (!match) return false;
      }

      return true;
    });
  }, [events, filterStep, filterStatus, searchQuery]);

  // Agrupamento de eventos por data
  const eventsByDate = useMemo(() => {
    const map = new Map<string, ManagementEvent[]>();
    filteredEvents.forEach(ev => {
      const list = map.get(ev.planned_date) || [];
      list.push(ev);
      map.set(ev.planned_date, list);
    });
    return map;
  }, [filteredEvents]);

  // Totais analíticos do mês atual
  const monthStats = useMemo(() => {
    const currentMonthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    const monthEvents = filteredEvents.filter(ev => ev.planned_date.startsWith(currentMonthPrefix));

    const total = monthEvents.length;
    const iaCount = monthEvents.filter(ev => ev.step_code === 'IA').length;
    const dgCount = monthEvents.filter(ev => ['DG', 'DG1', 'DG2'].includes(ev.step_code)).length;
    const d0Count = monthEvents.filter(ev => ev.step_code === 'D0').length;
    const concludedCount = monthEvents.filter(ev => ev.status === 'concluido').length;
    const totalAnimalsWorked = monthEvents.reduce((acc, ev) => acc + (ev.animals_worked_count || 0), 0);

    return {
      total,
      iaCount,
      dgCount,
      d0Count,
      concludedCount,
      totalAnimalsWorked,
    };
  }, [filteredEvents, year, month]);

  return (
    <div className="space-y-5 pb-12">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-600 text-slate-950 font-bold px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-2 border border-emerald-400 animate-in fade-in slide-in-from-bottom-4">
          <Check className="w-5 h-5" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 1. Header Integrado com Navegação de Mês e Seletor de Fazenda */}
      <div className="glass-card bg-slate-900/90 p-5 rounded-2xl border border-slate-800 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center font-black shadow-inner">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white flex items-center gap-2">
                  Agenda Integrada de Manejos
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Visão Mensal
                  </span>
                </h1>
                <p className="text-xs text-slate-400">
                  Planejamento unificado de protocolos e serviços de campo entre todas as fazendas.
                </p>
              </div>
            </div>
          </div>

          {/* Controles de Navegação de Mês */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Seletor de Fazenda */}
            <div className="flex items-center gap-1.5 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
              <Building2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <select
                value={selectedFarmId}
                onChange={(e) => setSelectedFarmId(e.target.value)}
                className="bg-transparent text-slate-200 font-semibold focus:outline-none cursor-pointer"
              >
                <option value="all">Todas as Fazendas (Integrada)</option>
                {farms.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Navegador de Mês */}
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                onClick={goPrevMonth}
                title="Mês Anterior"
                className="p-1.5 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              
              <button
                onClick={goToday}
                title="Ir para o mês atual"
                className="px-3 py-1 text-xs font-bold text-slate-200 hover:text-emerald-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                Hoje
              </button>

              <button
                onClick={goNextMonth}
                title="Próximo Mês"
                className="p-1.5 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Mês e Ano Atual em Destaque */}
            <span className="text-base font-extrabold text-white px-2 tracking-wide font-sans">
              {formattedMonthYear}
            </span>

            {/* Botão Novo Agendamento */}
            <button
              onClick={() => openCreateForDate(todayStr)}
              className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-md ml-auto lg:ml-0"
            >
              <Plus className="w-4 h-4" />
              <span>Novo Manejo</span>
            </button>
          </div>
        </div>

        {/* 2. Resumo KPI do Mês Consolidado */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-2 border-t border-slate-800/80">
          <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/70 flex items-center justify-between">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Manejos no Mês</span>
              <p className="text-xl font-black text-white font-mono mt-0.5">{monthStats.total}</p>
            </div>
            <div className="w-8 h-8 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </div>
          </div>

          <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/70 flex items-center justify-between">
            <div>
              <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">Inseminações (IA)</span>
              <p className="text-xl font-black text-emerald-400 font-mono mt-0.5">{monthStats.iaCount}</p>
            </div>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
              <Syringe className="w-4 h-4" />
            </div>
          </div>

          <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/70 flex items-center justify-between">
            <div>
              <span className="text-[10px] uppercase font-bold text-amber-400 tracking-wider">Diagnósticos (DG)</span>
              <p className="text-xl font-black text-amber-400 font-mono mt-0.5">{monthStats.dgCount}</p>
            </div>
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center">
              <Microscope className="w-4 h-4" />
            </div>
          </div>

          <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/70 flex items-center justify-between">
            <div>
              <span className="text-[10px] uppercase font-bold text-sky-400 tracking-wider">Implantes (D0)</span>
              <p className="text-xl font-black text-sky-400 font-mono mt-0.5">{monthStats.d0Count}</p>
            </div>
            <div className="w-8 h-8 rounded-lg bg-sky-500/15 text-sky-400 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
          </div>

          <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/70 col-span-2 sm:col-span-1 flex items-center justify-between">
            <div>
              <span className="text-[10px] uppercase font-bold text-teal-400 tracking-wider">Animais Trabalhados</span>
              <p className="text-xl font-black text-teal-300 font-mono mt-0.5">{monthStats.totalAnimalsWorked}</p>
            </div>
            <div className="w-8 h-8 rounded-lg bg-teal-500/15 text-teal-400 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
        </div>
      </div>

      {/* 3. Barra de Filtros Rápidos */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          {/* Busca por texto */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar lote, fazenda, responsável..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-white pl-8 pr-3 py-1.5 rounded-lg text-xs focus:outline-none focus:border-emerald-500 w-52 sm:w-64"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filtro de Etapa */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
            <button
              onClick={() => setFilterStep('ALL')}
              className={`px-2.5 py-1 rounded-md font-semibold transition-all ${filterStep === 'ALL' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-white'}`}
            >
              Todos
            </button>
            <button
              onClick={() => setFilterStep('D0')}
              className={`px-2 py-1 rounded-md font-semibold transition-all ${filterStep === 'D0' ? 'bg-sky-500 text-slate-950' : 'text-slate-400 hover:text-sky-300'}`}
            >
              D0
            </button>
            <button
              onClick={() => setFilterStep('RETIRADA')}
              className={`px-2 py-1 rounded-md font-semibold transition-all ${filterStep === 'RETIRADA' ? 'bg-purple-500 text-white' : 'text-slate-400 hover:text-purple-300'}`}
            >
              D8/D9
            </button>
            <button
              onClick={() => setFilterStep('IA')}
              className={`px-2 py-1 rounded-md font-semibold transition-all ${filterStep === 'IA' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-emerald-300'}`}
            >
              IA
            </button>
            <button
              onClick={() => setFilterStep('DG')}
              className={`px-2 py-1 rounded-md font-semibold transition-all ${filterStep === 'DG' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-amber-300'}`}
            >
              DG
            </button>
          </div>

          {/* Filtro de Status */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as 'all' | 'pendente' | 'concluido')}
            className="bg-slate-950 border border-slate-800 text-slate-300 px-2.5 py-1.5 rounded-lg focus:outline-none focus:border-emerald-500 cursor-pointer"
          >
            <option value="all">Todos os Status</option>
            <option value="pendente">Apenas Pendentes / Próximos</option>
            <option value="concluido">Apenas Concluídos</option>
          </select>
        </div>

        <button
          onClick={() => loadData(true)}
          className="text-slate-400 hover:text-white flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          title="Atualizar agenda"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
          <span>Atualizar</span>
        </button>
      </div>

      {/* 4. Grade do Calendário Mensal */}
      <div className="glass-card bg-slate-900/90 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
        {/* Cabeçalho dos Dias da Semana */}
        <div className="grid grid-cols-7 border-b border-slate-800 bg-slate-950/80 text-center">
          {WEEKDAY_NAMES_SHORT.map((dayName, idx) => (
            <div
              key={dayName}
              className={`py-2.5 text-xs font-bold tracking-wider uppercase ${idx === 0 || idx === 6 ? 'text-slate-500' : 'text-slate-300'}`}
            >
              {dayName}
            </div>
          ))}
        </div>

        {/* Células de Dias do Mês */}
        <div className="grid grid-cols-7 divide-x divide-y divide-slate-800/60 bg-slate-950/40 min-h-160">
          {monthGridDays.map((dayItem) => {
            const isToday = dayItem.dateStr === todayStr;
            const dayEvents = eventsByDate.get(dayItem.dateStr) || [];

            return (
              <div
                key={dayItem.dateStr}
                onClick={() => openCreateForDate(dayItem.dateStr)}
                className={`min-h-27.5 sm:min-h-32.5 p-1.5 sm:p-2 flex flex-col justify-between transition-colors relative group cursor-pointer ${
                  dayItem.isCurrentMonth
                    ? isToday
                      ? 'bg-emerald-500/4 ring-1 ring-inset ring-emerald-500/40'
                      : 'hover:bg-slate-850/50'
                    : 'bg-slate-950/70 text-slate-600 opacity-60 hover:opacity-100'
                }`}
              >
                {/* Header do Dia */}
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={`text-xs font-mono font-bold w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                      isToday
                        ? 'bg-emerald-500 text-slate-950 font-black shadow-md shadow-emerald-500/20'
                        : dayItem.isCurrentMonth
                        ? 'text-slate-300 group-hover:text-white'
                        : 'text-slate-600'
                    }`}
                  >
                    {dayItem.dayNum}
                  </span>

                  {dayEvents.length > 0 && (
                    <span className="text-[10px] font-bold text-slate-400 font-mono px-1 rounded bg-slate-900 border border-slate-800">
                      {dayEvents.length} {dayEvents.length === 1 ? 'manejo' : 'manejos'}
                    </span>
                  )}
                </div>

                {/* Lista de Eventos no Dia */}
                <div className="space-y-1 flex-1 overflow-hidden">
                  {dayEvents.slice(0, 3).map((ev) => {
                    const stepConf = STEP_COLORS[ev.step_code] || STEP_COLORS.OUTRO;
                    const isConcluded = ev.status === 'concluido';
                    const farmName = ev.iatf_lots?.farms?.name || 'Fazenda';
                    const farmColors = farmColorMap.get(ev.iatf_lots?.farm_id || '') || {
                      text: 'text-emerald-300',
                      bg: 'bg-emerald-500/15',
                      border: 'border-emerald-500/30'
                    };

                    return (
                      <div
                        key={ev.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedEvent(ev);
                        }}
                        className={`text-[11px] p-1.5 rounded-lg border transition-all cursor-pointer shadow-sm hover:scale-[1.02] ${stepConf.bg} ${stepConf.border} flex flex-col gap-0.5`}
                      >
                        {/* Linha 1: Tag da Fazenda + Etapa */}
                        <div className="flex items-center justify-between gap-1">
                          <span
                            className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded border truncate max-w-22.5 ${farmColors.bg} ${farmColors.text} ${farmColors.border}`}
                            title={`Fazenda: ${farmName}`}
                          >
                            {farmName}
                          </span>

                          <span className={`text-[10px] font-extrabold font-mono shrink-0 px-1 rounded ${stepConf.badge}`}>
                            {ev.step_code}
                          </span>
                        </div>

                        {/* Linha 2: Lote + Status */}
                        <div className="flex items-center justify-between gap-1 text-[10px] text-slate-300 pt-0.5">
                          <span className="truncate font-medium text-slate-200" title={ev.iatf_lots?.code}>
                            {ev.iatf_lots?.code || 'Lote'}
                          </span>

                          {isConcluded ? (
                            <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                          ) : (
                            <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Indicador se houver mais de 3 eventos */}
                  {dayEvents.length > 3 && (
                    <div className="text-[10px] text-center font-bold text-emerald-400 bg-slate-900/90 py-0.5 rounded border border-slate-800">
                      + {dayEvents.length - 3} mais
                    </div>
                  )}
                </div>

                {/* Dica de clique para agendar */}
                <div className="opacity-0 group-hover:opacity-100 transition-opacity text-[9px] text-slate-500 text-center pt-0.5">
                  + agendar
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ======================================================== */}
      {/* MODAL: DETALHES & CONCLUSÃO DO MANEJO */}
      {/* ======================================================== */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="glass-card w-full max-w-lg rounded-3xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden animate-in fade-in my-auto">
            {/* Header Modal */}
            <div className="px-6 py-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={`text-xs font-extrabold px-2.5 py-1 rounded-lg ${STEP_COLORS[selectedEvent.step_code]?.badge || 'bg-slate-700 text-white'}`}>
                  {selectedEvent.step_code}
                </span>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {STEP_COLORS[selectedEvent.step_code]?.label || 'Manejo Operacional'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Lote: <strong className="text-emerald-400 font-mono">{selectedEvent.iatf_lots?.code}</strong>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedEvent(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Corpo dos Detalhes */}
            <div className="p-6 space-y-4">
              {/* Informações Gerais */}
              <div className="grid grid-cols-2 gap-3 text-xs bg-slate-950/70 p-4 rounded-2xl border border-slate-800">
                <div>
                  <span className="text-slate-400 block text-[11px]">Propriedade / Fazenda</span>
                  <p className="font-semibold text-white flex items-center gap-1.5 mt-0.5">
                    <Building2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    {selectedEvent.iatf_lots?.farms?.name || 'Fazenda'}
                  </p>
                </div>

                <div>
                  <span className="text-slate-400 block text-[11px]">Data Planejada</span>
                  <p className="font-semibold text-white font-mono mt-0.5">
                    {selectedEvent.planned_date.split('-').reverse().join('/')}
                    {selectedEvent.start_time && ` às ${selectedEvent.start_time.slice(0, 5)}`}
                  </p>
                </div>

                <div>
                  <span className="text-slate-400 block text-[11px]">Status Operacional</span>
                  <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full mt-1 ${
                    selectedEvent.status === 'concluido' 
                      ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' 
                      : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                  }`}>
                    {selectedEvent.status === 'concluido' ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                    {selectedEvent.status === 'concluido' ? 'Concluído' : 'Pendente / Agendado'}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 block text-[11px]">Responsável</span>
                  <p className="font-semibold text-white flex items-center gap-1.5 mt-0.5">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    {selectedEvent.responsible_name || 'Equipe de Campo'}
                  </p>
                </div>
              </div>

              {selectedEvent.notes && (
                <div className="p-3 bg-slate-950/50 rounded-xl border border-slate-800/80 text-xs text-slate-300">
                  <span className="text-[10px] text-slate-400 font-bold block mb-0.5">Observações:</span>
                  {selectedEvent.notes}
                </div>
              )}

              {/* Se o evento estiver pendente: Formulário para concluir */}
              {selectedEvent.status !== 'concluido' ? (
                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
                  <h4 className="text-xs font-bold text-white flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    Registrar Execução no Curral
                  </h4>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">
                        Fêmeas Trabalhadas *
                      </label>
                      <input
                        type="number"
                        min="1"
                        placeholder="Ex: 85"
                        value={animalsWorked}
                        onChange={(e) => setAnimalsWorked(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500 font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">
                        Perdas / Falhas
                      </label>
                      <input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={lossesCount}
                        onChange={(e) => setLossesCount(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500 font-mono"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleCompleteSubmit}
                    disabled={completing || !animalsWorked}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-950 font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md"
                  >
                    {completing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    {completing ? 'Salvando...' : 'Confirmar Conclusão do Manejo'}
                  </button>
                </div>
              ) : (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-300 flex items-center justify-between">
                  <span>Manejo já finalizado com {selectedEvent.animals_worked_count} fêmeas trabalhadas.</span>
                  {selectedEvent.execution_date && (
                    <span className="font-mono text-[11px]">
                      Executado em {selectedEvent.execution_date.split('-').reverse().join('/')}
                    </span>
                  )}
                </div>
              )}

              {/* Botões do Rodapé */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => handleDeleteEvent(selectedEvent.id)}
                  className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1.5 p-2 rounded-lg hover:bg-rose-500/10 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Excluir Agendamento</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedEvent(null)}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:text-white text-xs cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: NOVO AGENDAMENTO DE MANEJO */}
      {/* ======================================================== */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="glass-card w-full max-w-md rounded-3xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden animate-in fade-in my-auto">
            {/* Header Modal */}
            <div className="px-6 py-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-400" />
                Agendar Novo Manejo
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-6 space-y-4">
              {/* Lote Alvo */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Lote de IATF *
                </label>
                {lots.length === 0 ? (
                  <p className="text-xs text-amber-400 bg-amber-500/10 p-2 rounded-lg border border-amber-500/20">
                    Nenhum lote ativo cadastrado nesta seleção. Crie um lote primeiro na tela de Lotes.
                  </p>
                ) : (
                  <select
                    required
                    value={createLotId}
                    onChange={(e) => setCreateLotId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-xs px-3 py-2.5 rounded-xl focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    {lots.map((l) => {
                      const lotFarm = farms.find((f) => f.id === l.farm_id);
                      return (
                        <option key={l.id} value={l.id}>
                          {l.code} {lotFarm ? `— (${lotFarm.name})` : ''} • {l.worked_qty || 0} fêmeas
                        </option>
                      );
                    })}
                  </select>
                )}
              </div>

              {/* Etapa */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Etapa do Protocolo *
                </label>
                <select
                  value={createStepCode}
                  onChange={(e) => setCreateStepCode(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-xs px-3 py-2.5 rounded-xl focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value="D0">D0 - Início do Protocolo / Implante de Progesterona</option>
                  <option value="D7">D7 - Retirada PGF</option>
                  <option value="D8">D8 - Retirada de Implante + Indutor de Ovulação</option>
                  <option value="D9">D9 - Retirada de Implante (Protocolo 9 dias)</option>
                  <option value="IA">IA - Inseminação Artificial em Tempo Fixo</option>
                  <option value="DG">DG - Diagnóstico de Gestação (30-45 dias)</option>
                  <option value="DG1">DG 1 - Diagnóstico Precoce</option>
                  <option value="DG2">DG 2 - Confirmação de Perda / Sexagem Fetal</option>
                  <option value="VAC">VAC - Vacinação Reprodutiva / Sanitária</option>
                  <option value="PES">PES - Pesagem e Avaliação de ECC</option>
                  <option value="OUTRO">OUTRO - Outro Manejo Operacional</option>
                </select>
              </div>

              {/* Data e Hora */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Data Planejada *
                  </label>
                  <input
                    required
                    type="date"
                    value={createDate}
                    onChange={(e) => setCreateDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Horário de Início
                  </label>
                  <input
                    type="time"
                    value={createTime}
                    onChange={(e) => setCreateTime(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>

              {/* Responsável */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Veterinário / Responsável Técnico
                </label>
                <input
                  type="text"
                  value={createResponsible}
                  onChange={(e) => setCreateResponsible(e.target.value)}
                  placeholder="Ex: Dr. Samoel Duarte"
                  className="w-full bg-slate-950 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Observações */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Observações Adicionais
                </label>
                <textarea
                  rows={2}
                  value={createNotes}
                  onChange={(e) => setCreateNotes(e.target.value)}
                  placeholder="Ex: Verificar palhetas na caneca 2 antes de iniciar o curral."
                  className="w-full bg-slate-950 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500 resize-none"
                />
              </div>

              {/* Botões */}
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={creating || !createLotId}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-950 font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md"
                >
                  {creating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {creating ? 'Salvando...' : 'Salvar Agendamento'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-400 hover:text-white text-xs cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
