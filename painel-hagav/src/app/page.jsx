'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Users,
  Wallet,
  CircleDollarSign,
  BadgeDollarSign,
  Percent,
  Siren,
  Clock3,
  Timer,
  RefreshCw,
  TrendingUp,
  Filter,
  Workflow,
  AlertTriangle,
  ClipboardList,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from 'recharts';
import MetricCard from '@/components/dashboard/MetricCard';
import RecentLeads from '@/components/dashboard/RecentLeads';
import HojePanel from '@/components/dashboard/HojePanel';
import EduTooltip from '@/components/ui/EduTooltip';
import { fetchDashboardMetrics } from '@/lib/supabase';
import { URGENCIA_LABELS, fmtBRL, fmtPercent, fmtHours, rotuloOrigem } from '@/lib/utils';


const EMPTY_INSIGHTS = {
  metrics: {
    leadsMes: 0,
    orcamentosAbertos: 0,
    receitaFechadaMes: 0,
    ticketMedio: 0,
    taxaConversao: 0,
    leadsUrgentes: 0,
    followupAtrasado: 0,
    tempoMedioResposta: 0,
  },
  charts: {
    origemConversao: [],
    servicosMaisPedidos: [],
    receitaPorServico: [],
    funilPipeline: [],
    leadsPorUrgencia: [],
  },
  lists: {
    ultimasEntradas: [],
    orcUrgentes: [],
    orcIncompletos: [],
    orcSemRevisao: [],
  },
};

const KPI_TOOLTIPS = {
  leads_mes: {
    title: 'Leads no mês',
    whatIs: 'Total de leads criados no mês atual.',
    purpose: 'Medir entrada de oportunidades comerciais.',
    observe: 'Compare com os dias anteriores e a origem dos leads.',
  },
  orcamentos_aberto: {
    title: 'Orçamentos em aberto',
    whatIs: 'Soma dos orçamentos ainda em negociação.',
    purpose: 'Priorizar fechamento e previsão de curto prazo.',
    observe: 'Valor alto com baixa conversão indica gargalo comercial.',
  },
  receita_fechada_mes: {
    title: 'Receita fechada no mês',
    whatIs: 'Valor total de orçamentos fechados no mês corrente.',
    purpose: 'Acompanhar faturamento efetivamente convertido.',
    observe: 'Se cair, revise volume de propostas e taxa de fechamento.',
  },
  ticket_medio: {
    title: 'Ticket médio',
    whatIs: 'Média de valor por orçamento fechado no mês.',
    purpose: 'Entender qualidade financeira das vendas.',
    observe: 'Queda constante pode sinalizar desconto excessivo.',
  },
  taxa_conversao: {
    title: 'Taxa de conversão',
    whatIs: 'Percentual de leads do mês que viraram fechado.',
    purpose: 'Medir eficiência do funil comercial.',
    observe: 'Cruze com origem, urgência e tempo de resposta.',
  },
  leads_urgentes: {
    title: 'Leads urgentes',
    whatIs: 'Quantidade de leads com urgência alta ou média.',
    purpose: 'Indicar demandas que exigem ação imediata.',
    observe: 'Priorize contato rápido para evitar perda de oportunidade.',
  },
  followup_atrasado: {
    title: 'Follow-up atrasado',
    whatIs: 'Leads abertos sem retorno dentro da janela esperada.',
    purpose: 'Evitar oportunidades esquecidas no funil.',
    observe: 'Mantenha esse número baixo com rotina diária.',
  },
  tempo_resposta_medio: {
    title: 'Tempo médio de resposta',
    whatIs: 'Tempo médio entre entrada e primeiro retorno ao lead.',
    purpose: 'Medir velocidade operacional do comercial.',
    observe: 'Quanto menor, maior chance de conversão.',
  },
};

const PIPELINE_TOOLTIPS = {
  novo: {
    title: 'Novo',
    whatIs: 'Lead recém-entrado, sem atendimento completo.',
    purpose: 'Identificar o que precisa do primeiro contato.',
    observe: 'Não deixe acumular por muito tempo.',
  },
  contatado: {
    title: 'Contatado',
    whatIs: 'Lead em contato ativo com o time comercial.',
    purpose: 'Acompanhar negociações em andamento.',
    observe: 'Valide se há próxima ação definida para cada lead.',
  },
  qualificado: {
    title: 'Qualificado',
    whatIs: 'Lead validado e pronto para gerar orçamento.',
    purpose: 'Garantir qualidade antes da fase de negociação.',
    observe: 'Use esta etapa para acionar o botão Gerar orçamento.',
  },
  proposta_enviada: {
    title: 'Proposta',
    whatIs: 'Lead que já recebeu proposta comercial.',
    purpose: 'Monitorar etapa de decisão do cliente.',
    observe: 'Foque em follow-up e prazo de retorno.',
  },
  fechado: {
    title: 'Fechado',
    whatIs: 'Negócio concluído com aceite do cliente.',
    purpose: 'Compor receita fechada e conversão do funil.',
    observe: 'Acompanhe ticket médio e serviços mais vendidos.',
  },
  perdido: {
    title: 'Perdido',
    whatIs: 'Lead que não evoluiu para fechamento.',
    purpose: 'Mapear perdas para ajustar abordagem comercial.',
    observe: 'Analise motivo e origem para reduzir recorrência.',
  },
};

const UPDATE_TOOLTIP = {
  title: 'Atualizar',
  whatIs: 'Recarrega os dados da tela com as informações mais recentes.',
  purpose: 'Garantir leitura atual antes de decidir próximo passo.',
  observe: 'Use sempre antes de revisar KPI ou mover prioridades.',
};

const CHART_TOOLTIPS = {
  origem_conversao: {
    title: 'Origem x conversão',
    whatIs: 'Compara volume de leads por origem com taxa de fechamento.',
    purpose: 'Identificar canais que trazem mais resultado comercial.',
    observe: 'Prefira origens com bom equilíbrio entre volume e conversão.',
  },
  leads_urgencia: {
    title: 'Leads por urgência',
    whatIs: 'Distribuição dos leads por nível de urgência.',
    purpose: 'Ajudar a priorizar atendimento do time.',
    observe: 'Volume alto em urgência alta pede ação imediata.',
  },
  servicos_pedidos: {
    title: 'Serviços mais pedidos',
    whatIs: 'Ranking de serviços com maior demanda no período.',
    purpose: 'Guiar foco comercial e operacional em ofertas mais recorrentes.',
    observe: 'Use para ajustar campanhas e capacidade do time.',
  },
  receita_servico: {
    title: 'Receita por serviço',
    whatIs: 'Participação de receita estimada por tipo de serviço.',
    purpose: 'Entender quais serviços sustentam o faturamento.',
    observe: 'Concentre esforço nos serviços de maior retorno.',
  },
};

function SectionHeader({ eyebrow, title, description, action }) {
  return (
    <div className="dashboard-section-head">
      <div className="min-w-0">
        {eyebrow && <p className="dashboard-section-eyebrow">{eyebrow}</p>}
        <h2 className="dashboard-section-title">{title}</h2>
        {description && <p className="dashboard-section-description">{description}</p>}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

const TOOLTIP_STYLE = { background: '#161616', border: '1px solid #2A2A2A', borderRadius: 10, fontSize: 12 };
const EIXO_CATEGORIA = { fill: '#c9c7c2', fontSize: 12 };
const CURSOR = { fill: 'rgba(255,255,255,0.04)' };
const COR_BARRA = '#F5A623';
const CORES_URGENCIA = { alta: '#d03b3b', media: '#fab219', baixa: '#77756f' };

// Barras horizontais: a altura acompanha a quantidade de categorias, para os nomes caberem inteiros.
// Rotulo ao lado da barra numa linha so (o padrao do recharts quebra o texto em espacos estreitos).
function RotuloBarra({ x, y, width, height, value }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <text x={Number(x) + Number(width) + 8} y={Number(y) + Number(height) / 2 + 4} fill="#c9c7c2" fontSize={11}>
      {value}
    </text>
  );
}

function alturaBarras(qtd) {
  return Math.max(150, qtd * 40 + 16);
}

function encurtar(texto, max = 26) {
  const t = String(texto || '');
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function compactoBRL(valor) {
  const n = Number(valor || 0);
  return n >= 1000 ? `R$ ${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : fmtBRL(n);
}

function ChartCard({ title, icon: Icon, description, tooltip, children, empty, loading }) {
  return (
    <div className="dashboard-panel dashboard-chart-card">
      <EduTooltip enabled={Boolean(tooltip)} className="w-fit" {...tooltip}>
        <div className="dashboard-panel-title-wrap">
          <div className="dashboard-panel-icon">
            <Icon size={14} className="text-hagav-gold" />
          </div>
          <div>
            <h3 className="dashboard-panel-title">{title}</h3>
            {description && (
              <p className="dashboard-panel-description">{description}</p>
            )}
          </div>
        </div>
      </EduTooltip>
      {empty ? (
        <div className="h-[220px] flex items-center justify-center text-sm text-hagav-gray">
          {loading ? 'Carregando...' : 'Sem dados suficientes ainda.'}
        </div>
      ) : (
        <div className="dashboard-chart-shell">{children}</div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [insights, setInsights] = useState(EMPTY_INSIGHTS);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await fetchDashboardMetrics();
      setInsights(data || EMPTY_INSIGHTS);
      setLastRefresh(new Date());
    } catch (err) {
      console.error('[Dashboard]', err);
      setInsights(EMPTY_INSIGHTS);
      setLoadError('Não foi possível carregar o dashboard agora. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

 const safeInsights = {
  metrics: {
    ...EMPTY_INSIGHTS.metrics,
    ...(insights?.metrics || {}),
  },
  charts: {
    ...EMPTY_INSIGHTS.charts,
    ...(insights?.charts || {}),
  },
  lists: {
    ...EMPTY_INSIGHTS.lists,
    ...(insights?.lists || {}),
  },
};

const m = safeInsights.metrics;
const charts = safeInsights.charts;
const lists = safeInsights.lists;
  const lastRefreshLabel = lastRefresh
    ? lastRefresh.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null;

  const metricCards = [
    { id: 'leads_mes', label: 'Leads no mês', value: m.leadsMes, icon: Users, onClick: () => router.push('/leads'), title: 'Abrir tela de leads' },
    { id: 'orcamentos_aberto', label: 'Orçamentos em aberto', value: fmtBRL(m.orcamentosAbertos), icon: Wallet, onClick: () => router.push('/orcamentos?abertos=1'), title: 'Abrir orçamentos em aberto' },
    { id: 'receita_fechada_mes', label: 'Receita fechada no mês', value: fmtBRL(m.receitaFechadaMes), icon: CircleDollarSign, onClick: () => router.push('/pipeline'), title: 'Abrir pipeline e revisar fechamentos' },
    { id: 'ticket_medio', label: 'Ticket médio', value: fmtBRL(m.ticketMedio), icon: BadgeDollarSign, onClick: () => router.push('/orcamentos'), title: 'Abrir tela de orçamentos' },
    { id: 'taxa_conversao', label: 'Taxa de conversão', value: fmtPercent(m.taxaConversao), icon: Percent, onClick: () => router.push('/pipeline'), title: 'Abrir pipeline' },
    { id: 'leads_urgentes', label: 'Leads urgentes', value: m.leadsUrgentes, icon: Siren, onClick: () => router.push('/leads?urgencia=alta'), title: 'Filtrar leads urgentes' },
    { id: 'followup_atrasado', label: 'Follow-up atrasado', value: m.followupAtrasado, icon: Clock3, onClick: () => router.push('/leads?followup=1'), title: 'Filtrar follow-up atrasado' },
    { id: 'tempo_resposta_medio', label: 'Tempo médio de resposta', value: fmtHours(m.tempoMedioResposta), icon: Timer, onClick: () => router.push('/leads'), title: 'Abrir leads e revisar tempos de resposta' },
  ];
  const kpisPrincipais = metricCards.slice(0, 4);
  const kpisOperacionais = metricCards.slice(4);

  const pipelineLabelMap = {
    novo: 'Novo',
    contatado: 'Contatado',
    qualificado: 'Qualificado',
    proposta_enviada: 'Proposta',
    fechado: 'Fechado',
    perdido: 'Perdido',
  };
  const pipelineFallback = [
    { status: 'novo', total: 0 },
    { status: 'contatado', total: 0 },
    { status: 'qualificado', total: 0 },
    { status: 'proposta_enviada', total: 0 },
    { status: 'fechado', total: 0 },
    { status: 'perdido', total: 0 },
  ];
  const pipelineSteps = (charts.funilPipeline?.length ? charts.funilPipeline : pipelineFallback).map((step) => ({
    ...step,
    label: pipelineLabelMap[step.status] || step.label || step.status,
  }));

  const alertCards = [
    {
      label: 'Orçamentos urgentes',
      value: lists.orcUrgentes.length,
      hint: 'Requerem priorização imediata',
      tone: 'red',
      onClick: () => router.push('/orcamentos?urgencia=alta'),
      icon: AlertTriangle,
    },
    {
      label: 'Sem revisão',
      value: lists.orcSemRevisao.length,
      hint: 'Pendentes de validação comercial',
      tone: 'yellow',
      onClick: () => router.push('/orcamentos?status_orcamento=orcamento'),
      icon: CircleDollarSign,
    },
    {
      label: 'Campos incompletos',
      value: lists.orcIncompletos.length,
      hint: 'Dados faltantes para fechar proposta',
      tone: 'neutral',
      onClick: () => router.push('/orcamentos?incompleto=1'),
      icon: ClipboardList,
    },
  ];

  const origemData = (charts.origemConversao || []).map((o) => ({
    ...o,
    rotulo: rotuloOrigem(o.origem),
    texto: `${o.leads} · ${fmtPercent(o.conversao, 0)} fecham`,
  }));
  const totalUrgencia = (charts.leadsPorUrgencia || []).reduce((a, u) => a + u.total, 0);
  const urgenciaData = totalUrgencia > 0
    ? charts.leadsPorUrgencia.map((u) => ({
      ...u,
      nome: URGENCIA_LABELS[u.urgencia] || u.urgencia,
      cor: CORES_URGENCIA[u.urgencia] || '#77756f',
      pct: (u.total / totalUrgencia) * 100,
    }))
    : [];
  const servicosData = (charts.servicosMaisPedidos || []).map((x) => ({ ...x, rotulo: encurtar(x.servico) }));
  const receitaData = (charts.receitaPorServico || [])
    .filter((x) => x.valor > 0)
    .map((x) => ({ ...x, rotulo: encurtar(x.servico), texto: compactoBRL(x.valor) }));

  return (
    <div className="dashboard-shell animate-fade-in">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">
            {lastRefreshLabel ? `Atualizado às ${lastRefreshLabel}` : 'Carregando dados...'}
          </p>
        </div>
        <EduTooltip {...UPDATE_TOOLTIP} className="w-auto" panelClassName="left-auto right-0 translate-x-0">
          <button onClick={load} disabled={loading} className="btn-ghost btn-sm">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Atualizar
          </button>
        </EduTooltip>
      </div>

      {loadError && (
        <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3.5 py-2.5">
          {loadError}
        </p>
      )}

      <HojePanel atualizarEm={lastRefreshLabel} />

      <section className="dashboard-section">
        <SectionHeader
          eyebrow="Camada estratégica"
          title="KPIs principais"
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpisPrincipais.map((card) => (
            <EduTooltip key={card.id} className="w-full h-full" {...KPI_TOOLTIPS[card.id]}>
              <MetricCard {...card} />
            </EduTooltip>
          ))}
        </div>
      </section>

      <section className="dashboard-section">
        <SectionHeader
          eyebrow="Ritmo do time"
          title="KPIs operacionais"
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpisOperacionais.map((card) => (
            <EduTooltip key={card.id} className="w-full h-full" {...KPI_TOOLTIPS[card.id]}>
              <MetricCard {...card} />
            </EduTooltip>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,2.2fr)_minmax(320px,1fr)]">
        <div className="dashboard-panel">
          <div className="dashboard-panel-title-wrap">
            <div className="dashboard-panel-icon">
              <Workflow size={14} className="text-hagav-gold" />
            </div>
            <div>
              <h3 className="dashboard-panel-title">Funil real</h3>
              <p className="dashboard-panel-description">Distribuição atual dos leads por etapa comercial</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {pipelineSteps.map((step) => (
              <EduTooltip key={step.status} {...PIPELINE_TOOLTIPS[step.status]}>
                <div className="dashboard-step-card">
                  <p className="dashboard-step-label">{step.label}</p>
                  <p className="dashboard-step-value">{step.total}</p>
                  <p className="dashboard-step-meta">Leads nesta etapa</p>
                </div>
              </EduTooltip>
            ))}
          </div>
        </div>

        <div className="dashboard-panel">
          <div className="dashboard-panel-title-wrap">
            <div className="dashboard-panel-icon">
              <AlertTriangle size={14} className="text-hagav-gold" />
            </div>
            <div>
              <h3 className="dashboard-panel-title">Alertas operacionais</h3>
              <p className="dashboard-panel-description">Pontos que exigem ação imediata do time</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 2xl:grid-cols-1">
            {alertCards.map((item) => {
              const toneClass = item.tone === 'red'
                ? 'dashboard-alert-card-red'
                : item.tone === 'yellow'
                  ? 'dashboard-alert-card-yellow'
                  : 'dashboard-alert-card-neutral';
              const Icon = item.icon;

              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={item.onClick}
                  className={`dashboard-alert-card ${toneClass}`}
                >
                  <div className="dashboard-alert-head">
                    <p className="dashboard-alert-label">{item.label}</p>
                    <Icon size={13} className="opacity-80" />
                  </div>
                  <p className="dashboard-alert-value">{item.value}</p>
                  <p className="dashboard-alert-hint">{item.hint}</p>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <RecentLeads entries={lists.ultimasEntradas || []} />

      <section className="dashboard-section">
        <SectionHeader
          eyebrow="Leitura visual"
          title="Blocos gráficos"
        />

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ChartCard
            title="Origem x conversão"
            icon={TrendingUp}
            tooltip={CHART_TOOLTIPS.origem_conversao}
            description="Quantos leads vieram de cada origem e quantos fecharam"
            empty={origemData.length === 0}
            loading={loading}
          >
            <ResponsiveContainer width="100%" height={alturaBarras(origemData.length)}>
              <BarChart data={origemData} layout="vertical" margin={{ top: 4, right: 132, left: 4, bottom: 4 }}>
                <XAxis type="number" hide allowDecimals={false} />
                <YAxis type="category" dataKey="rotulo" width={140} tick={EIXO_CATEGORIA} axisLine={false} tickLine={false} />
                <Tooltip cursor={CURSOR} contentStyle={TOOLTIP_STYLE} formatter={(v, _n, item) => [`${v} leads · ${item.payload.fechados} fecharam`, item.payload.rotulo]} labelFormatter={() => ''} />
                <Bar dataKey="leads" fill={COR_BARRA} radius={[0, 4, 4, 0]} maxBarSize={22}>
                  <LabelList dataKey="texto" content={RotuloBarra} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title="Leads por urgência"
            icon={Siren}
            tooltip={CHART_TOOLTIPS.leads_urgencia}
            description="Distribuição dos leads por prioridade de atendimento"
            empty={urgenciaData.length === 0}
            loading={loading}
          >
            <div className="space-y-3 py-2">
              {urgenciaData.map((u) => (
                <div key={u.urgencia}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 text-hagav-light">
                      <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: u.cor }} />
                      {u.nome}
                    </span>
                    <span className="text-hagav-white font-medium">{u.total} {u.total === 1 ? 'lead' : 'leads'} · {fmtPercent(u.pct, 0)}</span>
                  </div>
                  <div className="mt-1.5 h-2.5 w-full rounded-full bg-hagav-surface overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${u.pct}%`, background: u.cor }} />
                  </div>
                </div>
              ))}
            </div>
          </ChartCard>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ChartCard
            title="Serviços mais pedidos"
            icon={Filter}
            tooltip={CHART_TOOLTIPS.servicos_pedidos}
            description="Serviços com maior volume de demanda no período"
            empty={servicosData.length === 0}
            loading={loading}
          >
            <ResponsiveContainer width="100%" height={alturaBarras(servicosData.length)}>
              <BarChart data={servicosData} layout="vertical" margin={{ top: 4, right: 48, left: 4, bottom: 4 }}>
                <XAxis type="number" hide allowDecimals={false} />
                <YAxis type="category" dataKey="rotulo" width={176} tick={EIXO_CATEGORIA} axisLine={false} tickLine={false} />
                <Tooltip cursor={CURSOR} contentStyle={TOOLTIP_STYLE} formatter={(v, _n, item) => [`${v} pedido(s)`, item.payload.servico]} labelFormatter={() => ''} />
                <Bar dataKey="total" fill={COR_BARRA} radius={[0, 4, 4, 0]} maxBarSize={22}>
                  <LabelList dataKey="total" content={RotuloBarra} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title="Receita por serviço"
            icon={CircleDollarSign}
            tooltip={CHART_TOOLTIPS.receita_servico}
            description="Participação de receita estimada por serviço"
            empty={receitaData.length === 0}
            loading={loading}
          >
            <ResponsiveContainer width="100%" height={alturaBarras(receitaData.length)}>
              <BarChart data={receitaData} layout="vertical" margin={{ top: 4, right: 92, left: 4, bottom: 4 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="rotulo" width={176} tick={EIXO_CATEGORIA} axisLine={false} tickLine={false} />
                <Tooltip cursor={CURSOR} contentStyle={TOOLTIP_STYLE} formatter={(v, _n, item) => [fmtBRL(v), item.payload.servico]} labelFormatter={() => ''} />
                <Bar dataKey="valor" fill={COR_BARRA} radius={[0, 4, 4, 0]} maxBarSize={22}>
                  <LabelList dataKey="texto" content={RotuloBarra} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </section>
    </div>
  );
}


