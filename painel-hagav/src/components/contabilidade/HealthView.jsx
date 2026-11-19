'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, MinusCircle, XOctagon } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { STATUS_SAUDE, formatarBRL, formatarCompacto } from '@/lib/contabilidade';

const COR_ENTRADAS = '#3987e5';
const COR_SAIDAS = '#d95926';
const ICONES = { bom: CheckCircle2, atencao: AlertTriangle, critico: XOctagon, sem_dados: MinusCircle };

export default function HealthView({ dados }) {
  return (
    <div className="space-y-4">
      {dados.mei && <LimiteMei mei={dados.mei} />}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {dados.saude.map((s) => <SinalCard key={s.key} sinal={s} />)}
      </div>
      <CadaCem dados={dados} />
      <Meses mensal={dados.mensal} />
    </div>
  );
}

const LISTRAS = `repeating-linear-gradient(135deg, ${COR_ENTRADAS}66 0 4px, ${COR_ENTRADAS}22 4px 8px)`;

function LimiteMei({ mei }) {
  const status = STATUS_SAUDE[mei.status];
  const Icone = ICONES[mei.status];
  const escala = Math.max(mei.tolerancia * 1.08, mei.projecao * 1.04, 1);
  const pct = (v) => `${Math.min(100, (v / escala) * 100)}%`;
  const maiorMes = Math.max(1, ...mei.meses.map((m) => m.valor + m.estimado));
  return (
    <div className="hcard">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-hagav-white">Limite do MEI em {mei.ano}</p>
          <p className="text-xs text-hagav-gray mt-0.5">Tudo o que entrou na empresa no ano, pelo dia em que o dinheiro caiu.</p>
        </div>
        <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border border-hagav-border text-hagav-light">
          <Icone size={12} style={{ color: status.color }} aria-hidden="true" />
          {status.label}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <p className="text-2xl font-bold text-hagav-white">
          {formatarCompacto(mei.registrado)}
          <span className="text-sm font-normal text-hagav-gray"> de {formatarCompacto(mei.limite)} registrados</span>
        </p>
        <p className="text-xs text-hagav-light">Projeção até dezembro: <span className="text-hagav-white font-semibold">{formatarCompacto(mei.projecao)}</span></p>
      </div>

      <div className="relative mt-4 pb-11">
        <div className="relative h-4 w-full rounded-full bg-hagav-surface border border-hagav-border overflow-hidden" role="img"
          aria-label={`Registrado ${formatarBRL(mei.registrado)}, projeção ${formatarBRL(mei.projecao)}, limite ${formatarBRL(mei.limite)}`}>
          <div className="absolute inset-y-0 left-0" style={{ width: pct(mei.projecao), background: LISTRAS }} />
          <div className="absolute inset-y-0 left-0 rounded-r-[4px]" style={{ width: pct(mei.registrado), background: COR_ENTRADAS }} />
        </div>
        <Marcador posicao={pct(mei.limite)} rotulo={`Limite ${formatarCompacto(mei.limite)}`} linha={0} />
        <Marcador posicao={pct(mei.tolerancia)} rotulo={`Limite + 20%: ${formatarCompacto(mei.tolerancia)}`} linha={1} tracejado />
      </div>

      <p className="text-xs text-hagav-light leading-relaxed">{mei.resumo}</p>

      <div className="mt-4 overflow-x-auto">
        <div className="min-w-[520px]">
          <div className="flex items-end gap-1.5 h-20">
            {mei.meses.map((m) => {
              const total = m.valor + m.estimado;
              const altura = total > 0 ? Math.max(4, (total / maiorMes) * 100) : 0;
              const parteReal = total > 0 ? (m.valor / total) * 100 : 0;
              const dica = m.tipo === 'sem_dado'
                ? `${m.rotulo}: sem lançamentos no painel (estimado ${formatarBRL(m.estimado)})`
                : `${m.rotulo}: entrou ${formatarBRL(m.valor)}${m.estimado > 0 ? ` + estimado ${formatarBRL(m.estimado)}` : ''}`;
              return (
                <div key={m.mes} className="flex-1 h-full flex flex-col justify-end" title={dica}>
                  <div className="w-full rounded-t-[4px] overflow-hidden flex flex-col-reverse" style={{ height: `${altura}%` }}>
                    <div style={{ height: `${parteReal}%`, background: COR_ENTRADAS }} />
                    <div className="flex-1" style={{ background: LISTRAS }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex gap-1.5 mt-1.5">
            {mei.meses.map((m) => (
              <div key={m.mes} className="flex-1 text-center">
                <p className={`text-[10px] uppercase ${m.tipo === 'atual' ? 'text-hagav-white font-semibold' : 'text-hagav-gray'}`}>{m.rotulo}</p>
                <p className="text-[10px] text-hagav-light">{m.valor > 0 ? formatarCompacto(m.valor).replace('R$ ', '') : (m.tipo === 'sem_dado' ? 'sem dado' : '–')}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-4 text-[11px] text-hagav-light">
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-[3px]" style={{ background: COR_ENTRADAS }} />Registrado no painel</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-[3px]" style={{ background: LISTRAS }} />Estimado pela média ({formatarCompacto(mei.media)}/mês)</span>
      </div>

      {mei.mesesSemDado.length > 0 && (
        <p className="mt-3 text-[11px] text-hagav-light leading-relaxed">
          Sem lançamentos no painel em {mei.mesesSemDado.join(', ')}: esses meses entram na conta pela média. Importe o extrato do banco desses meses para a conta ficar exata.
        </p>
      )}
      <p className="mt-2 text-[11px] text-hagav-gray leading-relaxed">
        Regras gerais (confirme com o contador): o limite é anual, sem teto por mês. Até 20% acima, a empresa continua MEI até dezembro, paga a diferença e muda de regime no ano seguinte; acima disso, sai do MEI desde janeiro. Pix que cai no CPF do titular pela mesma atividade também conta. O MEI não pode ter sócio, e a declaração anual (DASN-SIMEI) vence em 31 de maio.
      </p>
    </div>
  );
}

// Marca vertical sobre a barra; os rotulos ficam em linhas separadas, terminando na marca, para nao se sobreporem.
function Marcador({ posicao, rotulo, linha = 0, tracejado = false }) {
  const altura = linha === 0 ? 26 : 42;
  return (
    <div className="absolute top-0" style={{ left: posicao, height: altura }} aria-hidden="true">
      <div className={`absolute -top-1 bottom-0 ${tracejado ? 'border-l border-dashed border-hagav-light' : 'border-l-2 border-hagav-white'}`} />
      <p className="absolute right-1.5 whitespace-nowrap text-[11px] leading-none text-hagav-light" style={{ top: altura - 9 }}>{rotulo}</p>
    </div>
  );
}

function SinalCard({ sinal }) {
  const status = STATUS_SAUDE[sinal.status];
  const Icone = ICONES[sinal.status];
  return (
    <div className="hcard p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] uppercase tracking-wider text-hagav-gray">{sinal.titulo}</p>
        <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border border-hagav-border text-hagav-light">
          <Icone size={12} style={{ color: status.color }} aria-hidden="true" />
          {status.label}
        </span>
      </div>
      <p className="text-2xl font-bold text-hagav-white mt-2">{sinal.valorTexto}</p>
      <p className="text-xs text-hagav-light mt-1.5 leading-relaxed">{sinal.explicacao}</p>
      <p className="text-[11px] text-hagav-gray mt-2 leading-relaxed">{sinal.dica}</p>
    </div>
  );
}

function CadaCem({ dados }) {
  const [hover, setHover] = useState(null);
  if (!dados.cada100.length) {
    return (
      <div className="hcard">
        <p className="text-sm font-semibold text-hagav-white">De cada R$ 100 que entram</p>
        <p className="text-xs text-hagav-gray mt-2">Sem entradas no período para dividir.</p>
      </div>
    );
  }
  const total = dados.cada100.reduce((acc, s) => acc + s.valor, 0);
  const passou = total > 100.5;
  const escala = total > 100 ? 100 / total : 1; // quando saiu mais do que entrou, a barra mostra a proporcao
  return (
    <div className="hcard">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-hagav-white">De cada R$ 100 que entram, para onde vão</p>
        {passou && (
          <p className="text-xs text-hagav-light">Saiu mais do que entrou: R$ {Math.round(total - 100)} a mais de cada R$ 100.</p>
        )}
      </div>
      <div className="mt-4 flex h-10 w-full gap-[2px] rounded-md overflow-hidden" role="img" aria-label="Divisão de cada 100 reais que entram">
        {dados.cada100.map((s) => (
          <div
            key={s.key}
            className="h-full relative flex items-center justify-center first:rounded-l-[4px] last:rounded-r-[4px]"
            style={{ width: `${s.valor * escala}%`, background: s.color, opacity: hover && hover !== s.key ? 0.35 : 1 }}
            onMouseEnter={() => setHover(s.key)}
            onMouseLeave={() => setHover(null)}
            title={`${s.label}: R$ ${s.valor.toFixed(0)} de cada R$ 100`}
          >
            {s.valor * escala >= 9 && (
              <span className="text-[11px] font-semibold text-hagav-black">R$ {Math.round(s.valor)}</span>
            )}
          </div>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-2">
        {dados.cada100.map((s) => (
          <div
            key={s.key}
            className="flex items-center justify-between gap-3 text-xs"
            onMouseEnter={() => setHover(s.key)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="flex items-center gap-2 text-hagav-light">
              <span className="inline-block w-3 h-3 rounded-[3px]" style={{ background: s.color }} />
              {s.label}
            </span>
            <span className="text-hagav-white font-medium">R$ {s.valor.toFixed(0)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TooltipMes({ active, payload }) {
  if (!active || !payload?.length) return null;
  const m = payload[0].payload;
  return (
    <div className="rounded-xl border border-hagav-border bg-hagav-black/95 px-3 py-2 text-xs shadow-card">
      <p className="text-hagav-white font-medium">{m.rotulo}{m.atual ? ' (mês em andamento)' : ''}</p>
      <p className="text-hagav-light mt-1"><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5" style={{ background: COR_ENTRADAS }} />Entrou: {formatarBRL(m.entradas)}</p>
      <p className="text-hagav-light"><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5" style={{ background: COR_SAIDAS }} />Saiu: {formatarBRL(m.saidas)}</p>
      <p className="text-hagav-white mt-1">{m.sobra >= 0 ? 'Sobrou' : 'Faltou'}: {formatarBRL(Math.abs(m.sobra))}</p>
    </div>
  );
}

function Meses({ mensal }) {
  return (
    <div className="hcard">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-hagav-white">Últimos 6 meses</p>
        <div className="flex items-center gap-4 text-xs text-hagav-light">
          <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-[3px]" style={{ background: COR_ENTRADAS }} />Entrou</span>
          <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-[3px]" style={{ background: COR_SAIDAS }} />Saiu</span>
        </div>
      </div>
      <div className="h-64 mt-3">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={mensal} barGap={2} barCategoryGap="28%">
            <CartesianGrid stroke="#2A2A2A" vertical={false} />
            <XAxis dataKey="rotulo" tick={{ fill: '#9a9893', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#9a9893', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)} mil` : v)} width={48} />
            <Tooltip content={<TooltipMes />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            <Bar dataKey="entradas" name="Entrou" fill={COR_ENTRADAS} radius={[4, 4, 0, 0]} maxBarSize={28} />
            <Bar dataKey="saidas" name="Saiu" fill={COR_SAIDAS} radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[11px] text-hagav-gray mt-2">
        Média dos 3 últimos meses fechados: entrou {formatarCompacto(mensal.slice(-4, -1).reduce((a, m) => a + m.entradas, 0) / 3)} e saiu {formatarCompacto(mensal.slice(-4, -1).reduce((a, m) => a + m.saidas, 0) / 3)} por mês.
      </p>
    </div>
  );
}
