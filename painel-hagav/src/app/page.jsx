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

function ChartCard({ title, icon: Icon, description, children, empty, loading }) {
  return (
    <div className="hcard">
      <div className="flex items-center gap-2 mb-1.5">
        <div className="w-8 h-8 rounded-lg bg-hagav-muted/40 border border-hagav-border flex items-center justify-center">
          <Icon size={14} className="text-hagav-gold" />
        </div>
        <h3 className="text-sm font-semibold text-hagav-white">{title}</h3>
      </div>
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
    { label: 'Leads no mes', value: m.leadsMes, icon: Users, onClick: () => router.push('/leads'), title: 'Abrir tela de leads' },
    { label: 'Orcamentos em aberto', value: fmtBRL(m.orcamentosAbertos), icon: Wallet, accent: true, onClick: () => router.push('/orcamentos?abertos=1'), title: 'Abrir orcamentos em aberto' },
    { label: 'Receita fechada no mes', value: fmtBRL(m.receitaFechadaMes), icon: CircleDollarSign, onClick: () => router.push('/orcamentos?status_orcamento=aprovado'), title: 'Abrir orcamentos fechados (aprovados)' },
    { label: 'Ticket medio', value: fmtBRL(m.ticketMedio), icon: BadgeDollarSign, onClick: () => router.push('/orcamentos'), title: 'Abrir tela de orcamentos' },
    { label: 'Taxa de conversao', value: fmtPercent(m.taxaConversao), icon: Percent, onClick: () => router.push('/pipeline'), title: 'Abrir pipeline' },
    { label: 'Leads urgentes', value: m.leadsUrgentes, icon: Siren, onClick: () => router.push('/leads?urgencia=alta'), title: 'Filtrar leads urgentes' },
    { label: 'Follow-up atrasado', value: m.followupAtrasado, icon: Clock3, onClick: () => router.push('/leads?followup=1'), title: 'Filtrar follow-up atrasado' },
    { label: 'Tempo medio de resposta', value: fmtHours(m.tempoMedioResposta), icon: Timer, onClick: () => router.push('/leads'), title: 'Abrir leads e revisar tempos de resposta' },
  ];
  const kpisPrincipais = metricCards.slice(0, 4);
  const kpisOperacionais = metricCards.slice(4);

  const pipelineLabelMap = {
    novo: 'Novo',
    chamado: 'Em contato',
    'proposta enviada': 'Proposta enviada',
    fechado: 'Fechado',
    perdido: 'Perdido',
  };
  const pipelineFallback = [
    { status: 'novo', total: 0 },
    { status: 'chamado', total: 0 },
    { status: 'proposta enviada', total: 0 },
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
      onClick: () => router.push('/orcamentos?status_orcamento=pendente_revisao'),
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
        <button onClick={load} disabled={loading} className="btn-ghost btn-sm">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Atualizar
        </button>
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
            <MetricCard key={card.label} {...card} />
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
              <div key={step.status} className="bg-hagav-surface border border-hagav-border rounded-lg p-3">
                <p className="text-[10px] uppercase tracking-wider text-hagav-gray">{step.label}</p>
                <p className="text-2xl font-bold text-hagav-white mt-1">{step.total}</p>
              </div>
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
                  className={`text-left rounded-lg border p-3 transition-colors hover:border-hagav-gold/30 ${toneClass}`}
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

      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[10px] text-hagav-gray uppercase tracking-wider">Linha 2</p>
            <h2 className="text-base font-semibold text-hagav-white">KPIs operacionais</h2>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {kpisOperacionais.map((card) => (
            <MetricCard key={card.label} {...card} />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-hagav-white">Blocos graficos</h2>
          <p className="text-[11px] text-hagav-gray mt-0.5">Leitura visual de origem, urgencia, demanda e receita</p>
        </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ChartCard
          title="Origem x conversao"
          icon={TrendingUp}
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

