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
  PieChart,
  Pie,
  Cell,
  Legend,
  ComposedChart,
  Line,
  CartesianGrid,
} from 'recharts';
import MetricCard from '@/components/dashboard/MetricCard';
import RecentLeads from '@/components/dashboard/RecentLeads';
import EduTooltip from '@/components/ui/EduTooltip';
import { fetchDashboardMetrics } from '@/lib/supabase';
import { fmtBRL, fmtPercent, fmtHours } from '@/lib/utils';

const COLORS_PIE = ['#C9A84C', '#F97316', '#22C55E', '#3B82F6', '#8B5CF6'];

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
    title: 'Leads no mes',
    whatIs: 'Total de leads criados no mes atual.',
    purpose: 'Medir entrada de oportunidades comerciais.',
    observe: 'Compare com os dias anteriores e a origem dos leads.',
  },
  orcamentos_aberto: {
    title: 'Orcamentos em aberto',
    whatIs: 'Soma dos orcamentos ainda em negociacao.',
    purpose: 'Priorizar fechamento e previsao de curto prazo.',
    observe: 'Valor alto com baixa conversao indica gargalo comercial.',
  },
  receita_fechada_mes: {
    title: 'Receita fechada no mes',
    whatIs: 'Valor total de orcamentos fechados no mes corrente.',
    purpose: 'Acompanhar faturamento efetivamente convertido.',
    observe: 'Se cair, revise volume de propostas e taxa de fechamento.',
  },
  ticket_medio: {
    title: 'Ticket medio',
    whatIs: 'Media de valor por orcamento fechado no mes.',
    purpose: 'Entender qualidade financeira das vendas.',
    observe: 'Queda constante pode sinalizar desconto excessivo.',
  },
  taxa_conversao: {
    title: 'Taxa de conversao',
    whatIs: 'Percentual de leads do mes que viraram fechado.',
    purpose: 'Medir eficiencia do funil comercial.',
    observe: 'Cruze com origem, urgencia e tempo de resposta.',
  },
  leads_urgentes: {
    title: 'Leads urgentes',
    whatIs: 'Quantidade de leads com urgencia alta ou media.',
    purpose: 'Indicar demandas que exigem acao imediata.',
    observe: 'Priorize contato rapido para evitar perda de oportunidade.',
  },
  followup_atrasado: {
    title: 'Follow-up atrasado',
    whatIs: 'Leads abertos sem retorno dentro da janela esperada.',
    purpose: 'Evitar oportunidades esquecidas no funil.',
    observe: 'Mantenha esse numero baixo com rotina diaria.',
  },
  tempo_resposta_medio: {
    title: 'Tempo medio de resposta',
    whatIs: 'Tempo medio entre entrada e primeiro retorno ao lead.',
    purpose: 'Medir velocidade operacional do comercial.',
    observe: 'Quanto menor, maior chance de conversao.',
  },
};

const PIPELINE_TOOLTIPS = {
  novo: {
    title: 'Novo',
    whatIs: 'Lead recem-entrado, sem atendimento completo.',
    purpose: 'Identificar o que precisa do primeiro contato.',
    observe: 'Nao deixe acumular por muito tempo.',
  },
  contatado: {
    title: 'Contatado',
    whatIs: 'Lead em contato ativo com o time comercial.',
    purpose: 'Acompanhar negociacoes em andamento.',
    observe: 'Valide se ha proxima acao definida para cada lead.',
  },
  qualificado: {
    title: 'Qualificado',
    whatIs: 'Lead validado e pronto para gerar orcamento.',
    purpose: 'Garantir qualidade antes da fase de negociacao.',
    observe: 'Use esta etapa para acionar o botao Gerar orcamento.',
  },
  proposta_enviada: {
    title: 'Proposta enviada',
    whatIs: 'Lead que ja recebeu proposta comercial.',
    purpose: 'Monitorar etapa de decisao do cliente.',
    observe: 'Foque em follow-up e prazo de retorno.',
  },
  fechado: {
    title: 'Fechado',
    whatIs: 'Negocio concluido com aceite do cliente.',
    purpose: 'Compor receita fechada e conversao do funil.',
    observe: 'Acompanhe ticket medio e servicos mais vendidos.',
  },
  perdido: {
    title: 'Perdido',
    whatIs: 'Lead que nao evoluiu para fechamento.',
    purpose: 'Mapear perdas para ajustar abordagem comercial.',
    observe: 'Analise motivo e origem para reduzir recorrencia.',
  },
};

const UPDATE_TOOLTIP = {
  title: 'Atualizar',
  whatIs: 'Recarrega os dados da tela com as informacoes mais recentes.',
  purpose: 'Garantir leitura atual antes de decidir proximo passo.',
  observe: 'Use sempre antes de revisar KPI ou mover prioridades.',
};

const CHART_TOOLTIPS = {
  origem_conversao: {
    title: 'Origem x conversao',
    whatIs: 'Compara volume de leads por origem com taxa de fechamento.',
    purpose: 'Identificar canais que trazem mais resultado comercial.',
    observe: 'Prefira origens com bom equilibrio entre volume e conversao.',
  },
  leads_urgencia: {
    title: 'Leads por urgencia',
    whatIs: 'Distribuicao dos leads por nivel de urgencia.',
    purpose: 'Ajudar a priorizar atendimento do time.',
    observe: 'Volume alto em urgencia alta pede acao imediata.',
  },
  servicos_pedidos: {
    title: 'Servicos mais pedidos',
    whatIs: 'Ranking de servicos com maior demanda no periodo.',
    purpose: 'Guiar foco comercial e operacional em ofertas mais recorrentes.',
    observe: 'Use para ajustar campanhas e capacidade do time.',
  },
  receita_servico: {
    title: 'Receita por servico',
    whatIs: 'Participacao de receita estimada por tipo de servico.',
    purpose: 'Entender quais servicos sustentam o faturamento.',
    observe: 'Concentre esforco nos servicos de maior retorno.',
  },
};

function ChartCard({ title, icon: Icon, description, tooltip, children, empty, loading }) {
  return (
    <div className="hcard">
      <EduTooltip enabled={Boolean(tooltip)} className="w-fit" {...tooltip}>
        <div className="inline-flex items-center gap-2 mb-1.5">
          <div className="w-8 h-8 rounded-lg bg-hagav-muted/40 border border-hagav-border flex items-center justify-center">
            <Icon size={14} className="text-hagav-gold" />
          </div>
          <h3 className="text-sm font-semibold text-hagav-white">{title}</h3>
        </div>
      </EduTooltip>
      {description && (
        <p className="text-[11px] text-hagav-gray mb-4">{description}</p>
      )}
      {empty ? (
        <div className="h-[220px] flex items-center justify-center text-sm text-hagav-gray">
          {loading ? 'Carregando...' : 'Sem dados suficientes ainda.'}
        </div>
      ) : children}
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
      setLoadError('Nao foi possivel carregar o dashboard agora. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const m = insights.metrics;
  const charts = insights.charts;
  const lists = insights.lists;

  const metricCards = [
    { id: 'leads_mes', label: 'Leads no mes', value: m.leadsMes, icon: Users, onClick: () => router.push('/leads'), title: 'Abrir tela de leads' },
    { id: 'orcamentos_aberto', label: 'Orcamentos em aberto', value: fmtBRL(m.orcamentosAbertos), icon: Wallet, onClick: () => router.push('/orcamentos?abertos=1'), title: 'Abrir orcamentos em aberto' },
    { id: 'receita_fechada_mes', label: 'Receita fechada no mes', value: fmtBRL(m.receitaFechadaMes), icon: CircleDollarSign, onClick: () => router.push('/pipeline'), title: 'Abrir pipeline e revisar fechamentos' },
    { id: 'ticket_medio', label: 'Ticket medio', value: fmtBRL(m.ticketMedio), icon: BadgeDollarSign, onClick: () => router.push('/orcamentos'), title: 'Abrir tela de orcamentos' },
    { id: 'taxa_conversao', label: 'Taxa de conversao', value: fmtPercent(m.taxaConversao), icon: Percent, onClick: () => router.push('/pipeline'), title: 'Abrir pipeline' },
    { id: 'leads_urgentes', label: 'Leads urgentes', value: m.leadsUrgentes, icon: Siren, onClick: () => router.push('/leads?urgencia=alta'), title: 'Filtrar leads urgentes' },
    { id: 'followup_atrasado', label: 'Follow-up atrasado', value: m.followupAtrasado, icon: Clock3, onClick: () => router.push('/leads?followup=1'), title: 'Filtrar follow-up atrasado' },
    { id: 'tempo_resposta_medio', label: 'Tempo medio de resposta', value: fmtHours(m.tempoMedioResposta), icon: Timer, onClick: () => router.push('/leads'), title: 'Abrir leads e revisar tempos de resposta' },
  ];
  const kpisPrincipais = metricCards.slice(0, 4);
  const kpisOperacionais = metricCards.slice(4);

  const pipelineLabelMap = {
    novo: 'Novo',
    contatado: 'Contatado',
    qualificado: 'Qualificado',
    proposta_enviada: 'Proposta enviada',
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
      label: 'Orcamentos urgentes',
      value: lists.orcUrgentes.length,
      hint: 'Requerem priorizacao imediata',
      tone: 'red',
      onClick: () => router.push('/orcamentos?urgencia=alta'),
      icon: AlertTriangle,
    },
    {
      label: 'Sem revisao',
      value: lists.orcSemRevisao.length,
      hint: 'Pendentes de validacao comercial',
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

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-hagav-white">Dashboard comercial</h1>
          <p className="text-xs text-hagav-gray mt-0.5">
            {lastRefresh ? `Atualizado as ${lastRefresh.toLocaleTimeString('pt-BR')}` : 'Carregando...'}
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
        <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {loadError}
        </p>
      )}

      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[10px] text-hagav-gray uppercase tracking-wider">Linha 1</p>
            <h2 className="text-base font-semibold text-hagav-white">KPIs principais</h2>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {kpisPrincipais.map((card) => (
            <EduTooltip key={card.id} {...KPI_TOOLTIPS[card.id]}>
              <MetricCard {...card} />
            </EduTooltip>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[10px] text-hagav-gray uppercase tracking-wider">Linha 2</p>
            <h2 className="text-base font-semibold text-hagav-white">KPIs operacionais</h2>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {kpisOperacionais.map((card) => (
            <EduTooltip key={card.id} {...KPI_TOOLTIPS[card.id]}>
              <MetricCard {...card} />
            </EduTooltip>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 2xl:grid-cols-[minmax(0,2.2fr)_minmax(320px,1fr)] gap-4">
        <div className="hcard">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-8 h-8 rounded-lg bg-hagav-muted/40 border border-hagav-border flex items-center justify-center">
              <Workflow size={14} className="text-hagav-gold" />
            </div>
            <h3 className="text-sm font-semibold text-hagav-white">Funil real</h3>
          </div>
          <p className="text-[11px] text-hagav-gray mb-4">Distribuicao atual dos leads por etapa comercial</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2">
            {pipelineSteps.map((step) => (
              <EduTooltip key={step.status} {...PIPELINE_TOOLTIPS[step.status]}>
                <div className="bg-hagav-surface border border-hagav-border rounded-lg p-3">
                  <p className="text-[10px] uppercase tracking-wider text-hagav-gray">{step.label}</p>
                  <p className="text-2xl font-bold text-hagav-white mt-1">{step.total}</p>
                </div>
              </EduTooltip>
            ))}
          </div>
        </div>

        <div className="hcard">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-8 h-8 rounded-lg bg-hagav-muted/40 border border-hagav-border flex items-center justify-center">
              <AlertTriangle size={14} className="text-hagav-gold" />
            </div>
            <h3 className="text-sm font-semibold text-hagav-white">Alertas operacionais</h3>
          </div>
          <p className="text-[11px] text-hagav-gray mb-4">Pontos que exigem acao imediata do time</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 2xl:grid-cols-1 gap-2.5">
            {alertCards.map((item) => {
              const toneClass = item.tone === 'red'
                ? 'border-red-500/25 bg-red-500/10 text-red-200'
                : item.tone === 'yellow'
                  ? 'border-yellow-500/25 bg-yellow-500/10 text-yellow-200'
                  : 'border-hagav-border bg-hagav-surface text-hagav-light';
              const Icon = item.icon;

              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={item.onClick}
                  className={`text-left rounded-lg border p-3 transition-colors hover:border-hagav-gold/30 focus:outline-none focus-visible:ring-1 focus-visible:ring-hagav-gold/35 ${toneClass}`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-[11px] uppercase tracking-wider">{item.label}</p>
                    <Icon size={13} className="opacity-80" />
                  </div>
                  <p className="text-2xl font-bold leading-none">{item.value}</p>
                  <p className="text-[11px] mt-1.5 opacity-80">{item.hint}</p>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <RecentLeads entries={lists.ultimasEntradas || []} />

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-hagav-white">Blocos graficos</h2>
          <p className="text-[11px] text-hagav-gray mt-0.5">Leitura visual de origem, urgencia, demanda e receita</p>
        </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ChartCard
          title="Origem x conversao"
          icon={TrendingUp}
          tooltip={CHART_TOOLTIPS.origem_conversao}
          description="Volume por origem e taxa media de fechamento"
          empty={charts.origemConversao.length === 0}
          loading={loading}
        >
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={charts.origemConversao} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="#202020" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="origem" tick={{ fill: '#909090', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="left" tick={{ fill: '#909090', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis yAxisId="right" orientation="right" tick={{ fill: '#909090', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#161616', border: '1px solid #2A2A2A', borderRadius: 10, fontSize: 12 }}
                formatter={(value, name) => {
                  if (name === 'conversao') return [`${Number(value).toFixed(1)}%`, 'Conversao'];
                  return [value, 'Leads'];
                }}
              />
              <Bar yAxisId="left" dataKey="leads" fill="#C9A84C" radius={[5, 5, 0, 0]} maxBarSize={34} />
              <Line yAxisId="right" type="monotone" dataKey="conversao" stroke="#3B82F6" strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Leads por urgencia"
          icon={Siren}
          tooltip={CHART_TOOLTIPS.leads_urgencia}
          description="Distribuicao dos leads por prioridade de atendimento"
          empty={charts.leadsPorUrgencia.length === 0}
          loading={loading}
        >
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={charts.leadsPorUrgencia}
                dataKey="total"
                nameKey="urgencia"
                cx="50%"
                cy="50%"
                outerRadius={76}
                innerRadius={40}
                paddingAngle={4}
              >
                {charts.leadsPorUrgencia.map((_, idx) => (
                  <Cell key={idx} fill={COLORS_PIE[idx % COLORS_PIE.length]} />
                ))}
              </Pie>
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: '#999' }} />
              <Tooltip
                contentStyle={{ background: '#161616', border: '1px solid #2A2A2A', borderRadius: 10, fontSize: 12 }}
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ChartCard
          title="Servicos mais pedidos"
          icon={Filter}
          tooltip={CHART_TOOLTIPS.servicos_pedidos}
          description="Servicos com maior volume de demanda no periodo"
          empty={charts.servicosMaisPedidos.length === 0}
          loading={loading}
        >
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={charts.servicosMaisPedidos} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
              <CartesianGrid stroke="#202020" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="servico" tick={{ fill: '#909090', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fill: '#909090', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: '#161616', border: '1px solid #2A2A2A', borderRadius: 10, fontSize: 12 }} />
              <Bar dataKey="total" fill="#F59E0B" radius={[5, 5, 0, 0]} maxBarSize={34} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Receita por servico"
          icon={CircleDollarSign}
          tooltip={CHART_TOOLTIPS.receita_servico}
          description="Participacao de receita estimada por servico"
          empty={charts.receitaPorServico.length === 0}
          loading={loading}
        >
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={charts.receitaPorServico} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
              <CartesianGrid stroke="#202020" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="servico" tick={{ fill: '#909090', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#909090', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#161616', border: '1px solid #2A2A2A', borderRadius: 10, fontSize: 12 }}
                formatter={(value) => [fmtBRL(value), 'Receita']}
              />
              <Bar dataKey="valor" fill="#22C55E" radius={[5, 5, 0, 0]} maxBarSize={34} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
      </section>
    </div>
  );
}

