'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, UserPlus, Shield, Stethoscope, 
  Wrench, Eye, EyeOff, Search, RefreshCw, AlertCircle, 
  CheckCircle2, X, Lock, Mail, User, Sparkles
} from 'lucide-react';
import { 
  getTeamMembers, 
  createTeamMemberDirect, 
  updateTeamMemberRole, 
  toggleTeamMemberStatus, 
  type TeamMember 
} from '@/lib/db';

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  // Modal de Cadastro
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'veterinarian' | 'operator'>('operator');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Carrega membros
  const loadMembers = async () => {
    setLoading(true);
    try {
      const data = await getTeamMembers();
      setMembers(data);
    } catch (err) {
      console.error('Erro ao carregar membros:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMembers();
  }, []);

  // Gerador de senha forte aleatória
  const generatePassword = () => {
    const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%';
    let pass = '';
    for (let i = 0; i < 10; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPassword(pass);
    setShowPassword(true);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password) {
      setFeedback({ type: 'error', message: 'Preencha todos os campos obrigatórios.' });
      return;
    }

    if (password.length < 6) {
      setFeedback({ type: 'error', message: 'A senha deve conter pelo menos 6 caracteres.' });
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      const res = await createTeamMemberDirect({
        name: name.trim(),
        email: email.trim(),
        password,
        role,
      });

      if (!res.success) {
        setFeedback({ type: 'error', message: res.error || 'Erro ao cadastrar usuário.' });
        return;
      }

      setFeedback({ 
        type: 'success', 
        message: `Usuário ${name} cadastrado com sucesso! As credenciais já estão prontas para login.` 
      });
      setName('');
      setEmail('');
      setPassword('');
      setRole('operator');
      await loadMembers();
      setTimeout(() => {
        setShowAddModal(false);
        setFeedback(null);
      }, 1800);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha na comunicação.';
      setFeedback({ type: 'error', message: msg });
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (member: TeamMember) => {
    const newStatus = member.status === 'active' ? 'inactive' : 'active';
    const success = await toggleTeamMemberStatus(member.id, newStatus);
    if (success) {
      setMembers(prev => prev.map(m => m.id === member.id ? { ...m, status: newStatus } : m));
    }
  };

  const handleChangeRole = async (memberId: string, newRole: string) => {
    const success = await updateTeamMemberRole(memberId, newRole);
    if (success) {
      setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: newRole } : m));
    }
  };

  // Filtros
  const filteredMembers = useMemo(() => {
    return members.filter(m => {
      const matchSearch = 
        (m.display_name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (m.email?.toLowerCase() || '').includes(searchTerm.toLowerCase());
      const matchRole = roleFilter === 'all' || m.role === roleFilter;
      return matchSearch && matchRole;
    });
  }, [members, searchTerm, roleFilter]);

  // Estatísticas
  const stats = useMemo(() => {
    const total = members.length;
    const admins = members.filter(m => m.role === 'admin').length;
    const vets = members.filter(m => m.role === 'veterinarian').length;
    const operators = members.filter(m => m.role === 'operator').length;
    return { total, admins, vets, operators };
  }, [members]);

  const getRoleBadge = (roleName: string) => {
    switch (roleName) {
      case 'admin':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
            <Shield className="w-3 h-3" /> Administrador
          </span>
        );
      case 'veterinarian':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <Stethoscope className="w-3 h-3" /> Veterinário / RT
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Wrench className="w-3 h-3" /> Operador de Curral
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-linear-to-r from-slate-900 via-slate-800 to-emerald-950/60 p-6 rounded-2xl border border-slate-800 shadow-xl">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <Users className="w-6 h-6 text-emerald-400" />
            Gestão de Equipe & Usuários
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Cadastre novos colaboradores com senha direta para inserção de dados no curral e no escritório.
          </p>
        </div>

        <button
          onClick={() => {
            setFeedback(null);
            setShowAddModal(true);
          }}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm transition-all shadow-lg glow-emerald cursor-pointer shrink-0"
        >
          <UserPlus className="w-4 h-4 stroke-3" />
          <span>Cadastrar Novo Usuário</span>
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="glass-card p-4 rounded-2xl border border-slate-800">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Total de Usuários</span>
          <div className="text-2xl font-black text-white mt-1">{stats.total}</div>
        </div>

        <div className="glass-card p-4 rounded-2xl border border-amber-500/20">
          <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider">Administradores</span>
          <div className="text-2xl font-black text-white mt-1">{stats.admins}</div>
        </div>

        <div className="glass-card p-4 rounded-2xl border border-indigo-500/20">
          <span className="text-[11px] font-semibold text-indigo-400 uppercase tracking-wider">Veterinários / RT</span>
          <div className="text-2xl font-black text-white mt-1">{stats.vets}</div>
        </div>

        <div className="glass-card p-4 rounded-2xl border border-emerald-500/20">
          <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">Operadores</span>
          <div className="text-2xl font-black text-white mt-1">{stats.operators}</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="glass-card p-4 rounded-2xl border border-slate-800 flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por nome ou e-mail..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          {['all', 'admin', 'veterinarian', 'operator'].map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                roleFilter === r
                  ? 'bg-emerald-500 text-slate-950 shadow-sm'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {r === 'all' && 'Todos'}
              {r === 'admin' && 'Administradores'}
              {r === 'veterinarian' && 'Veterinários'}
              {r === 'operator' && 'Operadores'}
            </button>
          ))}

          <button
            onClick={loadMembers}
            className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="Atualizar lista"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Members List Table */}
      <div className="glass-card rounded-2xl border border-slate-800 overflow-hidden shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center p-12 text-slate-400 gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-emerald-400" />
            <span>Carregando membros da organização...</span>
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <Users className="w-10 h-10 mx-auto text-slate-600 opacity-60" />
            <p className="font-semibold text-sm">Nenhum usuário encontrado com os filtros aplicados.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-800/60 border-b border-slate-700/60 text-slate-400 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="px-5 py-3.5">Colaborador</th>
                  <th className="px-5 py-3.5">E-mail de Login</th>
                  <th className="px-5 py-3.5">Nível de Acesso</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredMembers.map((member) => (
                  <tr key={member.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-linear-to-tr from-emerald-600 to-teal-400 text-slate-950 font-black text-xs flex items-center justify-center shadow-xs uppercase shrink-0">
                          {(member.display_name || member.email || 'U').substring(0, 2)}
                        </div>
                        <div>
                          <p className="font-bold text-white text-sm">
                            {member.display_name || 'Sem nome'}
                          </p>
                          <span className="text-[10px] text-slate-400">
                            Cadastrado em {new Date(member.created_at).toLocaleDateString('pt-BR')}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td className="px-5 py-4 text-slate-300 font-mono">
                      {member.email}
                    </td>

                    <td className="px-5 py-4">
                      {getRoleBadge(member.role)}
                    </td>

                    <td className="px-5 py-4">
                      {member.status === 'active' ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Ativo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-400" /> Inativo
                        </span>
                      )}
                    </td>

                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/* Selector de Função Rápida */}
                        <select
                          value={member.role}
                          onChange={(e) => handleChangeRole(member.id, e.target.value)}
                          className="bg-slate-900 border border-slate-700 text-slate-300 text-xs rounded-lg px-2 py-1 focus:outline-none focus:border-emerald-500 cursor-pointer"
                        >
                          <option value="admin">Administrador</option>
                          <option value="veterinarian">Veterinário / RT</option>
                          <option value="operator">Operador de Curral</option>
                        </select>

                        {/* Botão de Ativar / Inativar */}
                        <button
                          onClick={() => handleToggleStatus(member)}
                          className={`p-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                            member.status === 'active'
                              ? 'bg-rose-500/10 text-rose-400 border-rose-500/30 hover:bg-rose-500/20'
                              : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                          }`}
                          title={member.status === 'active' ? 'Inativar acesso' : 'Reativar acesso'}
                        >
                          {member.status === 'active' ? 'Inativar' : 'Ativar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de Cadastro de Novo Usuário */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl p-6 space-y-5 animate-in zoom-in-95">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Cadastrar Novo Usuário</h3>
                  <p className="text-xs text-slate-400">Acesso imediato à organização sem necessidade de convite</p>
                </div>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Feedback Alert */}
            {feedback && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                  feedback.type === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                }`}
              >
                {feedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{feedback.message}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Nome do Colaborador *</label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    placeholder="Ex: Dr. Carlos Eduardo ou Manoel Silveira"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">E-mail de Login *</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    placeholder="ex: colaborador@fazenda.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-300">Senha Inicial de Acesso *</label>
                  <button
                    type="button"
                    onClick={generatePassword}
                    className="text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3" /> Gerar Senha
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="Mínimo 6 caracteres"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-10 py-2.5 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="p-1.5 text-slate-400 hover:text-white absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Nível de Permissão / Cargo *</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setRole('operator')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      role === 'operator'
                        ? 'bg-emerald-500/15 border-emerald-500 text-emerald-400 font-bold shadow-xs'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Wrench className="w-4 h-4 mb-1" />
                    <p className="text-xs">Operador</p>
                    <p className="text-[10px] text-slate-500 font-normal">Manejo & Curral</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRole('veterinarian')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      role === 'veterinarian'
                        ? 'bg-indigo-500/15 border-indigo-500 text-indigo-400 font-bold shadow-xs'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Stethoscope className="w-4 h-4 mb-1" />
                    <p className="text-xs">Veterinário</p>
                    <p className="text-[10px] text-slate-500 font-normal">Técnico & DG</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRole('admin')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      role === 'admin'
                        ? 'bg-amber-500/15 border-amber-500 text-amber-400 font-bold shadow-xs'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Shield className="w-4 h-4 mb-1" />
                    <p className="text-xs">Administrador</p>
                    <p className="text-[10px] text-slate-500 font-normal">Acesso Total</p>
                  </button>
                </div>
              </div>

              {/* Dica explicativa */}
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] text-slate-400 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  O novo usuário poderá acessar a plataforma imediatamente na tela de login informando o e-mail e senha cadastrados acima.
                </span>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-700 text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-all shadow-md glow-emerald cursor-pointer disabled:opacity-50 flex items-center gap-2"
                >
                  {submitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{submitting ? 'Cadastrando...' : 'Cadastrar e Liberar Acesso'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
