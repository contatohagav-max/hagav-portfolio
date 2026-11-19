'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Bot, Calculator, HeartPulse, Info, RefreshCw, TrendingUp, Users, Waypoints, XOctagon } from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';
import FlowView from '@/components/contabilidade/FlowView';
import HealthView from '@/components/contabilidade/HealthView';
import GoalsView from '@/components/contabilidade/GoalsView';
import ClientsView from '@/components/contabilidade/ClientsView';
import ChatView from '@/components/contabilidade/ChatView';
import { useAuth } from '@/context/AuthContext';
import { fetchFinancialEntries, fetchProductionJobs } from '@/lib/supabase';
import { fetchCompanyGoalsBundle, saveCompanyGoalSetting } from '@/lib/goals-repository';
import { classNames } from '@/lib/utils';
import { formatarBRL, formatarCompacto, montarContabilidade, resumoParaChat } from '@/lib/contabilidade';

const PERIODOS = [
  { key: 'mes', label: 'Este mês' },
  { key: '3m', label: '3 meses' },
  { key: '6m', label: '6 meses' },
  { key: '12m', label: '12 meses' },
];

const ABAS = [
  { key: 'encanamento', label: 'Encanamento', icon: Waypoints },
  { key: 'saude', label: 'Saúde', icon: HeartPulse },
  { key: 'metas', label: 'Metas', icon: TrendingUp },
  { key: 'clientes', label: 'Clientes', icon: Users },
  { key: 'chat', label: 'Perguntar', icon: Bot },
];

const ICONES_ALARME = {
  critico: { icon: XOctagon, color: '#d03b3b', borda: 'border-red-500/40 bg-red-500/5' },
  atencao: { icon: AlertTriangle, color: '#fab219', borda: 'border-amber-500/30 bg-amber-500/5' },
  info: { icon: Info, color: '#9a9893', borda: 'border-hagav-border bg-hagav-surface' },
};

function montarCrescimento(dados) {
  const lista = [
    {
      id: 'reserva-ideal',
      titulo: 'Reserva de emergência',
      guardado: dados.totalReservado,
      alvo: dados.reservaIdeal,
      pct: dados.reservaIdeal > 0 ? Math.min(1, dados.totalReservado / dados.reservaIdeal) : 0,
      dica: '6 meses de custo',
    },
    ...dados.reservas
      .filter((r) => r.categoria !== 'financial' || !/emerg/i.test(r.titulo))
      .map((r) => ({ id: r.id, titulo: r.titulo, guardado: r.guardado, alvo: r.alvo, pct: r.pct })),
  ];
  const sugestoes = [
    { id: 'sug-equip', titulo: 'Equipamentos', guardado: 0, alvo: 0, pct: 0, dica: 'Crie em Metas da empresa' },
    { id: 'sug-mkt', titulo: 'Marketing e anúncios', guardado: 0, alvo: 0, pct: 0, dica: 'Para atrair clientes' },
    { id: 'sug-estudo', titulo: 'Capacitação', guardado: 0, alvo: 0, pct: 0, dica: 'Cursos e ferramentas' },
  ];
  sugestoes.forEach((s) => {
    const existe = lista.some((x) => x.titulo.toLowerCase().includes(s.titulo.split(' ')[0].toLowerCase()));
    if (!existe && lista.length < 4) lista.push(s);
  });
  return lista.slice(0, 5);
}

export default function ContabilidadePage() {
  const { can } = useAuth();
  const podeVer = can('readFinanceiro');
  const podeEditar = can('manageFinanceiro');

  const [periodo, setPeriodo] = useState('mes');
  const [aba, setAba] = useState('encanamento');
  const [base, setBase] = useState({ entries: [], goals: [], contributions: [], jobs: [], config: {} });
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const [entries, bundle, jobs] = await Promise.all([
        fetchFinancialEntries({ limit: 5000 }),
        fetchCompanyGoalsBundle().catch(() => ({ goals: [], contributions: [], settings: {} })),
        fetchProductionJobs({ limit: 2000 }).catch(() => []),
      ]);
      setBase({
        entries: entries || [],
        goals: bundle.goals || [],
        contributions: bundle.contributions || [],
        jobs: jobs || [],
        config: bundle.settings?.contabilidade || {},
      });
    } catch (err) {
      console.error('[Contabilidade]', err);
      setErro('Não foi possível carregar os dados financeiros. Tente atualizar.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    if (podeVer) carregar();
  }, [podeVer, carregar]);

  const dados = useMemo(() => montarContabilidade({ ...base, periodo }), [base, periodo]);
  const dados3m = useMemo(() => montarContabilidade({ ...base, periodo: '3m' }), [base]);
  const crescimento = useMemo(() => montarCrescimento(dados), [dados]);
  const resumoChat = useMemo(() => {
    const blocos = [resumoParaChat(dados3m)];
    if (periodo !== '3m') blocos.push(`\nRecorte selecionado na tela (${dados.periodo.rotulo}):\n${resumoParaChat(dados)}`);
    return blocos.join('\n');
  }, [dados, dados3m, periodo]);

  async function salvarConfig(valores) {
    const salvo = await saveCompanyGoalSetting('contabilidade', valores);
    setBase((b) => ({ ...b, config: salvo?.value || valores }));
  }

  if (!podeVer) {
    return <EmptyState icon={Calculator} title="Sem acesso" description="Seu perfil não tem acesso ao financeiro." />;
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Contabilidade HAGAV</h1>
          <p className="page-subtitle">Para onde o dinheiro vai, se está saudável e o próximo degrau de crescimento.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-hagav-border bg-hagav-surface p-1">
            {PERIODOS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPeriodo(p.key)}
                className={classNames(
                  'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                  periodo === p.key ? 'bg-hagav-gold text-hagav-black' : 'text-hagav-light hover:text-hagav-white',
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={carregar} disabled={carregando} className="btn-ghost btn-sm">
            <RefreshCw size={13} className={carregando ? 'animate-spin' : ''} /> Atualizar
          </button>
        </div>
      </div>

      {erro && <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{erro}</p>}

      {carregando ? (
        <div className="flex items-center justify-center py-24"><RefreshCw size={20} className="animate-spin text-hagav-gold" /></div>
      ) : (
        <>
          {dados.alarmes.length > 0 && (
            <div className="hcard p-0 overflow-hidden">
              <p className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-wider text-hagav-gray">Alarmes</p>
              {dados.alarmes.map((a, i) => {
                const estilo = ICONES_ALARME[a.nivel] || ICONES_ALARME.info;
                const Icone = estilo.icon;
                return (
                  <Link
                    key={`${a.titulo}-${i}`}
                    href="/financeiro"
                    className={classNames('flex items-start gap-3 px-4 py-2.5 border-t border-hagav-border/50 hover:bg-hagav-muted/20 transition-colors', a.nivel === 'critico' && 'bg-red-500/5')}
                  >
                    <Icone size={15} style={{ color: estilo.color }} className="mt-0.5 shrink-0" aria-hidden="true" />
                    <p className="min-w-0 text-sm text-hagav-white">
                      {a.titulo}
                      {a.detalhe && <span className="text-xs text-hagav-gray"> · {a.detalhe}</span>}
                    </p>
                  </Link>
                );
              })}
            </div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Kpi titulo="Entrou" valor={dados.totalEntradas} />
            <Kpi titulo="Saiu" valor={dados.totalSaidas} />
            <Kpi titulo={dados.sobra >= 0 ? 'Sobrou' : 'Faltou'} valor={Math.abs(dados.sobra)} destaque />
            <Kpi titulo="Ainda a receber" valor={dados.aReceber} sub="no período" />
            <Kpi titulo="Ainda a pagar" valor={dados.aPagar} sub="no período" />
          </div>

          <div className="flex flex-wrap gap-2">
            {ABAS.map((t) => {
              const Icone = t.icon;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setAba(t.key)}
                  className={classNames('btn-ghost btn-sm', aba === t.key && 'border-hagav-gold/40 text-hagav-gold')}
                >
                  <Icone size={13} /> {t.label}
                </button>
              );
            })}
          </div>

          {aba === 'encanamento' && <FlowView dados={dados} reservasCrescimento={crescimento} />}
          {aba === 'saude' && <HealthView dados={dados} />}
          {aba === 'metas' && (
            <GoalsView dados={dados} crescimento={crescimento} config={base.config} podeEditar={podeEditar} onSalvarConfig={salvarConfig} />
          )}
          {aba === 'clientes' && <ClientsView dados={dados} />}
          {aba === 'chat' && <ChatView resumo={resumoChat} />}
        </>
      )}
    </div>
  );
}

function Kpi({ titulo, valor, sub, destaque = false }) {
  return (
    <div className={classNames('hcard p-4', destaque && 'border-hagav-gold/30')}>
      <p className="text-[11px] uppercase tracking-wider text-hagav-gray">{titulo}</p>
      <p className={classNames('text-xl font-bold mt-1.5', destaque ? 'text-hagav-gold' : 'text-hagav-white')} title={formatarBRL(valor)}>
        {formatarCompacto(valor)}
      </p>
      {sub && <p className="text-[11px] text-hagav-gray mt-0.5">{sub}</p>}
    </div>
  );
}
