'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Users, FileText, TrendingUp, Send, CheckCircle2, Percent,
  RefreshCw,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import MetricCard from '@/components/dashboard/MetricCard';
import RecentLeads from '@/components/dashboard/RecentLeads';
import { fetchDashboardMetrics, fetchLeads, supabase } from '@/lib/supabase';
import { fmtDate } from '@/lib/utils';

const COLORS_PIE = ['#C9A84C', '#3B82F6', '#8B5CF6', '#22C55E', '#EF4444', '#F97316'];

const EMPTY_METRICS = {
  totalLeads: 0,
  novosHoje: 0,
  orcamentosPendentes: 0,
  propostasEnviadas: 0,
  fechadosMes: 0,
  taxaConversao: '0.0',
};

export default function DashboardPage() {
  const [metrics, setMetrics]       = useState(EMPTY_METRICS);
  const [leads, setLeads]           = useState([]);
  const [originChart, setOriginChart] = useState([]);
  const [statusChart, setStatusChart] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, allLeads] = await Promise.all([
        fetchDashboardMetrics(),
        fetchLeads({ limit: 100 }),
      ]);
      setMetrics(m);
      setLeads(allLeads.slice(0, 8));

      // Origin chart
      const origMap = {};
      allLeads.forEach(l => {
        const o = l.origem || 'Desconhecida';
        origMap[o] = (origMap[o] || 0) + 1;
      });
      setOriginChart(Object.entries(origMap).map(([name, value]) => ({ name, value })));

      // Status chart
      const stMap = {};
      allLeads.forEach(l => {
        const s = l.status || 'novo';
        stMap[s] = (stMap[s] || 0) + 1;
      });
      setStatusChart(Object.entries(stMap).map(([name, value]) => ({ name, value })));

      setLastRefresh(new Date());
    } catch (err) {
      console.error('[Dashboard]', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const METRICS = [
    { label: 'Total leads',          value: metrics.totalLeads,          icon: Users,         accent: false },
    { label: 'Novos hoje',           value: metrics.novosHoje,           icon: TrendingUp,    accent: false },
    { label: 'Orçamentos pendentes', value: metrics.orcamentosPendentes, icon: FileText,      accent: true  },
    { label: 'Propostas enviadas',   value: metrics.propostasEnviadas,   icon: Send,          accent: false },
    { label: 'Fechados no mês',      value: metrics.fechadosMes,         icon: CheckCircle2,  accent: false },
    { label: 'Taxa de conversão',    value: `${metrics.taxaConversao}%`, icon: Percent,       accent: false },
  ];

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-hagav-white">Dashboard</h1>
          <p className="text-xs text-hagav-gray mt-0.5">
            {lastRefresh ? `Atualizado às ${lastRefresh.toLocaleTimeString('pt-BR')}` : 'Carregando…'}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="btn-ghost btn-sm"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {METRICS.map(m => (
          <MetricCard key={m.label} {...m} />
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Origin chart */}
        <div className="hcard">
          <h3 className="text-sm font-semibold text-hagav-white mb-4">Origem dos leads</h3>
          {originChart.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={originChart} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis
                  dataKey="name"
                  tick={{ fill: '#888', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#888', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{ background: '#1C1C1C', border: '1px solid #2A2A2A', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#F5F5F5' }}
                  itemStyle={{ color: '#C9A84C' }}
                />
                <Bar dataKey="value" fill="#C9A84C" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-sm text-hagav-gray">
              {loading ? 'Carregando…' : 'Sem dados ainda.'}
            </div>
          )}
        </div>

        {/* Status pie chart */}
        <div className="hcard">
          <h3 className="text-sm font-semibold text-hagav-white mb-4">Status dos leads</h3>
          {statusChart.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={statusChart}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={70}
                  innerRadius={40}
                  paddingAngle={3}
                >
                  {statusChart.map((_, i) => (
                    <Cell key={i} fill={COLORS_PIE[i % COLORS_PIE.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#1C1C1C', border: '1px solid #2A2A2A', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#F5F5F5' }}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 11, color: '#888' }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-sm text-hagav-gray">
              {loading ? 'Carregando…' : 'Sem dados ainda.'}
            </div>
          )}
        </div>
      </div>

      {/* Recent leads */}
      <RecentLeads leads={leads} />
    </div>
  );
}
