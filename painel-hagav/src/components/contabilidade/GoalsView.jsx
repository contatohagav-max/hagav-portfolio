'use client';

import { useEffect, useState } from 'react';
import { Flag, Save } from 'lucide-react';
import { formatarBRL, formatarCompacto } from '@/lib/contabilidade';

function parseValor(texto) {
  const limpo = String(texto || '').replace(/[^\d,.-]/g, '');
  const normal = limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo;
  const n = Number(normal);
  return Number.isFinite(n) ? n : 0;
}

export default function GoalsView({ dados, crescimento, config, podeEditar, onSalvarConfig }) {
  const [form, setForm] = useState({ meta_mensal: '', degrau: '', ticket_medio: '', valor_hora_minimo: '', limite_mei_anual: '' });
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState('');

  useEffect(() => {
    setForm({
      meta_mensal: String(config.meta_mensal ?? dados.metas.metaMensal),
      degrau: String(config.degrau ?? dados.metas.degrau),
      ticket_medio: String(config.ticket_medio ?? dados.metas.ticket),
      valor_hora_minimo: String(config.valor_hora_minimo ?? dados.metas.valorHoraMinimo),
      limite_mei_anual: String(config.limite_mei_anual ?? dados.mei?.limite ?? ''),
    });
  }, [config, dados.metas]);

  async function salvar() {
    setSalvando(true);
    setAviso('');
    try {
      await onSalvarConfig({
        meta_mensal: parseValor(form.meta_mensal),
        degrau: parseValor(form.degrau),
        ticket_medio: parseValor(form.ticket_medio),
        valor_hora_minimo: parseValor(form.valor_hora_minimo),
        limite_mei_anual: parseValor(form.limite_mei_anual),
      });
      setAviso('Metas salvas.');
    } catch (err) {
      setAviso(err?.message || 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
      setTimeout(() => setAviso(''), 3000);
    }
  }

  const { metas } = dados;
  const progressoMeta = metas.metaMensal > 0 ? Math.min(1, metas.atual / metas.metaMensal) : 0;
  const sobraMedia = dados.mensal.slice(-4, -1).reduce((a, m) => a + m.sobra, 0) / 3;
  const guardarSugestao = sobraMedia > 0 ? sobraMedia * 0.3 : 0;
  const faltaReserva = Math.max(0, dados.reservaIdeal - dados.totalReservado);
  const mesesParaReserva = guardarSugestao > 0 ? Math.ceil(faltaReserva / guardarSugestao) : null;

  return (
    <div className="space-y-4">
      {/* Escada de faturamento */}
      <div className="hcard">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-hagav-white">Escada até a meta de {formatarCompacto(metas.metaMensal)} por mês</p>
          <p className="text-xs text-hagav-gray">Hoje (média dos 3 últimos meses): <span className="text-hagav-white font-medium">{formatarCompacto(metas.atual)}/mês</span></p>
        </div>

        <div className="mt-4 h-3 w-full rounded-full bg-hagav-surface border border-hagav-border overflow-hidden">
          <div className="h-full rounded-full bg-hagav-gold" style={{ width: `${progressoMeta * 100}%` }} />
        </div>
        <p className="text-[11px] text-hagav-gray mt-1.5">{Math.round(progressoMeta * 100)}% da meta</p>

        <div className="mt-6 overflow-x-auto">
          <div className="relative flex min-w-[560px] items-start justify-between gap-2 px-2">
            <div className="absolute left-8 right-8 top-[22px] h-[2px] bg-hagav-border" aria-hidden="true" />
            <Degrau rotulo="Hoje" valor={metas.atual} atual sugestao="Média de faturamento" />
            {metas.passos.map((p, i) => (
              <Degrau
                key={p.alvo}
                rotulo={p.ehMeta ? 'Meta' : `Degrau ${i + 1}`}
                valor={p.alvo}
                atingido={p.atingido}
                meta={p.ehMeta}
                sugestao={p.sugestao}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Bolinhas de crescimento */}
      <div className="hcard">
        <p className="text-sm font-semibold text-hagav-white">O que faz a empresa crescer (mesmo que ainda esteja zerado)</p>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
          {crescimento.map((g) => <Bolinha key={g.id} item={g} />)}
        </div>
        <div className="mt-4 rounded-xl border border-hagav-border bg-hagav-surface px-4 py-3 text-xs text-hagav-light leading-relaxed">
          {guardarSugestao > 0 ? (
            <>
              A sobra média dos últimos meses é de {formatarCompacto(sobraMedia)}/mês. Guardando 30% dela ({formatarCompacto(guardarSugestao)}/mês),
              a reserva de emergência ({formatarCompacto(dados.reservaIdeal)}, 6 meses de custo) fica pronta em
              <span className="text-hagav-white font-medium"> {mesesParaReserva} {mesesParaReserva === 1 ? 'mês' : 'meses'}</span>.
            </>
          ) : 'Sem sobra média nos últimos meses: antes de guardar, o foco é aumentar entradas ou cortar saídas.'}
        </div>
      </div>

      {/* Configuracao */}
      <div className="hcard">
        <p className="text-sm font-semibold text-hagav-white">Ajustar metas</p>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
          <Campo rotulo="Meta de faturamento por mês (R$)" valor={form.meta_mensal} onChange={(v) => setForm((f) => ({ ...f, meta_mensal: v }))} disabled={!podeEditar} />
          <Campo rotulo="Tamanho de cada degrau (R$)" valor={form.degrau} onChange={(v) => setForm((f) => ({ ...f, degrau: v }))} disabled={!podeEditar} />
          <Campo rotulo="Ticket médio de um cliente (R$)" valor={form.ticket_medio} onChange={(v) => setForm((f) => ({ ...f, ticket_medio: v }))} disabled={!podeEditar} />
          <Campo rotulo="Valor mínimo por hora (R$)" valor={form.valor_hora_minimo} onChange={(v) => setForm((f) => ({ ...f, valor_hora_minimo: v }))} disabled={!podeEditar} />
          <Campo rotulo="Limite anual do MEI (R$)" valor={form.limite_mei_anual} onChange={(v) => setForm((f) => ({ ...f, limite_mei_anual: v }))} disabled={!podeEditar} />
        </div>
        {podeEditar && (
          <div className="mt-3 flex items-center gap-3">
            <button type="button" className="btn-gold btn-sm" onClick={salvar} disabled={salvando}>
              <Save size={13} /> {salvando ? 'Salvando...' : 'Salvar metas'}
            </button>
            {aviso && <span className="text-xs text-hagav-light">{aviso}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function Degrau({ rotulo, valor, sugestao, atingido = false, atual = false, meta = false }) {
  const tamanho = meta ? 'w-12 h-12' : 'w-11 h-11';
  const estilo = atual
    ? 'bg-hagav-gold border-hagav-gold text-hagav-black'
    : (atingido ? 'bg-hagav-gold/80 border-hagav-gold text-hagav-black' : 'bg-hagav-card border-hagav-muted text-hagav-light');
  return (
    <div className="relative z-[1] flex flex-1 flex-col items-center text-center min-w-[96px]">
      <div className={`${tamanho} rounded-full border-2 flex items-center justify-center ${estilo}`}>
        {meta ? <Flag size={16} /> : <span className="text-[10px] font-bold">{atual ? 'HOJE' : ''}</span>}
      </div>
      <p className="mt-2 text-[11px] uppercase tracking-wider text-hagav-gray">{rotulo}</p>
      <p className="text-sm font-semibold text-hagav-white">{formatarCompacto(valor)}</p>
      <p className="mt-1 text-[11px] text-hagav-gray leading-snug max-w-[150px]">{sugestao}</p>
    </div>
  );
}

function Bolinha({ item }) {
  const r = 34;
  const circ = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center text-center">
      <svg width="92" height="92" viewBox="0 0 92 92" aria-hidden="true">
        <circle cx="46" cy="46" r={r} fill="#161616" stroke="#2A2A2A" strokeWidth="7" />
        {item.pct > 0 && (
          <circle
            cx="46" cy="46" r={r} fill="none" stroke="#F5A623" strokeWidth="7" strokeLinecap="round"
            strokeDasharray={`${item.pct * circ} ${circ}`} transform="rotate(-90 46 46)"
          />
        )}
        <text x="46" y="51" textAnchor="middle" fill="#F5F5F5" fontSize="15" fontWeight="600">{Math.round(item.pct * 100)}%</text>
      </svg>
      <p className="mt-1 text-sm text-hagav-white">{item.titulo}</p>
      <p className="text-[11px] text-hagav-gray">
        {item.alvo ? `${formatarBRL(item.guardado)} de ${formatarBRL(item.alvo)}` : 'Sem valor definido'}
      </p>
      {item.dica && <p className="text-[11px] text-hagav-gray mt-0.5">{item.dica}</p>}
    </div>
  );
}

function Campo({ rotulo, valor, onChange, disabled }) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wider text-hagav-gray">{rotulo}</span>
      <input value={valor} onChange={(e) => onChange(e.target.value)} disabled={disabled} inputMode="decimal" className="hinput w-full mt-1.5" />
    </label>
  );
}
