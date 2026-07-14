'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Archive, Search, RefreshCw, FileText, AlertTriangle, ClipboardList, Plus, UserPlus, UsersRound } from 'lucide-react';
import OrcamentosTable from '@/components/orcamentos/OrcamentosTable';
import OrcamentoDrawer from '@/components/orcamentos/OrcamentoDrawer';
import EmptyState from '@/components/ui/EmptyState';
import EduTooltip from '@/components/ui/EduTooltip';
import Modal from '@/components/ui/Modal';
import {
  createOrcamentoClienteNovo,
  createOrcamentoFromCliente,
  fetchClientesAtivosParaOrcamento,
  fetchOrcamentos,
  updateOrcamento,
} from '@/lib/supabase';
import { ORC_STATUS_LABELS, fmtBRL } from '@/lib/utils';

const ORC_ACTIVE_STATUSES = ['orcamento', 'proposta_enviada', 'ajustando'];
const ORC_FILTER_STATUSES = ['orcamento', 'proposta_enviada', 'ajustando', 'aprovado', 'perdido'];
const UPDATE_TOOLTIP = {
  title: 'Atualizar',
  whatIs: 'Recarrega os orcamentos com os filtros aplicados.',
  purpose: 'Sincronizar negociacoes e valores em tempo real.',
  observe: 'Use antes de revisar fechamentos e pendencias.',
};
const EMPTY_NEW_CLIENT_FORM = {
  nome: '',
  whatsapp: '',
  empresa: '',
  instagram: '',
  email: '',
};

function parseDetalhes(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return { ...value };
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isUiArchived(row) {
  const detalhes = parseDetalhes(row?.detalhes);
  return Boolean(detalhes?.ui_arquivado);
}

function canArchiveOrcamento(row) {
  const status = String(row?.status_orcamento || row?.status_deal || row?.status || '').toLowerCase();
  const haystack = `${row?.nome || ''} ${row?.origem || ''} ${row?.servico || ''}`.toLowerCase();
  return ['perdido', 'cancelado'].includes(status) || haystack.includes('teste');
}

function buildArchiveDetails(row, archived) {
  const detalhes = parseDetalhes(row?.detalhes);
  if (!archived) {
    const {
      ui_arquivado,
      ui_arquivado_em,
      ui_arquivado_motivo,
      ...rest
    } = detalhes;
    return rest;
  }
  return {
    ...detalhes,
    ui_arquivado: true,
    ui_arquivado_em: new Date().toISOString(),
    ui_arquivado_motivo: 'limpeza_manual',
  };
}

function ClienteExistenteResult({ cliente, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(cliente.id)}
      className={`w-full rounded-xl border px-3 py-2.5 text-left transition-colors ${
        selected
          ? 'border-hagav-gold/60 bg-hagav-gold/10'
          : 'border-hagav-border bg-hagav-dark/40 hover:border-hagav-gold/30'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-hagav-white">{cliente.nome || 'Sem nome'}</p>
          <p className="text-xs text-hagav-gray">{cliente.empresa || 'Empresa não informada'}</p>
        </div>
        <span className="badge bg-hagav-muted/40 border-hagav-border text-hagav-light">
          {cliente.status_contrato || cliente.status_deal || cliente.status || 'ativo'}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px] text-hagav-gray">
        <span>WhatsApp: {cliente.whatsapp || '—'}</span>
        <span>Instagram: {cliente.instagram || '—'}</span>
      </div>
    </button>
  );
}

export default function OrcamentosPage() {
  const searchParams = useSearchParams();
  const [orcamentos, setOrcamentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [selected, setSelected] = useState(null);
  const [newOrcamentoOpen, setNewOrcamentoOpen] = useState(false);
  const [newOrcamentoMode, setNewOrcamentoMode] = useState('');
  const [newClientForm, setNewClientForm] = useState(EMPTY_NEW_CLIENT_FORM);
  const [clientSearch, setClientSearch] = useState('');
  const [clientResults, setClientResults] = useState([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [creatingOrcamento, setCreatingOrcamento] = useState(false);
  const [createError, setCreateError] = useState('');

  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [statusOrc, setStatusOrc] = useState(searchParams.get('status_orcamento') || '');
  const [urgencia, setUrgencia] = useState(searchParams.get('urgencia') || '');
  const [prioridade, setPrioridade] = useState(searchParams.get('prioridade') || '');
  const [incompletoOnly, setIncompletoOnly] = useState(searchParams.get('incompleto') === '1');
  const [abertosOnly, setAbertosOnly] = useState(searchParams.get('abertos') !== '0');
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    setSearch(searchParams.get('search') || '');
    setStatusOrc(searchParams.get('status_orcamento') || '');
    setUrgencia(searchParams.get('urgencia') || '');
    setPrioridade(searchParams.get('prioridade') || '');
    setIncompletoOnly(searchParams.get('incompleto') === '1');
    setAbertosOnly(searchParams.get('abertos') !== '0');
  }, [searchParams]);

  const isActiveOrcamento = useCallback((item) => {
    const statusDeal = String(item?.status_deal || '').toLowerCase();
    if (statusDeal) return ORC_ACTIVE_STATUSES.includes(statusDeal);
    const statusOrcamento = String(item?.status_orcamento || '').toLowerCase();
    return ORC_ACTIVE_STATUSES.includes(statusOrcamento);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await fetchOrcamentos({
        statusOrcamento: statusOrc || undefined,
        search: search || undefined,
        urgencia: urgencia || undefined,
        prioridade: prioridade || undefined,
        incompleto: incompletoOnly || undefined,
        limit: 800,
      });
      const visibleData = showArchived ? data : data.filter((item) => !isUiArchived(item));
      const rows = abertosOnly && !statusOrc
        ? visibleData.filter(isActiveOrcamento)
        : visibleData;
      setOrcamentos(rows);
    } catch (err) {
      console.error('[Orcamentos]', err);
      setLoadError('Não foi possível carregar os orçamentos. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, [search, statusOrc, urgencia, prioridade, incompletoOnly, abertosOnly, showArchived, isActiveOrcamento]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!newOrcamentoOpen || newOrcamentoMode !== 'existente') return undefined;
    let active = true;
    const timer = setTimeout(async () => {
      setClientsLoading(true);
      setCreateError('');
      try {
        const data = await fetchClientesAtivosParaOrcamento({
          search: clientSearch,
          limit: 600,
        });
        if (!active) return;
        setClientResults(data);
        setSelectedClientId((current) => (data.some((cliente) => cliente.id === current) ? current : ''));
      } catch (err) {
        console.error('[Orcamentos][ClientesAtivos]', err);
        if (active) setCreateError('Não foi possível carregar os clientes ativos.');
      } finally {
        if (active) setClientsLoading(false);
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [clientSearch, newOrcamentoMode, newOrcamentoOpen]);

  function handleUpdated(updated) {
    setOrcamentos((prev) => prev
      .map((item) => (item.id === updated.id ? updated : item))
      .filter((item) => (showArchived || !isUiArchived(item)))
      .filter((item) => (abertosOnly && !statusOrc ? isActiveOrcamento(item) : true)));
    if (selected?.id === updated?.id) {
      const keepOpen = (showArchived || !isUiArchived(updated))
        && !(abertosOnly && !statusOrc && !isActiveOrcamento(updated));
      setSelected(keepOpen ? updated : null);
    }
    setFeedback('Orçamento salvo com sucesso.');
    setTimeout(() => setFeedback(''), 2500);
    load();
  }

  async function handleToggleArchiveOrcamento(row, archived) {
    if (!row?.id) return;
    if (archived && !canArchiveOrcamento(row)) {
      setFeedback('Arquivamento disponível para orçamentos perdidos, cancelados ou de teste.');
      setTimeout(() => setFeedback(''), 3200);
      return;
    }
    const confirmed = archived
      ? window.confirm('Este orçamento será ocultado da lista principal, mas não será apagado. Continuar?')
      : window.confirm('Este orçamento voltará a aparecer na lista principal. Continuar?');
    if (!confirmed) return;

    try {
      const updated = await updateOrcamento(row.id, {
        detalhes: buildArchiveDetails(row, archived),
      });
      setOrcamentos((prev) => {
        const next = prev.map((item) => (item.id === updated.id ? updated : item));
        return showArchived ? next : next.filter((item) => !isUiArchived(item));
      });
      if (selected?.id === updated.id) setSelected(showArchived ? updated : null);
      setFeedback(archived ? 'Orçamento arquivado.' : 'Orçamento restaurado.');
      setTimeout(() => setFeedback(''), 2500);
      load();
    } catch (err) {
      console.error('[Orcamentos][Arquivar]', err);
      setFeedback(archived ? 'Não foi possível arquivar o orçamento.' : 'Não foi possível restaurar o orçamento.');
      setTimeout(() => setFeedback(''), 3200);
    }
  }

  function openNewOrcamentoModal() {
    setNewOrcamentoOpen(true);
    setNewOrcamentoMode('');
    setNewClientForm(EMPTY_NEW_CLIENT_FORM);
    setClientSearch('');
    setClientResults([]);
    setSelectedClientId('');
    setCreateError('');
  }

  function closeNewOrcamentoModal() {
    if (creatingOrcamento) return;
    setNewOrcamentoOpen(false);
    setNewOrcamentoMode('');
    setCreateError('');
  }

  function updateNewClientField(field, value) {
    setNewClientForm((current) => ({ ...current, [field]: value }));
  }

  async function handleCreateNewClientOrcamento() {
    if (creatingOrcamento) return;
    setCreatingOrcamento(true);
    setCreateError('');
    try {
      const created = await createOrcamentoClienteNovo(newClientForm);
      setOrcamentos((prev) => [created, ...prev.filter((item) => item.id !== created.id)]);
      setSelected(created);
      setNewOrcamentoOpen(false);
      setFeedback(`Novo orçamento criado para ${created.nome || 'cliente novo'}.`);
      setTimeout(() => setFeedback(''), 2500);
      load();
    } catch (err) {
      console.error('[Orcamentos][NovoCliente]', err);
      setCreateError(err.message || 'Não foi possível criar o orçamento.');
    } finally {
      setCreatingOrcamento(false);
    }
  }

  async function handleCreateExistingClientOrcamento() {
    if (creatingOrcamento) return;
    if (!selectedClientId) {
      setCreateError('Selecione um cliente ativo.');
      return;
    }
    setCreatingOrcamento(true);
    setCreateError('');
    try {
      const created = await createOrcamentoFromCliente(selectedClientId);
      setOrcamentos((prev) => [created, ...prev.filter((item) => item.id !== created.id)]);
      setSelected(created);
      setNewOrcamentoOpen(false);
      setFeedback(`Novo orçamento criado para ${created.nome || 'cliente selecionado'}.`);
      setTimeout(() => setFeedback(''), 2500);
      load();
    } catch (err) {
      console.error('[Orcamentos][ClienteExistente]', err);
      setCreateError(err.message || 'Não foi possível criar o orçamento.');
    } finally {
      setCreatingOrcamento(false);
    }
  }

  const totalBase = orcamentos.reduce((sum, item) => sum + Number(item.preco_base || 0), 0);
  const totalFinal = orcamentos.reduce((sum, item) => sum + Number(item.preco_final || 0), 0);
  const totalPotencial = orcamentos.reduce((sum, item) => sum + Number(item.valor_estimado || item.preco_final || item.preco_base || 0), 0);
  const urgentes = orcamentos.filter((item) => item.urgencia === 'alta').length;
  const semRevisao = orcamentos.filter((item) => item.requer_revisao).length;
  const incompletos = orcamentos.filter((item) => item.incompleto).length;

  return (
    <div className="space-y-4 md:space-y-5 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="page-title">Orçamentos</h1>
          <p className="page-subtitle">
            {loading ? 'Carregando...' : `${orcamentos.length} orcamento${orcamentos.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={openNewOrcamentoModal} className="btn-gold btn-sm">
            <Plus size={13} />
            Novo orçamento
          </button>
          <EduTooltip {...UPDATE_TOOLTIP} className="w-auto" panelClassName="left-auto right-0 translate-x-0">
            <button onClick={load} disabled={loading} className="btn-ghost btn-sm">
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              Atualizar
            </button>
          </EduTooltip>
        </div>
      </div>

      {!loading && orcamentos.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
          {[
            { label: 'Preço base', value: fmtBRL(totalBase) },
            { label: 'Preço final', value: fmtBRL(totalFinal), accent: true },
            { label: 'Potencial total', value: fmtBRL(totalPotencial) },
            { label: 'Urgentes', value: urgentes },
            { label: 'Sem revisão', value: semRevisao },
            { label: 'Incompletos', value: incompletos },
          ].map((card) => (
            <div key={card.label} className={`hcard p-3.5 md:p-4 text-center ${card.accent ? 'border-hagav-gold/30' : ''}`}>
              <p className="text-[10px] text-hagav-gray uppercase tracking-wider mb-1">{card.label}</p>
              <p className={`text-base md:text-lg font-bold ${card.accent ? 'text-hagav-gold' : 'text-hagav-white'}`}>{card.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="hcard p-3.5 md:p-4">
        <div className="grid grid-cols-1 md:grid-cols-[minmax(240px,1fr)_repeat(3,minmax(0,180px))] gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-hagav-gray pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar nome, WhatsApp, serviço, resumo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="hinput w-full pl-8 text-sm"
            />
          </div>

          <select value={statusOrc} onChange={(e) => setStatusOrc(e.target.value)} className="hselect">
            <option value="">Todos os status</option>
            {ORC_FILTER_STATUSES.map((value) => (
              <option key={value} value={value}>{ORC_STATUS_LABELS[value] || value}</option>
            ))}
          </select>

          <select value={urgencia} onChange={(e) => setUrgencia(e.target.value)} className="hselect">
            <option value="">Urgência</option>
            <option value="alta">Alta</option>
            <option value="media">Média</option>
            <option value="baixa">Baixa</option>
          </select>

          <select value={prioridade} onChange={(e) => setPrioridade(e.target.value)} className="hselect">
            <option value="">Prioridade</option>
            <option value="alta">Alta</option>
            <option value="media">Média</option>
            <option value="baixa">Baixa</option>
          </select>
        </div>

        <div className="mt-2.5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setIncompletoOnly((prev) => !prev)}
            className={`btn-ghost btn-sm ${incompletoOnly ? 'border-hagav-gold/40 text-hagav-gold' : ''}`}
          >
            <ClipboardList size={12} />
            Campos incompletos
          </button>

          <button
            type="button"
            onClick={() => setAbertosOnly((prev) => !prev)}
            className={`btn-ghost btn-sm ${abertosOnly ? 'border-hagav-gold/40 text-hagav-gold' : ''}`}
          >
            Orçamentos ativos
          </button>

          <button
            type="button"
            onClick={() => setShowArchived((prev) => !prev)}
            className={`btn-ghost btn-sm ${showArchived ? 'border-hagav-gold/40 text-hagav-gold' : ''}`}
          >
            <Archive size={12} />
            Mostrar arquivados
          </button>
        </div>
      </div>

      {loadError && (
        <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{loadError}</p>
      )}
      {feedback && (
        <p className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">{feedback}</p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw size={20} className="animate-spin text-hagav-gold" />
        </div>
      ) : orcamentos.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nenhum orcamento encontrado"
          description="Ajuste os filtros ou aguarde novos formularios chegarem."
        />
      ) : (
        <OrcamentosTable
          orcamentos={orcamentos}
          onSelect={setSelected}
          onToggleArchive={handleToggleArchiveOrcamento}
        />
      )}

      {!loading && orcamentos.length > 0 && (
        <div className="hcard p-4">
          <div className="flex items-center gap-2 mb-2 text-hagav-light text-sm font-semibold">
            <AlertTriangle size={14} className="text-yellow-300" />
            Alertas rapidos
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
            <div className="bg-hagav-surface border border-red-500/20 rounded-lg px-3 py-2 text-red-300">
              Orçamentos urgentes: {urgentes}
            </div>
            <div className="bg-hagav-surface border border-yellow-500/20 rounded-lg px-3 py-2 text-yellow-300">
              Sem revisão: {semRevisao}
            </div>
            <div className="bg-hagav-surface border border-hagav-border rounded-lg px-3 py-2 text-hagav-light">
              Campos incompletos: {incompletos}
            </div>
          </div>
        </div>
      )}

      {selected && (
        <OrcamentoDrawer
          orc={selected}
          onClose={() => setSelected(null)}
          onUpdated={handleUpdated}
        />
      )}

      <Modal
        open={newOrcamentoOpen}
        onClose={closeNewOrcamentoModal}
        title="Novo orçamento"
        width="max-w-3xl"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                setNewOrcamentoMode('novo');
                setCreateError('');
              }}
              disabled={creatingOrcamento}
              className={`rounded-xl border p-4 text-left transition-colors ${
                newOrcamentoMode === 'novo'
                  ? 'border-hagav-gold/60 bg-hagav-gold/10'
                  : 'border-hagav-border bg-hagav-dark/40 hover:border-hagav-gold/30'
              }`}
            >
              <div className="flex items-center gap-2 text-hagav-white font-semibold">
                <UserPlus size={16} className="text-hagav-gold" />
                Cliente novo
              </div>
              <p className="mt-2 text-xs text-hagav-gray">
                Cria um orçamento manual para preencher os dados cadastrais e do projeto.
              </p>
            </button>

            <button
              type="button"
              onClick={() => {
                setNewOrcamentoMode('existente');
                setCreateError('');
              }}
              disabled={creatingOrcamento}
              className={`rounded-xl border p-4 text-left transition-colors ${
                newOrcamentoMode === 'existente'
                  ? 'border-hagav-gold/60 bg-hagav-gold/10'
                  : 'border-hagav-border bg-hagav-dark/40 hover:border-hagav-gold/30'
              }`}
            >
              <div className="flex items-center gap-2 text-hagav-white font-semibold">
                <UsersRound size={16} className="text-hagav-gold" />
                Cliente existente
              </div>
              <p className="mt-2 text-xs text-hagav-gray">
                Busca um cliente ativo e cria um novo orçamento sem copiar proposta, PDF ou valores antigos.
              </p>
            </button>
          </div>

          {newOrcamentoMode === 'novo' && (
            <div className="rounded-xl border border-hagav-border bg-hagav-dark/40 p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="text-xs text-hagav-gray">
                  Nome do cliente
                  <input
                    type="text"
                    value={newClientForm.nome}
                    onChange={(e) => updateNewClientField('nome', e.target.value)}
                    className="hinput w-full mt-1.5"
                    placeholder="Nome do cliente"
                  />
                </label>
                <label className="text-xs text-hagav-gray">
                  WhatsApp
                  <input
                    type="text"
                    value={newClientForm.whatsapp}
                    onChange={(e) => updateNewClientField('whatsapp', e.target.value)}
                    className="hinput w-full mt-1.5"
                    placeholder="WhatsApp com DDD"
                  />
                </label>
                <label className="text-xs text-hagav-gray">
                  Empresa
                  <input
                    type="text"
                    value={newClientForm.empresa}
                    onChange={(e) => updateNewClientField('empresa', e.target.value)}
                    className="hinput w-full mt-1.5"
                    placeholder="Empresa ou marca"
                  />
                </label>
                <label className="text-xs text-hagav-gray">
                  Instagram
                  <input
                    type="text"
                    value={newClientForm.instagram}
                    onChange={(e) => updateNewClientField('instagram', e.target.value)}
                    className="hinput w-full mt-1.5"
                    placeholder="@instagram"
                  />
                </label>
                <label className="text-xs text-hagav-gray md:col-span-2">
                  E-mail
                  <input
                    type="email"
                    value={newClientForm.email}
                    onChange={(e) => updateNewClientField('email', e.target.value)}
                    className="hinput w-full mt-1.5"
                    placeholder="E-mail do cliente"
                  />
                </label>
              </div>
              <div className="flex justify-end">
                <button type="button" onClick={handleCreateNewClientOrcamento} disabled={creatingOrcamento} className="btn-gold btn-sm">
                  {creatingOrcamento ? 'Criando...' : 'Criar orçamento'}
                </button>
              </div>
            </div>
          )}

          {newOrcamentoMode === 'existente' && (
            <div className="rounded-xl border border-hagav-border bg-hagav-dark/40 p-4 space-y-3">
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-hagav-gray pointer-events-none" />
                <input
                  type="text"
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  className="hinput w-full pl-8"
                  placeholder="Buscar por nome, empresa, WhatsApp, Instagram ou e-mail..."
                />
              </div>

              <div className="max-h-[360px] overflow-y-auto space-y-2 pr-1">
                {clientsLoading ? (
                  <div className="flex items-center justify-center py-8 text-hagav-gray text-sm">
                    <RefreshCw size={16} className="animate-spin mr-2" />
                    Buscando clientes...
                  </div>
                ) : clientResults.length === 0 ? (
                  <p className="text-sm text-hagav-gray text-center py-8">Nenhum cliente ativo encontrado.</p>
                ) : (
                  clientResults.map((cliente) => (
                    <ClienteExistenteResult
                      key={cliente.id}
                      cliente={cliente}
                      selected={selectedClientId === cliente.id}
                      onSelect={setSelectedClientId}
                    />
                  ))
                )}
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleCreateExistingClientOrcamento}
                  disabled={creatingOrcamento || !selectedClientId}
                  className="btn-gold btn-sm"
                >
                  {creatingOrcamento ? 'Criando...' : 'Criar orçamento para cliente'}
                </button>
              </div>
            </div>
          )}

          {createError && (
            <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{createError}</p>
          )}
        </div>
      </Modal>
    </div>
  );
}
