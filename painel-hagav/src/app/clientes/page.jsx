'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  Download,
  ExternalLink,
  FileText,
  Power,
  RefreshCw,
  RotateCw,
  Search,
  Users,
} from 'lucide-react';
import Modal from '@/components/ui/Modal';
import EmptyState from '@/components/ui/EmptyState';
import EduTooltip from '@/components/ui/EduTooltip';
import {
  fetchClientesContratos,
  generateDealPdf,
  updateDeal,
} from '@/lib/supabase';
import {
  classNames,
  fmtBRL,
  fmtDate,
  fmtDateTime,
  fmtRelative,
  truncate,
} from '@/lib/utils';

const STATUS_CONTRATO_LABELS = {
  ativo: 'Ativo',
  vencido: 'Vencido',
  encerrado: 'Encerrado',
};

const STATUS_CONTRATO_COLORS = {
  ativo: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  vencido: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  encerrado: 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30',
};

const UPDATE_TOOLTIP = {
  title: 'Atualizar',
  whatIs: 'Recarrega os contratos fechados com os filtros atuais.',
  purpose: 'Garantir visao atual para renovacao e pos-venda.',
  observe: 'Use antes de acionar renovacao ou encerramento.',
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

function toIsoRenewAlert(vencimento) {
  if (!vencimento) return null;
  const date = new Date(`${vencimento}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  date.setDate(date.getDate() - 15);
  return date.toISOString();
}

function downloadPdfFromBase64(base64, fileName) {
  if (!base64) return;
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) arr[i] = bytes.charCodeAt(i);
  const blob = new Blob([arr], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName || 'contrato-hagav.pdf';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function BadgeContrato({ status }) {
  const key = String(status || '').toLowerCase();
  const label = STATUS_CONTRATO_LABELS[key] || 'Ativo';
  const color = STATUS_CONTRATO_COLORS[key] || STATUS_CONTRATO_COLORS.ativo;
  return <span className={classNames('badge', color)}>{label}</span>;
}

export default function ClientesPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [feedback, setFeedback] = useState('');

  const [search, setSearch] = useState('');
  const [statusContrato, setStatusContrato] = useState('');
  const [recorrenteFilter, setRecorrenteFilter] = useState('');
  const [renovacaoProximaOnly, setRenovacaoProximaOnly] = useState(false);

  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);
  const [valorFinal, setValorFinal] = useState('0');
  const [dataInicio, setDataInicio] = useState('');
  const [duracaoMeses, setDuracaoMeses] = useState('12');
  const [vencimento, setVencimento] = useState('');
  const [responsavel, setResponsavel] = useState('');
  const [formaPagamento, setFormaPagamento] = useState('');
  const [obsContrato, setObsContrato] = useState('');
  const [recorrente, setRecorrente] = useState(true);
  const [statusEdicao, setStatusEdicao] = useState('ativo');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await fetchClientesContratos({
        search: search || undefined,
        statusContrato: statusContrato || undefined,
        recorrente: recorrenteFilter === '' ? undefined : (recorrenteFilter === 'sim'),
        onlyRenovacaoProxima: renovacaoProximaOnly,
        limit: 1000,
      });
      setRows(data);
    } catch (err) {
      console.error('[Clientes]', err);
      setLoadError('Nao foi possivel carregar clientes/contratos agora.');
    } finally {
      setLoading(false);
    }
  }, [search, statusContrato, recorrenteFilter, renovacaoProximaOnly]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!selected) return;
    const contrato = selected?.contrato || {};
    setValorFinal(String(contrato?.valor_final || selected?.valor_contrato || 0));
    setDataInicio(String(contrato?.data_inicio || selected?.inicio_contrato || '').slice(0, 10));
    setDuracaoMeses(String(contrato?.duracao_meses || 12));
    setVencimento(String(contrato?.vencimento || selected?.vencimento_contrato || '').slice(0, 10));
    setResponsavel(String(contrato?.responsavel || selected?.responsavel_contrato || selected?.responsavel || ''));
    setFormaPagamento(String(contrato?.forma_pagamento || selected?.forma_pagamento_contrato || ''));
    setObsContrato(String(contrato?.observacoes || ''));
    setRecorrente(typeof contrato?.recorrente === 'boolean' ? contrato.recorrente : Boolean(selected?.recorrente_contrato));
    setStatusEdicao(String(contrato?.status || selected?.status_contrato || 'ativo'));
  }, [selected]);

  const metrics = useMemo(() => {
    const ativos = rows.filter((item) => item.status_contrato === 'ativo').length;
    const vencidos = rows.filter((item) => item.status_contrato === 'vencido').length;
    const encerrados = rows.filter((item) => item.status_contrato === 'encerrado').length;
    const renovacaoProxima = rows.filter((item) => item.renovacao_proxima).length;
    const receitaAtiva = rows
      .filter((item) => item.status_contrato !== 'encerrado')
      .reduce((sum, item) => sum + Number(item.valor_contrato || 0), 0);

    return {
      ativos,
      vencidos,
      encerrados,
      renovacaoProxima,
      receitaAtiva,
    };
  }, [rows]);

  async function handleGeneratePdf(row) {
    try {
      setFeedback('Gerando PDF do contrato...');
      const result = await generateDealPdf(row.id);
      if (result?.pdf_base64) {
        downloadPdfFromBase64(result.pdf_base64, result.fileName || `contrato-${row.id}.pdf`);
      }
      const linkPdf = String(result?.link_pdf || '').trim();
      if (linkPdf) {
        setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, link_pdf: linkPdf } : item)));
        if (selected?.id === row.id) setSelected((prev) => ({ ...prev, link_pdf: linkPdf }));
      }
      setFeedback(linkPdf ? 'PDF gerado e link atualizado.' : 'PDF gerado para download local.');
      setTimeout(() => setFeedback(''), 3000);
    } catch (err) {
      console.error('[Clientes][PDF]', err);
      setFeedback(err.message || 'Falha ao gerar PDF.');
      setTimeout(() => setFeedback(''), 3200);
    }
  }

  async function handleSaveContrato(statusOverride) {
    if (!selected) return;

    const valor = Number(valorFinal);
    if (!Number.isFinite(valor) || valor <= 0) {
      setFeedback('Informe um valor final valido.');
      return;
    }

    if (!dataInicio || !duracaoMeses || !vencimento || !responsavel || !formaPagamento || !obsContrato.trim()) {
      setFeedback('Preencha todos os campos obrigatorios do contrato.');
      return;
    }

    const nowIso = new Date().toISOString();
    const nextStatus = String(statusOverride || statusEdicao || 'ativo').toLowerCase();
    const detalhesAtual = parseDetalhes(selected?.detalhes);
    const contratoAtual = parseDetalhes(detalhesAtual?.contrato);
    const renovacaoAlerta = toIsoRenewAlert(vencimento);

    const detalhesContrato = {
      ...contratoAtual,
      valor_final: valor,
      data_inicio: dataInicio,
      duracao_meses: Number(duracaoMeses || 0) || null,
      vencimento,
      observacoes: obsContrato.trim(),
      responsavel: responsavel.trim(),
      forma_pagamento: formaPagamento.trim(),
      recorrente: Boolean(recorrente),
      status: nextStatus,
      atualizado_em: nowIso,
      renovacao_alerta_em: renovacaoAlerta,
      encerrado_em: nextStatus === 'encerrado' ? nowIso : null,
    };

    setSaving(true);
    try {
      const updated = await updateDeal(selected.id, {
        preco_final: valor,
        valor_fechado: valor,
        validade_ate: vencimento,
        responsavel: responsavel.trim(),
        proximo_followup_em: nextStatus === 'encerrado' ? null : renovacaoAlerta,
        detalhes: {
          ...detalhesAtual,
          contrato: detalhesContrato,
        },
      });

      setRows((prev) => prev.map((item) => (item.id === selected.id ? { ...item, ...updated } : item)));
      setSelected((prev) => ({ ...prev, ...updated }));
      setFeedback(nextStatus === 'encerrado' ? 'Contrato encerrado com sucesso.' : 'Contrato atualizado com sucesso.');
      setTimeout(() => setFeedback(''), 2800);
    } catch (err) {
      console.error('[Clientes][Save]', err);
      setFeedback(err.message || 'Falha ao atualizar contrato.');
      setTimeout(() => setFeedback(''), 3200);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-hagav-white">Clientes</h1>
          <p className="text-xs text-hagav-gray mt-0.5">
            {loading ? 'Carregando...' : `${rows.length} contrato${rows.length !== 1 ? 's' : ''} fechado${rows.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <EduTooltip {...UPDATE_TOOLTIP} className="w-auto" panelClassName="left-auto right-0 translate-x-0">
          <button onClick={load} disabled={loading} className="btn-ghost btn-sm">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Atualizar
          </button>
        </EduTooltip>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
        <div className="hcard p-4 text-center">
          <p className="text-[10px] text-hagav-gray uppercase tracking-wider mb-1">Ativos</p>
          <p className="text-lg font-bold text-emerald-300">{metrics.ativos}</p>
        </div>
        <div className="hcard p-4 text-center">
          <p className="text-[10px] text-hagav-gray uppercase tracking-wider mb-1">Vencidos</p>
          <p className="text-lg font-bold text-amber-300">{metrics.vencidos}</p>
        </div>
        <div className="hcard p-4 text-center">
          <p className="text-[10px] text-hagav-gray uppercase tracking-wider mb-1">Encerrados</p>
          <p className="text-lg font-bold text-hagav-gray">{metrics.encerrados}</p>
        </div>
        <div className="hcard p-4 text-center">
          <p className="text-[10px] text-hagav-gray uppercase tracking-wider mb-1">Renovacao proxima</p>
          <p className="text-lg font-bold text-hagav-gold">{metrics.renovacaoProxima}</p>
        </div>
        <div className="hcard p-4 text-center border-hagav-gold/30">
          <p className="text-[10px] text-hagav-gray uppercase tracking-wider mb-1">Receita ativa</p>
          <p className="text-lg font-bold text-hagav-gold">{fmtBRL(metrics.receitaAtiva)}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[240px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-hagav-gray pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar cliente, WhatsApp, servico..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="hinput w-full pl-8 text-sm"
          />
        </div>

        <select value={statusContrato} onChange={(e) => setStatusContrato(e.target.value)} className="hselect">
          <option value="">Status contrato</option>
          <option value="ativo">Ativo</option>
          <option value="vencido">Vencido</option>
          <option value="encerrado">Encerrado</option>
        </select>

        <select value={recorrenteFilter} onChange={(e) => setRecorrenteFilter(e.target.value)} className="hselect">
          <option value="">Recorrente?</option>
          <option value="sim">Sim</option>
          <option value="nao">Nao</option>
        </select>

        <button
          type="button"
          onClick={() => setRenovacaoProximaOnly((prev) => !prev)}
          className={classNames('btn-ghost btn-sm', renovacaoProximaOnly && 'border-hagav-gold/40 text-hagav-gold')}
        >
          <CalendarClock size={12} />
          So renovacao proxima
        </button>
      </div>

      {loadError && (
        <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{loadError}</p>
      )}
      {feedback && (
        <p className="text-xs text-hagav-light bg-hagav-surface border border-hagav-border rounded-lg px-3 py-2">{feedback}</p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw size={20} className="animate-spin text-hagav-gold" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum cliente fechado ainda"
          description="Assim que um orcamento for fechado com contrato, ele aparece aqui."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-hagav-border">
          <table className="htable min-w-[1300px]">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Servico/Plano</th>
                <th>Valor</th>
                <th>Inicio</th>
                <th>Vencimento</th>
                <th>Recorrente</th>
                <th>Status contrato</th>
                <th>Responsavel</th>
                <th>Renovacao</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <div>
                      <p className="font-medium text-hagav-white">{row.nome || 'Sem nome'}</p>
                      <p className="text-[11px] text-hagav-gray font-mono">{row.whatsapp || '—'}</p>
                    </div>
                  </td>
                  <td className="text-xs text-hagav-light max-w-[220px]" title={row.plano_servico || row.servico || ''}>
                    {truncate(row.plano_servico || row.servico || '—', 54)}
                  </td>
                  <td className="text-sm font-semibold text-hagav-gold">{fmtBRL(row.valor_contrato || 0)}</td>
                  <td className="text-xs text-hagav-light">{fmtDate(row.inicio_contrato)}</td>
                  <td>
                    <p className="text-xs text-hagav-light">{fmtDate(row.vencimento_contrato)}</p>
                    {Number.isFinite(row.dias_para_vencimento) && (
                      <p className="text-[11px] text-hagav-gray">{row.dias_para_vencimento} dia(s)</p>
                    )}
                  </td>
                  <td className="text-xs text-hagav-light">{row.recorrente_contrato ? 'Sim' : 'Nao'}</td>
                  <td><BadgeContrato status={row.status_contrato} /></td>
                  <td className="text-xs text-hagav-light">{row.responsavel_contrato || row.responsavel || '—'}</td>
                  <td>
                    {row.renovacao_alerta_em ? (
                      <div>
                        <p className="text-xs text-hagav-light">{fmtDateTime(row.renovacao_alerta_em)}</p>
                        <p className="text-[11px] text-hagav-gray">{fmtRelative(row.renovacao_alerta_em)}</p>
                      </div>
                    ) : (
                      <span className="text-xs text-hagav-gray">—</span>
                    )}
                  </td>
                  <td>
                    <div className="flex items-center gap-1.5">
                      <button type="button" className="btn-ghost btn-sm" onClick={() => setSelected(row)}>
                        <FileText size={12} /> Ver
                      </button>
                      <button type="button" className="btn-ghost btn-sm" onClick={() => handleGeneratePdf(row)}>
                        <Download size={12} /> PDF
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title="Contrato do cliente" width="max-w-3xl">
        {selected && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Cliente</label>
                <input type="text" value={selected.nome || ''} disabled className="hinput w-full opacity-80" />
              </div>
              <div>
                <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">WhatsApp</label>
                <input type="text" value={selected.whatsapp || ''} disabled className="hinput w-full opacity-80" />
              </div>
              <div>
                <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Valor final (R$)</label>
                <input type="number" min="0" step="0.01" value={valorFinal} onChange={(e) => setValorFinal(e.target.value)} className="hinput w-full" />
              </div>
              <div>
                <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Data inicio</label>
                <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="hinput w-full" />
              </div>
              <div>
                <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Duracao (meses)</label>
                <input type="number" min="1" step="1" value={duracaoMeses} onChange={(e) => setDuracaoMeses(e.target.value)} className="hinput w-full" />
              </div>
              <div>
                <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Vencimento</label>
                <input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} className="hinput w-full" />
              </div>
              <div>
                <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Responsavel</label>
                <input type="text" value={responsavel} onChange={(e) => setResponsavel(e.target.value)} className="hinput w-full" />
              </div>
              <div>
                <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Forma de pagamento</label>
                <input type="text" value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)} className="hinput w-full" />
              </div>
              <div>
                <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Status contrato</label>
                <select value={statusEdicao} onChange={(e) => setStatusEdicao(e.target.value)} className="hselect w-full">
                  <option value="ativo">Ativo</option>
                  <option value="vencido">Vencido</option>
                  <option value="encerrado">Encerrado</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-hagav-light self-end pb-2">
                <input
                  type="checkbox"
                  checked={recorrente}
                  onChange={(e) => setRecorrente(e.target.checked)}
                  className="rounded border-hagav-border bg-hagav-surface"
                />
                Contrato recorrente
              </label>
              <div className="md:col-span-2">
                <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Observacoes do contrato</label>
                <textarea rows={3} value={obsContrato} onChange={(e) => setObsContrato(e.target.value)} className="hinput w-full resize-none" />
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap pt-2">
              <button type="button" className="btn-gold btn-sm" onClick={() => handleSaveContrato('ativo')} disabled={saving}>
                {saving ? <RefreshCw size={12} className="animate-spin" /> : <RotateCw size={12} />}
                Renovar / Salvar
              </button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => handleSaveContrato('encerrado')} disabled={saving}>
                <Power size={12} /> Encerrar contrato
              </button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => handleGeneratePdf(selected)} disabled={saving}>
                <Download size={12} /> Gerar PDF novamente
              </button>
              {selected.link_pdf ? (
                <a href={selected.link_pdf} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">
                  <ExternalLink size={12} /> Ver contrato
                </a>
              ) : (
                <span className="text-xs text-hagav-gray">Sem link PDF salvo ainda.</span>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
