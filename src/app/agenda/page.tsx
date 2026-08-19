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
import { 
  CheckCircle2, 
  AlertCircle, 
  Check, 
  RefreshCw, 
  X, 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  SlidersHorizontal, 
  Trash2, 
  Search
} from 'lucide-react';

type CalendarView = 'month' | 'week' | 'day' | 'list';

const STEP_COLORS: Record<string, { bg: string; text: string; border: string; label: string; badge: string }> = {
  'D0': { bg: 'bg-sky-500/15 hover:bg-sky-500/25', text: 'text-sky-400', border: 'border-sky-500/40', label: 'D0 - Início / Implante', badge: 'bg-sky-500 text-slate-950' },
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

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const WEEKDAY_NAMES_SHORT = ['DOM.', 'SEG.', 'TER.', 'QUA.', 'QUI.', 'SEX.', 'SÁB.'];
const WEEKDAY_NAMES_MINI = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

const HOURS = Array.from({ length: 15 }, (_, i) => i + 6); // 06:00 to 20:00

export default function AgendaPage() {
  const [events, setEvents] = useState<ManagementEvent[]>([]);
  const [lots, setLots] = useState<LotStat[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Date State
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [view, setView] = useState<CalendarView>('month');
  
  // Filters
  const [selectedTypes, setSelectedTypes] = useState<string[]>(['D0', 'D7', 'D8', 'D9', 'IA', 'DG', 'DG1', 'DG2', 'VAC', 'PES', 'OUTRO']);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(['pendente', 'proximo', 'atrasado', 'concluido']);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSidebar, setShowSidebar] = useState(true);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createDate, setCreateDate] = useState(new Date().toISOString().split('T')[0]);
  const [createTime, setCreateTime] = useState('08:00');
  const [createLotId, setCreateLotId] = useState('');
  const [createStepCode, setCreateStepCode] = useState('D0');
  const [createResponsible, setCreateResponsible] = useState('Equipe de Campo');
  const [createNotes, setCreateNotes] = useState('');
  const [creating, setCreating] = useState(false);

  // View / Complete Modal
  const [selectedEvent, setSelectedEvent] = useState<ManagementEvent | null>(null);
  const [completing, setCompleting] = useState(false);
  const [animalsWorked, setAnimalsWorked] = useState('');
  const [lossesCount, setLossesCount] = useState('0');
  
  // Feedback toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    const [eventsData, lotsData] = await Promise.all([
      getManagementEvents(),
      getLots()
    ]);
    setEvents(eventsData);
    setLots(lotsData);
    if (lotsData.length > 0 && !createLotId) {
      setCreateLotId(lotsData[0].id);
    }
    setLoading(false);
  }, [createLotId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Quick navigation
  const goToday = () => setCurrentDate(new Date());
  
  const goPrev = () => {
    const d = new Date(currentDate);
    if (view === 'month') d.setMonth(d.getMonth() - 1);
    else if (view === 'week') d.setDate(d.getDate() - 7);
    else if (view === 'day') d.setDate(d.getDate() - 1);
    setCurrentDate(d);
  };

  const goNext = () => {
    const d = new Date(currentDate);
    if (view === 'month') d.setMonth(d.getMonth() + 1);
    else if (view === 'week') d.setDate(d.getDate() + 7);
    else if (view === 'day') d.setDate(d.getDate() + 1);
    setCurrentDate(d);
  };

  // Open Create Modal for specific date/time
  const openCreateForDate = (dateStr: string, timeStr?: string) => {
    setCreateDate(dateStr);
    if (timeStr) setCreateTime(timeStr);
    setShowCreateModal(true);
  };

  // Submit new event
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
      await loadData();
      setShowCreateModal(false);
      setCreateNotes('');
    } else {
      showToast('Erro ao agendar manejo. Tente novamente.');
    }
    setCreating(false);
  };

  // Complete Event
  const handleCompleteSubmit = async () => {
    if (!selectedEvent || !animalsWorked) return;
    setCompleting(true);
    const ok = await completeManagementEvent(
      selectedEvent.id,
      parseInt(animalsWorked) || 0,
      parseInt(lossesCount) || 0
    );
    if (ok) {
      showToast('Manejo concluído com sucesso!');
      await loadData();
      setSelectedEvent(null);
    } else {
      showToast('Erro ao concluir manejo.');
    }
    setCompleting(false);
  };

  // Delete Event
  const handleDeleteEvent = async (id: string) => {
    if (!confirm('Deseja realmente remover este manejo agendado?')) return;
    const ok = await deleteManagementEvent(id);
    if (ok) {
      showToast('Manejo removido com sucesso!');
      setSelectedEvent(null);
      setEvents(prev => prev.filter(e => e.id !== id));
      await loadData();
    } else {
      showToast('Erro ao remover manejo no banco de dados.');
    }
  };

  // Filtered Events
  const filteredEvents = useMemo(() => {
    return events.filter(ev => {
      // Step Type Filter
      const stepMatch = selectedTypes.includes(ev.step_code) || selectedTypes.includes('OUTRO');
      // Status Filter
      const statusMatch = selectedStatuses.includes(ev.status || 'pendente');
      // Search
      const searchMatch = !searchQuery || 
        ev.iatf_lots?.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ev.step_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (ev.responsible_name && ev.responsible_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (ev.iatf_lots?.properties?.name && ev.iatf_lots.properties.name.toLowerCase().includes(searchQuery.toLowerCase()));

      return stepMatch && statusMatch && searchMatch;
    });
  }, [events, selectedTypes, selectedStatuses, searchQuery]);

  // Calendar Calculation Helpers
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const formattedMonthYear = `${MONTH_NAMES[month]} de ${year}`;

  // Month Grid Days
  const monthGridDays = useMemo(() => {
    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    
    const days: { date: Date; isCurrentMonth: boolean; dateStr: string; dayNum: number }[] = [];

    // Prev month padding
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, prevMonthLastDay - i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      days.push({ date: d, isCurrentMonth: false, dateStr, dayNum: prevMonthLastDay - i });
    }

    // Current month days
    for (let i = 1; i <= totalDaysInMonth; i++) {
      const d = new Date(year, month, i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      days.push({ date: d, isCurrentMonth: true, dateStr, dayNum: i });
    }

    // Next month padding to fill complete grid (multiples of 7)
    const remaining = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      days.push({ date: d, isCurrentMonth: false, dateStr, dayNum: i });
    }

    return days;
  }, [year, month]);

  // Week Grid Days
  const weekGridDays = useMemo(() => {
    const d = new Date(currentDate);
    const dayOfWeek = d.getDay(); // 0 is Sunday
    const sunday = new Date(d);
    sunday.setDate(d.getDate() - dayOfWeek);

    const weekDays: { date: Date; dateStr: string; dayNum: number; dayName: string; isToday: boolean }[] = [];
    const today = new Date();
    const yyyyToday = today.getFullYear();
    const mmToday = String(today.getMonth() + 1).padStart(2, '0');
    const ddToday = String(today.getDate()).padStart(2, '0');
    const todayStr = `${yyyyToday}-${mmToday}-${ddToday}`;

    for (let i = 0; i < 7; i++) {
      const day = new Date(sunday);
      day.setDate(sunday.getDate() + i);
      const yyyy = day.getFullYear();
      const mm = String(day.getMonth() + 1).padStart(2, '0');
      const dd = String(day.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      weekDays.push({
        date: day,
        dateStr,
        dayNum: day.getDate(),
        dayName: WEEKDAY_NAMES_SHORT[i],
        isToday: dateStr === todayStr
      });
    }
    return weekDays;
  }, [currentDate]);

  // Today string for highlighting
  const todayStr = useMemo(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  // Events map by dateStr for ultra fast lookup
  const eventsByDate = useMemo(() => {
    const map: Record<string, ManagementEvent[]> = {};
    filteredEvents.forEach(ev => {
      const d = ev.planned_date;
      if (!map[d]) map[d] = [];
      map[d].push(ev);
    });
    return map;
  }, [filteredEvents]);

  // Toggle helper for filters
  const toggleType = (code: string) => {
    setSelectedTypes(prev => 
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  };

  const toggleStatus = (st: string) => {
    setSelectedStatuses(prev => 
      prev.includes(st) ? prev.filter(s => s !== st) : [...prev, st]
    );
  };

  return (
    <div className="flex flex-col min-h-[calc(100vh-8rem)] text-slate-100 bg-slate-950 select-none rounded-2xl border border-slate-800/80 shadow-2xl overflow-hidden">
      
      {/* ========================================================================= */}
      {/* 1. TOP HEADER (Google Calendar style) */}
      {/* ========================================================================= */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-slate-800/80 bg-slate-900/90 backdrop-blur-md z-20">
        
        {/* Left: Brand + Date Controls */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-linear-to-tr from-emerald-600 to-teal-400 flex items-center justify-center font-black text-slate-950 shadow-md shadow-emerald-500/20">
              {new Date().getDate()}
            </div>
            <span className="text-xl font-bold text-white tracking-tight hidden sm:inline">Agenda IATF</span>
          </div>

          <button
            onClick={goToday}
            className="px-4 py-1.5 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-all shadow-sm"
          >
            Hoje
          </button>

          <div className="flex items-center gap-1">
            <button
              onClick={goPrev}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
              title="Anterior"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={goNext}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
              title="Próximo"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <h2 className="text-lg sm:text-xl font-bold text-slate-100 capitalize">
            {formattedMonthYear}
          </h2>
        </div>

        {/* Right: Search, Filter Toggle, View Selector */}
        <div className="flex items-center gap-3">
          {/* Search Box */}
          <div className="relative hidden md:block">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar lote, manejo, responsável..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-56 lg:w-72 bg-slate-950/80 border border-slate-800 text-slate-200 text-xs pl-9 pr-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500 transition-all placeholder:text-slate-500"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Toggle Sidebar */}
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className={`p-2 rounded-xl border border-slate-800 transition-all ${
              showSidebar ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
            title="Alternar barra lateral"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>

          {/* Refresh */}
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-colors"
            title="Atualizar dados"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
          </button>

          {/* View Dropdown / Pills */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
            {(['month', 'week', 'day', 'list'] as CalendarView[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${
                  view === v 
                    ? 'bg-emerald-500 text-slate-950 shadow-md font-bold' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {v === 'month' ? 'Mês' : v === 'week' ? 'Semana' : v === 'day' ? 'Dia' : 'Lista'}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* 2. BODY: SIDEBAR + CALENDAR MAIN GRID */}
      {/* ========================================================================= */}
      <div className="flex flex-1 relative flex-col lg:flex-row">

        {/* --- LEFT SIDEBAR --- */}
        {showSidebar && (
          <aside className="w-full lg:w-72 shrink-0 border-b lg:border-b-0 lg:border-r border-slate-800 bg-slate-900/50 p-4 flex flex-col gap-6">
            
            {/* Create Button */}
            <button
              onClick={() => openCreateForDate(todayStr, '08:00')}
              className="w-full flex items-center justify-center gap-3 bg-linear-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold py-3 px-4 rounded-2xl shadow-lg shadow-emerald-500/10 hover:shadow-emerald-500/25 transition-all text-sm group"
            >
              <div className="w-6 h-6 rounded-lg bg-slate-950/20 flex items-center justify-center group-hover:rotate-90 transition-transform duration-300">
                <Plus className="w-4 h-4 text-slate-950 font-black stroke-3" />
              </div>
              <span>Criar Manejo / Evento</span>
            </button>

            {/* Mini Calendar */}
            <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800/80">
              <div className="flex items-center justify-between mb-3 px-1">
                <span className="text-xs font-bold text-slate-200 capitalize">
                  {formattedMonthYear}
                </span>
                <div className="flex items-center gap-1">
                  <button onClick={goPrev} className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white">
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={goNext} className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white">
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Mini Calendar Grid */}
              <div className="grid grid-cols-7 gap-1 text-center text-[10px]">
                {WEEKDAY_NAMES_MINI.map((w, idx) => (
                  <span key={idx} className="text-slate-500 font-semibold py-1">{w}</span>
                ))}
                {monthGridDays.map((d, idx) => {
                  const isToday = d.dateStr === todayStr;
                  const isSelected = d.date.toDateString() === currentDate.toDateString();
                  const hasEvents = (eventsByDate[d.dateStr]?.length || 0) > 0;

                  return (
                    <button
                      key={idx}
                      onClick={() => {
                        setCurrentDate(d.date);
                        if (view === 'month') setView('day');
                      }}
                      className={`h-7 w-7 mx-auto rounded-full flex items-center justify-center relative font-medium transition-all ${
                        isSelected
                          ? 'bg-emerald-500 text-slate-950 font-bold'
                          : isToday
                          ? 'bg-sky-500/20 text-sky-400 font-bold border border-sky-500/40'
                          : d.isCurrentMonth
                          ? 'text-slate-300 hover:bg-slate-800'
                          : 'text-slate-600 hover:bg-slate-900'
                      }`}
                    >
                      {d.dayNum}
                      {hasEvents && !isSelected && (
                        <span className="w-1 h-1 rounded-full bg-emerald-400 absolute bottom-0.5" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Filter: Tipos de Manejo */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs font-bold text-slate-300 uppercase tracking-wider px-1">
                <span>Tipos de Manejo</span>
                <span className="text-[10px] text-slate-500 lowercase">({filteredEvents.length} eventos)</span>
              </div>
              
              <div className="space-y-1 text-xs">
                {Object.entries(STEP_COLORS).map(([code, style]) => {
                  const isChecked = selectedTypes.includes(code);
                  return (
                    <button
                      key={code}
                      onClick={() => toggleType(code)}
                      className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl hover:bg-slate-800/60 transition-colors text-left group"
                    >
                      <div className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all ${
                        isChecked 
                          ? `${style.border} ${style.bg} ${style.text}` 
                          : 'border-slate-700 bg-slate-900 text-transparent'
                      }`}>
                        <Check className="w-3 h-3 stroke-3" />
                      </div>
                      <span className={`flex-1 font-medium transition-colors ${isChecked ? 'text-slate-200' : 'text-slate-500'}`}>
                        {style.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Filter: Status */}
            <div className="space-y-2.5 pt-2 border-t border-slate-800/80">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider px-1 block">
                Status Operacional
              </span>
              
              <div className="space-y-1 text-xs">
                {[
                  { id: 'proximo', label: 'Próximos Manejos', color: 'text-amber-400 border-amber-500/40 bg-amber-500/20' },
                  { id: 'atrasado', label: 'Atrasados / Pendentes', color: 'text-rose-400 border-rose-500/40 bg-rose-500/20' },
                  { id: 'concluido', label: 'Concluídos', color: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/20' },
                ].map((st) => {
                  const isChecked = selectedStatuses.includes(st.id);
                  return (
                    <button
                      key={st.id}
                      onClick={() => toggleStatus(st.id)}
                      className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl hover:bg-slate-800/60 transition-colors text-left"
                    >
                      <div className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all ${
                        isChecked 
                          ? st.color
                          : 'border-slate-700 bg-slate-900 text-transparent'
                      }`}>
                        <Check className="w-3 h-3 stroke-3" />
                      </div>
                      <span className={`font-medium ${isChecked ? 'text-slate-200' : 'text-slate-500'}`}>
                        {st.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

          </aside>
        )}

        {/* --- MAIN CALENDAR VIEW --- */}
        <main className="flex-1 flex flex-col bg-slate-950 min-w-0">

          {/* ========================================================================= */}
          {/* VIEW: MONTH */}
          {/* ========================================================================= */}
          {view === 'month' && (
            <div className="flex-1 flex flex-col">
              
              {/* Day Headers (DOM, SEG, TER...) */}
              <div className="grid grid-cols-7 border-b border-slate-800 bg-slate-900/60 text-center text-xs font-bold text-slate-400 py-2.5">
                {WEEKDAY_NAMES_SHORT.map((name, i) => (
                  <div key={i} className="tracking-wider">
                    {name}
                  </div>
                ))}
              </div>

              {/* Month Grid Cells */}
              <div className="flex-1 grid grid-cols-7 auto-rows-fr border-collapse">
                {monthGridDays.map((d, idx) => {
                  const dayEvents = eventsByDate[d.dateStr] || [];
                  const isToday = d.dateStr === todayStr;

                  return (
                    <div
                      key={idx}
                      onClick={() => openCreateForDate(d.dateStr, '08:00')}
                      className={`min-h-[110px] p-1.5 border-b border-r border-slate-800/60 transition-colors flex flex-col justify-between group relative cursor-pointer ${
                        d.isCurrentMonth ? 'bg-slate-950/40 hover:bg-slate-900/50' : 'bg-slate-950/90 opacity-40 hover:opacity-60'
                      }`}
                    >
                      {/* Top Day Number */}
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center ${
                            isToday
                              ? 'bg-emerald-500 text-slate-950 font-black shadow-sm'
                              : d.isCurrentMonth
                              ? 'text-slate-300'
                              : 'text-slate-600'
                          }`}
                        >
                          {d.dayNum}
                        </span>

                        <span className="opacity-0 group-hover:opacity-100 text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded transition-opacity flex items-center gap-0.5">
                          <Plus className="w-2.5 h-2.5" /> Adicionar
                        </span>
                      </div>

                      {/* Event Cards inside Day Cell */}
                      <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
                        {dayEvents.slice(0, 3).map((ev) => {
                          const style = STEP_COLORS[ev.step_code] || STEP_COLORS['OUTRO'];
                          const isConcluido = ev.status === 'concluido';
                          const isAtrasado = ev.status === 'atrasado';

                          return (
                            <div
                              key={ev.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedEvent(ev);
                                setAnimalsWorked(ev.animals_worked_count?.toString() || '');
                                setLossesCount(ev.losses_count?.toString() || '0');
                              }}
                              className={`px-2 py-1 rounded-lg border text-[11px] font-medium transition-all cursor-pointer flex items-center justify-between gap-1 shadow-sm ${
                                isConcluido
                                  ? 'bg-slate-900/80 border-slate-800 text-slate-400 line-through opacity-75'
                                  : isAtrasado
                                  ? 'bg-rose-950/40 border-rose-500/40 text-rose-300 hover:bg-rose-900/40'
                                  : `${style.bg} ${style.border} ${style.text}`
                              }`}
                              title={`${ev.step_code} - ${ev.iatf_lots?.code} (${ev.responsible_name || 'Sem responsável'})`}
                            >
                              <div className="flex items-center gap-1.5 truncate">
                                <span className={`px-1 rounded text-[9px] font-bold ${style.badge}`}>
                                  {ev.step_code}
                                </span>
                                <span className="truncate font-semibold text-white">
                                  {ev.iatf_lots?.code || 'Manejo'}
                                </span>
                              </div>

                              {isConcluido ? (
                                <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                              ) : isAtrasado ? (
                                <AlertCircle className="w-3 h-3 text-rose-400 shrink-0" />
                              ) : ev.start_time ? (
                                <span className="text-[9px] text-slate-400 font-mono shrink-0">
                                  {ev.start_time.slice(0, 5)}
                                </span>
                              ) : null}
                            </div>
                          );
                        })}

                        {/* More events indicator */}
                        {dayEvents.length > 3 && (
                          <div 
                            onClick={(e) => {
                              e.stopPropagation();
                              setCurrentDate(d.date);
                              setView('day');
                            }}
                            className="text-[10px] font-bold text-emerald-400 hover:underline px-1 cursor-pointer"
                          >
                            +{dayEvents.length - 3} mais manejos
                          </div>
                        )}
                      </div>

                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* VIEW: WEEK */}
          {/* ========================================================================= */}
          {view === 'week' && (
            <div className="flex-1 flex flex-col">
              {/* Header Days of the Week */}
              <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-slate-800 bg-slate-900/80">
                <div className="p-3 text-center text-xs font-bold text-slate-500 border-r border-slate-800">
                  GMT-03
                </div>
                {weekGridDays.map((wd, i) => (
                  <div 
                    key={i} 
                    onClick={() => { setCurrentDate(wd.date); setView('day'); }}
                    className="p-3 text-center border-r border-slate-800 cursor-pointer hover:bg-slate-850 transition-colors"
                  >
                    <div className="text-[11px] font-semibold text-slate-400">{wd.dayName}</div>
                    <div className={`text-lg font-extrabold w-8 h-8 rounded-full flex items-center justify-center mx-auto mt-0.5 ${
                      wd.isToday ? 'bg-emerald-500 text-slate-950 shadow-md' : 'text-slate-200'
                    }`}>
                      {wd.dayNum}
                    </div>
                  </div>
                ))}
              </div>

              {/* Time Slots Grid */}
              <div className="flex-1 overflow-y-auto">
                <div className="grid grid-cols-[60px_repeat(7,1fr)] auto-rows-15">
                  {HOURS.map((hour) => {
                    const hourStr = `${String(hour).padStart(2, '0')}:00`;
                    return (
                      <div key={hour} className="contents">
                        {/* Hour Label */}
                        <div className="border-b border-r border-slate-800/80 text-[11px] text-slate-500 font-mono pr-2 text-right pt-2 select-none">
                          {hourStr}
                        </div>

                        {/* Day Slots */}
                        {weekGridDays.map((wd, i) => {
                          const slotEvents = (eventsByDate[wd.dateStr] || []).filter(ev => {
                            if (!ev.start_time) return hour === 8;
                            const evHour = parseInt(ev.start_time.split(':')[0]);
                            return evHour === hour;
                          });

                          return (
                            <div
                              key={i}
                              onClick={() => openCreateForDate(wd.dateStr, hourStr)}
                              className="border-b border-r border-slate-800/60 p-1 hover:bg-slate-900/40 transition-colors relative group cursor-pointer"
                            >
                              {slotEvents.map(ev => {
                                const style = STEP_COLORS[ev.step_code] || STEP_COLORS['OUTRO'];
                                return (
                                  <div
                                    key={ev.id}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedEvent(ev);
                                      setAnimalsWorked(ev.animals_worked_count?.toString() || '');
                                      setLossesCount(ev.losses_count?.toString() || '0');
                                    }}
                                    className={`p-1.5 rounded-lg border text-xs font-semibold cursor-pointer shadow-sm truncate ${style.bg} ${style.border} ${style.text}`}
                                  >
                                    <div className="flex items-center gap-1">
                                      <span className={`px-1 rounded text-[9px] font-bold ${style.badge}`}>{ev.step_code}</span>
                                      <span className="truncate">{ev.iatf_lots?.code}</span>
                                    </div>
                                    <div className="text-[10px] text-slate-300 truncate mt-0.5">
                                      {ev.step_name || ev.responsible_name}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* VIEW: DAY */}
          {/* ========================================================================= */}
          {view === 'day' && (
            <div className="flex-1 flex flex-col">
              {/* Day Header */}
              <div className="p-4 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <span className="px-3 py-1 rounded-xl bg-emerald-500 text-slate-950 font-black text-sm">
                      {currentDate.getDate()}
                    </span>
                    {WEEKDAY_NAMES_SHORT[currentDate.getDay()]} — {currentDate.toLocaleDateString('pt-BR', { dateStyle: 'long' })}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {eventsByDate[currentDate.toISOString().split('T')[0]]?.length || 0} manejos agendados para este dia
                  </p>
                </div>

                <button
                  onClick={() => openCreateForDate(currentDate.toISOString().split('T')[0], '08:00')}
                  className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs shadow-md transition-all"
                >
                  <Plus className="w-4 h-4 stroke-3" /> Adicionar Manejo
                </button>
              </div>

              {/* Day Time Slots */}
              <div className="flex-1 p-4 space-y-2">
                {HOURS.map((hour) => {
                  const hourStr = `${String(hour).padStart(2, '0')}:00`;
                  const d = currentDate;
                  const yyyy = d.getFullYear();
                  const mm = String(d.getMonth() + 1).padStart(2, '0');
                  const dd = String(d.getDate()).padStart(2, '0');
                  const dayStr = `${yyyy}-${mm}-${dd}`;

                  const slotEvents = (eventsByDate[dayStr] || []).filter(ev => {
                    if (!ev.start_time) return hour === 8;
                    return parseInt(ev.start_time.split(':')[0]) === hour;
                  });

                  return (
                    <div
                      key={hour}
                      onClick={() => openCreateForDate(dayStr, hourStr)}
                      className="group flex items-start gap-4 p-3 rounded-xl border border-slate-800/80 bg-slate-900/30 hover:bg-slate-900/70 hover:border-slate-700 transition-all cursor-pointer"
                    >
                      <div className="w-16 font-mono text-xs text-slate-500 font-bold pt-1">
                        {hourStr}
                      </div>

                      <div className="flex-1 flex flex-wrap gap-2">
                        {slotEvents.length === 0 ? (
                          <span className="text-xs text-slate-600 italic group-hover:text-slate-500 pt-1">
                            Disponível (clique para agendar)
                          </span>
                        ) : (
                          slotEvents.map(ev => {
                            const style = STEP_COLORS[ev.step_code] || STEP_COLORS['OUTRO'];
                            return (
                              <div
                                key={ev.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedEvent(ev);
                                  setAnimalsWorked(ev.animals_worked_count?.toString() || '');
                                  setLossesCount(ev.losses_count?.toString() || '0');
                                }}
                                className={`p-3 rounded-xl border flex-1 min-w-[280px] shadow-md transition-all ${style.bg} ${style.border}`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${style.badge}`}>
                                    {ev.step_code}
                                  </span>
                                  <p className="text-xs text-slate-300">
                                    {ev.step_name || style.label} — Resp: <strong>{ev.responsible_name}</strong>
                                  </p>
                                </div>

                                <div className="flex items-center gap-2 mt-2">
                                  {ev.status === 'concluido' ? (
                                    <span className="text-xs font-bold text-emerald-400 flex items-center gap-1 bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20">
                                      <CheckCircle2 className="w-4 h-4" /> Concluído ({ev.animals_worked_count} animais)
                                    </span>
                                  ) : (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedEvent(ev);
                                      }}
                                      className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-sm"
                                    >
                                      <Check className="w-3.5 h-3.5 stroke-3" /> Concluir
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* VIEW: LIST */}
          {/* ========================================================================= */}
          {view === 'list' && (
            <div className="flex-1 p-6 space-y-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-bold text-white">Todos os Manejos Agendados</h3>
                <span className="text-xs text-slate-400">{filteredEvents.length} registros encontrados</span>
              </div>

              {filteredEvents.length === 0 ? (
                <div className="text-center py-16 text-slate-400">
                  Nenhum manejo agendado corresponde aos filtros selecionados.
                </div>
              ) : (
                filteredEvents.map(ev => {
                  const style = STEP_COLORS[ev.step_code] || STEP_COLORS['OUTRO'];
                  return (
                    <div
                      key={ev.id}
                      onClick={() => {
                        setSelectedEvent(ev);
                        setAnimalsWorked(ev.animals_worked_count?.toString() || '');
                        setLossesCount(ev.losses_count?.toString() || '0');
                      }}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/60 hover:bg-slate-900 border-slate-800`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-sm shrink-0 ${style.badge}`}>
                          {ev.step_code}
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-white text-base">{ev.iatf_lots?.code}</span>
                            {ev.iatf_lots?.properties?.name && (
                              <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                                {ev.iatf_lots.properties.name}
                              </span>
                            )}
                            <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                              📅 {ev.planned_date} {ev.start_time ? `às ${ev.start_time.slice(0, 5)}` : ''}
                            </span>
                          </div>
                          <p className="text-xs text-slate-300 mt-1">{ev.step_name || style.label}</p>
                          <p className="text-xs text-slate-400">Responsável: {ev.responsible_name}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {ev.status === 'concluido' ? (
                          <div className="text-right">
                            <span className="text-xs text-emerald-400 font-bold block">✓ Concluído</span>
                            <span className="text-[11px] text-slate-400">{ev.animals_worked_count} animais</span>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedEvent(ev);
                            }}
                            className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-md"
                          >
                            <Check className="w-3.5 h-3.5 stroke-3" /> Concluir Manejo
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

        </main>
      </div>

      {/* ========================================================================= */}
      {/* 3. MODAL: CRIAR NOVO MANEJO / EVENTO (Direct cell click) */}
      {/* ========================================================================= */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-lg rounded-3xl border border-slate-700 bg-slate-900 p-6 space-y-5 shadow-2xl animate-in fade-in zoom-in duration-200">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                  <Plus className="w-5 h-5 stroke-3" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Agendar Novo Manejo</h3>
                  <p className="text-xs text-slate-400">Insira as informações do protocolo ou atividade de campo</p>
                </div>
              </div>
              <button 
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              
              {/* Lote */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Lote de IATF <span className="text-rose-400">*</span>
                </label>
                <select
                  value={createLotId}
                  onChange={(e) => setCreateLotId(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-700 text-white text-xs sm:text-sm px-3.5 py-2.5 rounded-xl focus:outline-none focus:border-emerald-500"
                >
                  <option value="">Selecione o Lote...</option>
                  {lots.map(l => (
                    <option key={l.id} value={l.id}>
                      {l.code} {l.property_name ? `(${l.property_name})` : ''} — {l.protocol_name || 'Protocolo Padrão'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Tipo de Manejo / Step Code */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Tipo de Manejo / Etapa <span className="text-rose-400">*</span>
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {Object.entries(STEP_COLORS).map(([code, style]) => (
                    <button
                      type="button"
                      key={code}
                      onClick={() => setCreateStepCode(code)}
                      className={`p-2 rounded-xl border text-xs font-bold transition-all flex flex-col items-center gap-1 ${
                        createStepCode === code
                          ? `${style.badge} ring-2 ring-emerald-400`
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <span>{code}</span>
                      <span className="text-[9px] font-normal truncate w-full text-center">{code === 'IA' ? 'Inseminação' : code === 'DG' ? 'Diagnóstico' : style.label.split('-')[1]?.trim() || code}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Data & Horário */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    Data Planejada <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={createDate}
                    onChange={(e) => setCreateDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-xs sm:text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    Horário Previsto
                  </label>
                  <input
                    type="time"
                    value={createTime}
                    onChange={(e) => setCreateTime(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-xs sm:text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Responsável */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Responsável / Inseminador
                </label>
                <input
                  type="text"
                  value={createResponsible}
                  onChange={(e) => setCreateResponsible(e.target.value)}
                  placeholder="Ex: Dr. Roberto / Equipe Fazenda"
                  className="w-full bg-slate-950 border border-slate-700 text-white text-xs sm:text-sm px-3.5 py-2.5 rounded-xl focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Observações */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Observações / Recomendações
                </label>
                <textarea
                  rows={2}
                  value={createNotes}
                  onChange={(e) => setCreateNotes(e.target.value)}
                  placeholder="Ex: Separar vacas com ECC baixo, checar botijão..."
                  className="w-full bg-slate-950 border border-slate-700 text-white text-xs sm:text-sm px-3.5 py-2.5 rounded-xl focus:outline-none focus:border-emerald-500 resize-none"
                />
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold px-4 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg"
                >
                  {creating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 stroke-3" />}
                  Confirmar Agendamento
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. MODAL: DETALHES & CONCLUIR MANEJO */}
      {/* ========================================================================= */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-md rounded-3xl border border-slate-700 bg-slate-900 p-6 space-y-5 shadow-2xl animate-in fade-in zoom-in duration-200">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm ${
                  STEP_COLORS[selectedEvent.step_code]?.badge || 'bg-emerald-500 text-slate-950'
                }`}>
                  {selectedEvent.step_code}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">{selectedEvent.iatf_lots?.code}</h3>
                  <p className="text-xs text-slate-400">{selectedEvent.step_name || STEP_COLORS[selectedEvent.step_code]?.label}</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedEvent(null)}
                className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Info Summary */}
            <div className="bg-slate-950 rounded-2xl border border-slate-800 p-3.5 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Data Planejada:</span>
                <span className="font-bold text-slate-200">{selectedEvent.planned_date} {selectedEvent.start_time ? `às ${selectedEvent.start_time.slice(0, 5)}` : ''}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Responsável:</span>
                <span className="font-bold text-slate-200">{selectedEvent.responsible_name || 'Não informado'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Status:</span>
                <span className={`font-bold capitalize ${
                  selectedEvent.status === 'concluido' ? 'text-emerald-400' : selectedEvent.status === 'atrasado' ? 'text-rose-400' : 'text-amber-400'
                }`}>
                  {selectedEvent.status}
                </span>
              </div>
              {selectedEvent.notes && (
                <div className="pt-2 border-t border-slate-800 text-slate-400">
                  <strong>Observação:</strong> {selectedEvent.notes}
                </div>
              )}
            </div>

            {/* Complete Section */}
            {selectedEvent.status !== 'concluido' ? (
              <div className="space-y-3 pt-1">
                <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Registrar Execução do Manejo</h4>
                
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                    Animais Trabalhados no Tronco <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={animalsWorked}
                    onChange={(e) => setAnimalsWorked(e.target.value)}
                    placeholder="Ex: 120"
                    className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3.5 py-2.5 rounded-xl focus:outline-none focus:border-emerald-500 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                    Perdas de Dispositivos / Implantes
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={lossesCount}
                    onChange={(e) => setLossesCount(e.target.value)}
                    placeholder="0"
                    className="w-full bg-slate-950 border border-slate-700 text-white text-sm px-3.5 py-2.5 rounded-xl focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handleCompleteSubmit}
                    disabled={!animalsWorked || completing}
                    className="flex-1 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold px-4 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg"
                  >
                    {completing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 stroke-3" />}
                    Concluir Manejo
                  </button>

                  <button
                    onClick={() => handleDeleteEvent(selectedEvent.id)}
                    className="p-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-colors"
                    title="Excluir Manejo"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-2xl text-center space-y-1">
                  <span className="text-xs text-emerald-400 font-bold flex items-center justify-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" /> Manejo Executado com Sucesso
                  </span>
                  <p className="text-2xl font-black text-white">{selectedEvent.animals_worked_count} animais</p>
                  {selectedEvent.losses_count > 0 && (
                    <p className="text-xs text-amber-400">{selectedEvent.losses_count} perdas registradas</p>
                  )}
                  {selectedEvent.execution_date && (
                    <p className="text-[11px] text-slate-500">Executado em: {selectedEvent.execution_date}</p>
                  )}
                </div>

                <button
                  onClick={() => setSelectedEvent(null)}
                  className="w-full py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:text-white text-xs font-semibold"
                >
                  Fechar
                </button>
              </div>
            )}

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. TOAST NOTIFICATION (BOTTOM BAR) */}
      {/* ========================================================================= */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 border border-emerald-500/40 text-emerald-400 px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 text-xs font-bold animate-in fade-in slide-in-from-bottom-3 duration-200">
          <CheckCircle2 className="w-4 h-4" />
          <span>{toastMessage}</span>
        </div>
      )}

    </div>
  );
}
