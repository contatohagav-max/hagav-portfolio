'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  Ban,
  Bell,
  CheckCheck,
  ExternalLink,
  GitBranch,
  Handshake,
  Inbox,
  Instagram,
  Mail,
  MessageCircle,
  Radar,
  RefreshCw,
  Search,
  Send,
  ThumbsUp,
  UserCheck,
  XCircle,
} from 'lucide-react';
import Modal from '@/components/ui/Modal';
import EmptyState from '@/components/ui/EmptyState';
import AprovacaoView from '@/components/prospeccao/AprovacaoView';
import EncanamentoView from '@/components/prospeccao/EncanamentoView';
import RadarView from '@/components/prospeccao/RadarView';
import { ChanceBadge, FatoresChance, QuadranteTag } from '@/components/prospeccao/ChanceBadge';
import PerfilPreview from '@/components/prospeccao/PerfilPreview';
import { calcularChance, ordenarPorChance } from '@/lib/prospeccao-chance';
import { useAuth } from '@/context/AuthContext';
import { classNames, fmtDateTime, fmtPercent, fmtRelative } from '@/lib/utils';
import {
  CLASSIFICACAO_LABELS,
  MOMENTO_LABELS,
  PROSPECT_STATUS_COLORS,
  PROSPECT_STATUS_LABELS,
  PROSPECT_TABS,
  CLASSIFICACOES_RESPOSTA,
  convertProspectToLead,
  fetchAutomationRuns,
  fetchDrafts,
  fetchNotifications,
  fetchProspectById,
  fetchProspectMessages,
  fetchProspectMetrics,
  fetchProspectStatusCounts,
  fetchProspects,
  markNotificationsRead,
  registerReply,
  suppressProspect,
  updateProspect,
} from '@/lib/prospeccao-repository';

const SERVICE_OPTIONS = [
  'Reels / Shorts / TikTok',
  'Criativo para Ads',
  'YouTube',
  'Podcast',
  'VSL',
  'Institucional',
  'Motion / Legendas',
  'Outro',
];

const RUN_TIPO_LABELS = {
  prospeccao: 'Prospecção',
  envio: 'Envio de mensagens',
  respostas: 'Leitura de respostas',
  financeiro_import: 'Importação financeira',
  resumo_diario: 'Resumo do dia',
};

const RUN_STATUS_COLORS = {
  rodando: 'text-blue-300',
  ok: 'text-emerald-300',
  parcial: 'text-amber-300',
  erro: 'text-red-300',
};

function StatusPill({ status }) {
  return (
    <span className={classNames(
      'inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-medium whitespace-nowrap',
      PROSPECT_STATUS_COLORS[status] || 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
    )}>
      {PROSPECT_STATUS_LABELS[status] || status}
    </span>
  );
}

function Kpi({ icon: Icon, label, value, hint, highlight = false }) {
  return (
    <div className={classNames('hcard p-4', highlight && 'border-hagav-gold/40')}>
      <div className="flex items-center gap-2 text-hagav-gray text-xs uppercase tracking-wider">
        <Icon size={13} className={highlight ? 'text-hagav-gold' : 'text-hagav-gray'} /> {label}
      </div>
      <p className={classNames('text-2xl font-bold mt-2', highlight ? 'text-hagav-gold' : 'text-hagav-white')}>{value}</p>
      {hint && <p className="text-[11px] text-hagav-gray mt-1">{hint}</p>}
    </div>
  );
}

function contactLine(prospect) {
  if (prospect.instagram) return `@${prospect.instagram}`;
  if (prospect.email) return prospect.email;
  return prospect.site || '—';
}

function nextStepText(prospect) {
  switch (prospect.status) {
    case 'quer_conversar': return 'Equipe: assumir a conversa';
    case 'em_conversa': return prospect.responsavel ? `Com ${prospect.responsavel}` : 'Equipe conversando';
    case 'respondeu': return 'Automação vai responder';
    case 'em_sequencia': return prospect.proximo_contato_em ? `Follow-up ${fmtRelative(prospect.proximo_contato_em)}` : 'Aguardando resposta';
    case 'novo': return 'Aguardando primeiro envio';
    case 'nao_agora': return prospect.proximo_contato_em ? `Retomar ${fmtRelative(prospect.proximo_contato_em)}` : 'Retomar depois';
    default: return '—';
  }
}

function ProspectsTable({ prospects, onSelect }) {
  return (
    <div className="hcard p-0 overflow-x-auto">
      <table className="htable min-w-[860px]">
        <thead>
          <tr>
            <th>Prospect</th>
            <th>Contato</th>
            <th>Chance</th>
            <th>Momento</th>
            <th>Status</th>
            <th>Último contato</th>
            <th>Próximo passo</th>
          </tr>
        </thead>
        <tbody>
          {prospects.map((prospect) => (
            <tr key={prospect.id} onClick={() => onSelect(prospect)}>
              <td>
                <p className="font-medium text-hagav-white">{prospect.nome}</p>
                <p className="text-[11px] text-hagav-gray">
                  {[prospect.perfil, prospect.nicho, prospect.empresa].filter(Boolean).join(' · ') || '—'}
                </p>
              </td>
              <td className="text-xs">{contactLine(prospect)}</td>
              <td><ChanceBadge info={calcularChance(prospect)} /></td>
              <td className="text-xs">{MOMENTO_LABELS[prospect.momento] || prospect.momento || '—'}</td>
              <td><StatusPill status={prospect.status} /></td>
              <td className="text-xs">{prospect.ultimo_contato_em ? fmtRelative(prospect.ultimo_contato_em) : '—'}</td>
              <td className="text-xs text-hagav-gray">{nextStepText(prospect)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MessageItem({ message }) {
  const [open, setOpen] = useState(message.direcao === 'entrada');
  const inbound = message.direcao === 'entrada';
  return (
    <div className={classNames(
      'rounded-xl border p-3',
      inbound ? 'border-hagav-gold/30 bg-hagav-gold/5' : 'border-hagav-border bg-hagav-surface',
    )}>
      <button type="button" className="w-full flex items-start justify-between gap-3 text-left" onClick={() => setOpen((v) => !v)}>
        <div className="flex items-start gap-2 min-w-0">
          {inbound
            ? <ArrowDownLeft size={14} className="text-hagav-gold mt-0.5 shrink-0" />
            : <ArrowUpRight size={14} className="text-hagav-gray mt-0.5 shrink-0" />}
          <div className="min-w-0">
            <p className="text-xs font-medium text-hagav-white truncate">
              {inbound ? 'Resposta recebida' : `Mensagem ${message.etapa}`}
              {message.assunto ? ` · ${message.assunto}` : ''}
            </p>
            <p className="text-[11px] text-hagav-gray">
              {message.canal} · {message.status}
              {message.classificacao ? ` · ${CLASSIFICACAO_LABELS[message.classificacao] || message.classificacao}` : ''}
            </p>
          </div>
        </div>
        <span className="text-[11px] text-hagav-gray whitespace-nowrap">
          {fmtDateTime(message.recebido_em || message.enviado_em || message.agendado_para || message.created_at)}
        </span>
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {message.resumo && <p className="text-xs text-hagav-gold">{message.resumo}</p>}
          <p className="text-xs text-hagav-light whitespace-pre-wrap leading-relaxed">{message.corpo}</p>
          {message.erro && <p className="text-[11px] text-red-300">{message.erro}</p>}
        </div>
      )}
    </div>
  );
}

function ProspectDrawer({ prospect, canManage, actorEmail, onClose, onUpdated }) {
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [notas, setNotas] = useState(prospect.notas || '');
  const [showConvert, setShowConvert] = useState(false);
  const [whatsapp, setWhatsapp] = useState(prospect.whatsapp || '');
  const [servico, setServico] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [registrando, setRegistrando] = useState(false);
  const [resposta, setResposta] = useState('');
  const [canalResposta, setCanalResposta] = useState(prospect.canal === 'email' ? 'email' : 'instagram');

  useEffect(() => {
    let active = true;
    setLoadingMessages(true);
    fetchProspectMessages(prospect.id)
      .then((rows) => { if (active) setMessages(rows); })
      .catch(() => { if (active) setMessages([]); })
      .finally(() => { if (active) setLoadingMessages(false); });
    markNotificationsRead({ prospectId: prospect.id }).catch(() => null);
    return () => { active = false; };
  }, [prospect.id]);

  async function run(action, successMessage) {
    setBusy(true);
    setError('');
    try {
      const updated = await action();
      onUpdated(updated, successMessage);
    } catch (err) {
      setError(err?.message || 'Não foi possível salvar.');
    } finally {
      setBusy(false);
    }
  }

  const assumir = () => run(
    () => updateProspect(prospect.id, { status: 'em_conversa', responsavel: actorEmail || prospect.responsavel }),
    'Conversa assumida. A automação parou de enviar mensagens para esse contato.',
  );
  const descartar = () => run(() => updateProspect(prospect.id, { status: 'descartado' }), 'Prospect descartado.');
  const semInteresse = () => run(() => updateProspect(prospect.id, { status: 'sem_interesse' }), 'Marcado como sem interesse.');
  const naoContatar = () => {
    if (!window.confirm('Esse contato nunca mais vai receber mensagens da automação. Confirmar?')) return;
    run(() => suppressProspect(prospect), 'Contato bloqueado para sempre.');
  };
  const salvarNotas = () => run(() => updateProspect(prospect.id, { notas: notas.trim() || null }), 'Notas salvas.');
  const registrar = (classificacao) => run(
    () => registerReply(prospect, { texto: resposta, classificacao, canal: canalResposta }),
    classificacao === 'interessado'
      ? 'Resposta registrada: foi para "Querem conversar". Os follow-ups automáticos pararam.'
      : 'Resposta registrada. Os follow-ups automáticos pararam.',
  );
  const podeRegistrarResposta = ['novo', 'em_sequencia', 'nao_agora', 'sem_resposta', 'respondeu'].includes(prospect.status);
  const converter = () => {
    const digits = whatsapp.replace(/\D/g, '');
    if (digits.length < 10) {
      setError('Informe o WhatsApp com DDD para criar o lead.');
      return;
    }
    if (!servico) {
      setError('Escolha o serviço de interesse.');
      return;
    }
    run(async () => {
      const result = await convertProspectToLead(prospect, { whatsapp: digits, servico, responsavel: actorEmail });
      return result.prospect;
    }, 'Lead criado no CRM. Ele já aparece em Leads como qualificado.');
  };

  const sinais = prospect.sinais && typeof prospect.sinais === 'object' ? Object.entries(prospect.sinais) : [];
  const chanceInfo = useMemo(() => calcularChance(prospect), [prospect]);
  const closed = ['convertido', 'descadastrado', 'descartado'].includes(prospect.status);

  return (
    <Modal open onClose={onClose} title={prospect.nome} width="max-w-3xl">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={prospect.status} />
          <ChanceBadge info={chanceInfo} />
          <QuadranteTag info={chanceInfo} />
          {prospect.momento && (
            <span className="text-[11px] px-2 py-0.5 rounded-full border border-hagav-border text-hagav-light">
              {MOMENTO_LABELS[prospect.momento] || prospect.momento}
            </span>
          )}
          {prospect.fonte && <span className="text-[11px] text-hagav-gray">Fonte: {prospect.fonte}</span>}
          {prospect.fonte_url && (
            <a href={prospect.fonte_url} target="_blank" rel="noreferrer" className="text-[11px] text-hagav-gold inline-flex items-center gap-1">
              ver origem <ExternalLink size={11} />
            </a>
          )}
        </div>

        {(prospect.ultima_resposta || prospect.resumo_resposta) && (
          <div className="rounded-xl border border-hagav-gold/40 bg-hagav-gold/5 p-4">
            <p className="text-[11px] uppercase tracking-wider text-hagav-gold mb-1">Última resposta {prospect.respondeu_em ? `· ${fmtRelative(prospect.respondeu_em)}` : ''}</p>
            {prospect.resumo_resposta && <p className="text-sm text-hagav-white mb-2">{prospect.resumo_resposta}</p>}
            {prospect.ultima_resposta && <p className="text-xs text-hagav-light whitespace-pre-wrap">{prospect.ultima_resposta}</p>}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-wider text-hagav-gray">Por que é um bom cliente</p>
            <p className="text-sm text-hagav-light whitespace-pre-wrap">{prospect.resumo || '—'}</p>
            <FatoresChance info={chanceInfo} />
          </div>
          <div className="space-y-2 text-sm">
            <p className="text-[11px] uppercase tracking-wider text-hagav-gray">Contato</p>
            {prospect.email && (
              <a className="flex items-center gap-2 text-hagav-light hover:text-hagav-gold" href={`mailto:${prospect.email}`}>
                <Mail size={13} /> {prospect.email}
              </a>
            )}
            {prospect.instagram && (
              <a className="flex items-center gap-2 text-hagav-light hover:text-hagav-gold" href={`https://instagram.com/${prospect.instagram}`} target="_blank" rel="noreferrer">
                <Instagram size={13} /> @{prospect.instagram}
                {prospect.seguidores ? <span className="text-hagav-gray text-xs">({Number(prospect.seguidores).toLocaleString('pt-BR')} seguidores)</span> : null}
              </a>
            )}
            {prospect.whatsapp && (
              <a className="flex items-center gap-2 text-hagav-light hover:text-hagav-gold" href={`https://wa.me/${prospect.whatsapp.startsWith('55') ? prospect.whatsapp : `55${prospect.whatsapp}`}`} target="_blank" rel="noreferrer">
                <MessageCircle size={13} /> {prospect.whatsapp}
              </a>
            )}
            {prospect.site && (
              <a className="flex items-center gap-2 text-hagav-light hover:text-hagav-gold" href={/^https?:/.test(prospect.site) ? prospect.site : `https://${prospect.site}`} target="_blank" rel="noreferrer">
                <ExternalLink size={13} /> {prospect.site}
              </a>
            )}
            {[prospect.perfil, prospect.nicho, prospect.empresa].filter(Boolean).length > 0 && (
              <p className="text-xs text-hagav-gray">{[prospect.perfil, prospect.nicho, prospect.empresa].filter(Boolean).join(' · ')}</p>
            )}
          </div>
        </div>

        <div>
          <p className="text-[11px] uppercase tracking-wider text-hagav-gray mb-2">Ver perfil</p>
          <PerfilPreview prospect={prospect} />
        </div>

        {sinais.length > 0 && (
          <div>
            <p className="text-[11px] uppercase tracking-wider text-hagav-gray mb-2">Sinais encontrados</p>
            <div className="flex flex-wrap gap-2">
              {sinais.map(([key, value]) => (
                <span key={key} className="text-[11px] px-2 py-1 rounded-lg bg-hagav-surface border border-hagav-border text-hagav-light">
                  {key.replace(/_/g, ' ')}: {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                </span>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="text-[11px] uppercase tracking-wider text-hagav-gray mb-2">Histórico de mensagens</p>
          {loadingMessages ? (
            <RefreshCw size={16} className="animate-spin text-hagav-gold" />
          ) : messages.length === 0 ? (
            <p className="text-xs text-hagav-gray">Nenhuma mensagem ainda.</p>
          ) : (
            <div className="space-y-2">
              {messages.map((message) => <MessageItem key={message.id} message={message} />)}
            </div>
          )}
        </div>

        <div>
          <p className="text-[11px] uppercase tracking-wider text-hagav-gray mb-2">Notas da equipe</p>
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            className="hinput w-full"
            placeholder="Anotações sobre esse contato..."
            disabled={!canManage}
          />
          {canManage && notas !== (prospect.notas || '') && (
            <button type="button" className="btn-ghost btn-sm mt-2" onClick={salvarNotas} disabled={busy}>Salvar notas</button>
          )}
        </div>

        {canManage && podeRegistrarResposta && (
          <div className="rounded-xl border border-hagav-border bg-hagav-surface p-3">
            {!registrando ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-hagav-light">Respondeu por DM, WhatsApp ou email fora da automação? Registre aqui.</p>
                <button type="button" className="btn-gold btn-sm" onClick={() => setRegistrando(true)}>
                  <MessageCircle size={13} /> Registrar resposta
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] uppercase tracking-wider text-hagav-gray">Registrar resposta</p>
                  <select value={canalResposta} onChange={(e) => setCanalResposta(e.target.value)} className="hselect text-xs py-1" aria-label="Canal da resposta">
                    <option value="instagram">Instagram</option>
                    <option value="email">Email</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="outro">Outro</option>
                  </select>
                </div>
                <textarea
                  value={resposta}
                  onChange={(e) => setResposta(e.target.value)}
                  rows={4}
                  className="hinput w-full text-sm"
                  placeholder="Cole aqui o que a pessoa respondeu..."
                />
                <p className="text-xs text-hagav-light">O que a pessoa quer?</p>
                <div className="flex flex-wrap gap-2">
                  {CLASSIFICACOES_RESPOSTA.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      className={c.key === 'interessado' ? 'btn-gold btn-sm' : 'btn-ghost btn-sm'}
                      onClick={() => registrar(c.key)}
                      disabled={busy || !resposta.trim()}
                    >
                      {c.label}
                    </button>
                  ))}
                  <button type="button" className="btn-ghost btn-sm text-hagav-gray" onClick={() => setRegistrando(false)} disabled={busy}>Cancelar</button>
                </div>
              </div>
            )}
          </div>
        )}

        {error && <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}

        {canManage && !closed && (
          <div className="border-t border-hagav-border pt-4 space-y-3">
            {showConvert ? (
              <div className="space-y-3">
                <p className="text-sm text-hagav-white">Criar lead no CRM</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} className="hinput w-full" placeholder="WhatsApp com DDD" />
                  <select value={servico} onChange={(e) => setServico(e.target.value)} className="hselect w-full">
                    <option value="">Serviço de interesse</option>
                    {SERVICE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="btn-gold btn-sm" onClick={converter} disabled={busy}>
                    <UserCheck size={13} /> Criar lead
                  </button>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => setShowConvert(false)} disabled={busy}>Cancelar</button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {['quer_conversar', 'respondeu'].includes(prospect.status) && (
                  <button type="button" className="btn-gold btn-sm" onClick={assumir} disabled={busy}>
                    <Handshake size={13} /> Assumir conversa
                  </button>
                )}
                <button type="button" className="btn-ghost btn-sm" onClick={() => setShowConvert(true)} disabled={busy}>
                  <UserCheck size={13} /> Virar lead no CRM
                </button>
                {['quer_conversar', 'respondeu', 'em_conversa'].includes(prospect.status) && (
                  <button type="button" className="btn-ghost btn-sm" onClick={semInteresse} disabled={busy}>
                    <XCircle size={13} /> Sem interesse
                  </button>
                )}
                {['novo', 'em_sequencia', 'nao_agora', 'sem_resposta'].includes(prospect.status) && (
                  <button type="button" className="btn-ghost btn-sm" onClick={descartar} disabled={busy}>
                    <XCircle size={13} /> Descartar
                  </button>
                )}
                <button type="button" className="btn-danger btn-sm" onClick={naoContatar} disabled={busy}>
                  <Ban size={13} /> Nunca mais contatar
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

function ActivityPanel({ notifications, runs, onMarkAllRead, onOpenProspect, canManage }) {
  const unread = notifications.filter((n) => !n.lida_em).length;
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <div className="hcard">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-hagav-white flex items-center gap-2"><Bell size={14} /> Avisos {unread > 0 && <span className="text-hagav-gold">({unread} novos)</span>}</p>
          {canManage && unread > 0 && (
            <button type="button" className="btn-ghost btn-sm" onClick={onMarkAllRead}><CheckCheck size={13} /> Marcar como lidos</button>
          )}
        </div>
        {notifications.length === 0 ? (
          <p className="text-xs text-hagav-gray">Nenhum aviso ainda.</p>
        ) : (
          <div className="space-y-2">
            {notifications.map((n) => (
              <button
                type="button"
                key={n.id}
                onClick={() => n.prospect_id && onOpenProspect(n.prospect_id)}
                className={classNames(
                  'w-full text-left rounded-xl border p-3 transition-colors',
                  n.lida_em ? 'border-hagav-border bg-hagav-surface' : 'border-hagav-gold/40 bg-hagav-gold/5',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-hagav-white">{n.titulo}</p>
                  <span className="text-[11px] text-hagav-gray whitespace-nowrap">{fmtRelative(n.created_at)}</span>
                </div>
                {n.corpo && <p className="text-xs text-hagav-light mt-1 whitespace-pre-wrap line-clamp-3">{n.corpo}</p>}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="hcard">
        <p className="text-sm font-semibold text-hagav-white flex items-center gap-2 mb-3"><Activity size={14} /> O que a automação fez</p>
        {runs.length === 0 ? (
          <p className="text-xs text-hagav-gray">A automação ainda não rodou.</p>
        ) : (
          <div className="space-y-2">
            {runs.map((run) => (
              <div key={run.id} className="rounded-xl border border-hagav-border bg-hagav-surface p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-hagav-white">
                    {RUN_TIPO_LABELS[run.tipo] || run.tipo}
                    <span className={classNames('ml-2 text-[11px]', RUN_STATUS_COLORS[run.status])}>{run.status}</span>
                  </p>
                  <span className="text-[11px] text-hagav-gray whitespace-nowrap">{fmtDateTime(run.iniciado_em)}</span>
                </div>
                {run.resumo && <p className="text-xs text-hagav-light mt-1 whitespace-pre-wrap">{run.resumo}</p>}
                {run.erro && <p className="text-xs text-red-300 mt-1">{run.erro}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ProspeccaoPage() {
  const searchParams = useSearchParams();
  const { actor, can } = useAuth();
  const canRead = can('readProspeccao');
  const canManage = can('manageProspeccao');

  const [tab, setTab] = useState('quer_conversar');
  const [view, setView] = useState('lista');
  const [drafts, setDrafts] = useState([]);
  const [allProspects, setAllProspects] = useState([]);
  const [search, setSearch] = useState('');
  const [prospects, setProspects] = useState([]);
  const [counts, setCounts] = useState({});
  const [metrics, setMetrics] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [selected, setSelected] = useState(null);
  const [initialTabSet, setInitialTabSet] = useState(false);

  const activeTab = PROSPECT_TABS.find((t) => t.key === tab);

  const loadSummary = useCallback(async () => {
    const [countsData, metricsData, notificationsData, runsData, draftsData, allData] = await Promise.all([
      fetchProspectStatusCounts(),
      fetchProspectMetrics(),
      fetchNotifications(),
      fetchAutomationRuns(),
      fetchDrafts(),
      fetchProspects({ limit: 2000 }),
    ]);
    setDrafts(draftsData || []);
    setAllProspects(allData || []);
    setCounts(countsData || {});
    setMetrics(metricsData);
    setNotifications(notificationsData || []);
    setRuns(runsData || []);
    return { counts: countsData || {}, rascunhos: (draftsData || []).length };
  }, []);

  const loadList = useCallback(async () => {
    if (!activeTab) return;
    const rows = await fetchProspects({ statuses: activeTab.statuses, search: search || undefined });
    // Listas de quem ainda nao respondeu ficam na ordem da chance de fechar
    setProspects(['fila', 'em_sequencia', 'encerrados'].includes(activeTab.key) ? ordenarPorChance(rows) : rows);
  }, [activeTab, search]);

  const loadAll = useCallback(async () => {
    if (!canRead) return;
    setLoading(true);
    setLoadError('');
    try {
      const { counts: countsData, rascunhos } = await loadSummary();
      if (!initialTabSet) {
        setInitialTabSet(true);
        const firstWithItems = PROSPECT_TABS.find((t) => t.statuses.some((s) => countsData[s] > 0));
        const inicial = (countsData.quer_conversar || 0) > 0 ? 'quer_conversar' : (rascunhos > 0 ? 'aprovar' : firstWithItems?.key);
        if (inicial && inicial !== tab) {
          setTab(inicial);
          if (inicial !== 'aprovar') return;
        }
      }
      await loadList();
    } catch (err) {
      console.error('[Prospeccao]', err);
      setLoadError('Não foi possível carregar a prospecção. Confira se a migração do banco já foi aplicada.');
    } finally {
      setLoading(false);
    }
  }, [canRead, initialTabSet, loadList, loadSummary, tab]);

  useEffect(() => {
    const timer = setTimeout(loadAll, 250);
    return () => clearTimeout(timer);
  }, [loadAll]);

  // Abre um prospect direto pelo link do aviso (?id=...)
  useEffect(() => {
    const id = searchParams.get('id');
    if (!id || !canRead) return;
    fetchProspectById(id).then((row) => row && setSelected(row)).catch(() => null);
  }, [searchParams, canRead]);

  const idsComRascunho = useMemo(() => new Set(drafts.map((d) => d.prospect.id)), [drafts]);
  // "Na fila" mostra so quem ja foi aprovado; quem tem rascunho fica em "Para aprovar"
  const tabCount = useCallback((t) => {
    const total = t.statuses.reduce((sum, s) => sum + (counts[s] || 0), 0);
    return t.key === 'fila' ? Math.max(0, total - drafts.filter((d) => d.prospect.status === 'novo').length) : total;
  }, [counts, drafts]);

  const visiveis = useMemo(
    () => (tab === 'fila' ? prospects.filter((p) => !idsComRascunho.has(p.id)) : prospects),
    [tab, prospects, idsComRascunho],
  );

  function abrirAba(aba) {
    setView('lista');
    setTab(aba);
  }

  function handleDraftsChanged(message) {
    setFeedback(message || 'Salvo.');
    setTimeout(() => setFeedback(''), 4500);
    loadSummary().catch(() => null);
  }
  const unreadCount = useMemo(() => notifications.filter((n) => !n.lida_em).length, [notifications]);

  async function openProspect(id) {
    try {
      const row = await fetchProspectById(id);
      if (row) setSelected(row);
    } catch {
      setLoadError('Não foi possível abrir esse prospect.');
    }
  }

  function handleUpdated(updated, message) {
    setSelected(updated);
    setFeedback(message || 'Salvo.');
    setTimeout(() => setFeedback(''), 3500);
    loadSummary().catch(() => null);
    loadList().catch(() => null);
  }

  async function handleMarkAllRead() {
    try {
      await markNotificationsRead({ all: true });
      setNotifications((prev) => prev.map((n) => ({ ...n, lida_em: n.lida_em || new Date().toISOString() })));
    } catch {
      setLoadError('Não foi possível marcar os avisos como lidos.');
    }
  }

  if (!canRead) {
    return (
      <EmptyState icon={Radar} title="Sem acesso" description="Seu perfil não tem acesso à prospecção." />
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Prospecção</h1>
          <p className="page-subtitle">O que a automação encontrou, enviou e quem respondeu</p>
        </div>
        <div className="flex w-full sm:w-auto items-center gap-2">
          <div className="flex flex-1 sm:flex-none rounded-xl border border-hagav-border bg-hagav-surface p-0.5" role="tablist" aria-label="Forma de ver">
            {[
              { key: 'lista', label: 'Lista', curto: 'Lista', icon: Inbox },
              { key: 'encanamento', label: 'Encanamento', curto: 'Encanamento', icon: GitBranch },
              { key: 'radar', label: 'Radar de chances', curto: 'Radar', icon: Radar },
            ].map((v) => (
              <button
                key={v.key}
                type="button"
                role="tab"
                aria-selected={view === v.key}
                onClick={() => setView(v.key)}
                className={classNames(
                  'flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-[10px] text-xs whitespace-nowrap transition-colors',
                  view === v.key ? 'bg-hagav-gold/15 text-hagav-gold' : 'text-hagav-light hover:text-hagav-white',
                )}
              >
                <v.icon size={13} />
                <span className="sm:hidden">{v.curto}</span>
                <span className="hidden sm:inline">{v.label}</span>
              </button>
            ))}
          </div>
          <button onClick={loadAll} disabled={loading} className="btn-ghost btn-sm" aria-label="Atualizar">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Atualizar</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={Handshake} label="Querem conversar" value={counts.quer_conversar || 0} hint="Esperando a equipe" highlight={(counts.quer_conversar || 0) > 0} />
        <Kpi icon={Radar} label="Encontrados hoje" value={metrics?.encontradosHoje ?? '—'} hint={drafts.length ? `${drafts.length} esperando sua aprovação` : `${counts.novo || 0} na fila de envio`} highlight={drafts.length > 0 && !(counts.quer_conversar > 0)} />
        <Kpi icon={Send} label="Enviados hoje" value={metrics?.enviadosHoje ?? '—'} hint={`${counts.em_sequencia || 0} em sequência`} />
        <Kpi
          icon={Inbox}
          label="Taxa de resposta"
          value={metrics ? fmtPercent(metrics.taxaResposta30) : '—'}
          hint={metrics ? `${metrics.responderam30} de ${metrics.abordados30} nos últimos 30 dias` : ''}
        />
      </div>

      {loadError && <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{loadError}</p>}
      {feedback && <p className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">{feedback}</p>}

      {view === 'encanamento' && (
        <EncanamentoView prospects={allProspects} idsComRascunho={idsComRascunho} onAbrirAba={abrirAba} />
      )}
      {view === 'radar' && (
        <RadarView prospects={allProspects} idsComRascunho={idsComRascunho} onAbrirProspect={setSelected} />
      )}

      {view === 'lista' && (
      <>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setTab('aprovar')}
          className={classNames(
            'btn-ghost btn-sm',
            tab === 'aprovar' && 'border-hagav-gold/40 text-hagav-gold',
            drafts.length > 0 && tab !== 'aprovar' && 'border-hagav-gold/30',
          )}
        >
          <ThumbsUp size={12} /> Para aprovar
          <span className={classNames('text-[11px]', drafts.length > 0 ? 'text-hagav-gold' : 'text-hagav-gray')}>{drafts.length}</span>
        </button>
        {PROSPECT_TABS.map((t) => {
          const count = tabCount(t);
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={classNames(
                'btn-ghost btn-sm',
                active && 'border-hagav-gold/40 text-hagav-gold',
                t.key === 'quer_conversar' && count > 0 && !active && 'border-hagav-gold/30',
              )}
            >
              {t.label}
              <span className={classNames('text-[11px]', t.key === 'quer_conversar' && count > 0 ? 'text-hagav-gold' : 'text-hagav-gray')}>{count}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setTab('atividade')}
          className={classNames('btn-ghost btn-sm', tab === 'atividade' && 'border-hagav-gold/40 text-hagav-gold')}
        >
          <Bell size={12} /> Atividade
          {unreadCount > 0 && <span className="text-[11px] text-hagav-gold">{unreadCount}</span>}
        </button>
      </div>

      {tab === 'aprovar' ? (
        <AprovacaoView drafts={drafts} canManage={canManage} onChanged={handleDraftsChanged} />
      ) : tab === 'atividade' ? (
        <ActivityPanel
          notifications={notifications}
          runs={runs}
          onMarkAllRead={handleMarkAllRead}
          onOpenProspect={openProspect}
          canManage={canManage}
        />
      ) : (
        <>
          <div className="relative max-w-md">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-hagav-gray pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar nome, @, email ou nicho..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="hinput w-full pl-8 text-sm"
            />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <RefreshCw size={20} className="animate-spin text-hagav-gold" />
            </div>
          ) : visiveis.length === 0 ? (
            <EmptyState
              icon={tab === 'quer_conversar' ? Handshake : Radar}
              title={tab === 'quer_conversar' ? 'Ninguém esperando conversa agora' : 'Nada por aqui'}
              description={tab === 'quer_conversar'
                ? 'Quando alguém responder com interesse, aparece aqui e você recebe um aviso.'
                : 'A automação preenche esta lista conforme encontra e aborda novos contatos.'}
            />
          ) : (
            <ProspectsTable prospects={visiveis} onSelect={setSelected} />
          )}
        </>
      )}
      </>
      )}

      {selected && (
        <ProspectDrawer
          key={selected.id + (selected.updated_at || '')}
          prospect={selected}
          canManage={canManage}
          actorEmail={actor?.email || ''}
          onClose={() => setSelected(null)}
          onUpdated={handleUpdated}
        />
      )}
    </div>
  );
}
