'use client';

import { useMemo, useRef, useState } from 'react';
import { Instagram, Mail, MessageSquare } from 'lucide-react';
import { CHANCE_FAIXAS, QUADRANTES, calcularChance } from '@/lib/prospeccao-chance';
import { montarFunil } from '@/lib/prospeccao-funil';
import { PROSPECT_STATUS_LABELS } from '@/lib/prospeccao-repository';

const W = 1000;
const H = 500;
const X0 = 70;
const X1 = 970;
const Y0 = 450; // perfil 0
const Y1 = 30; // perfil 50
const TEXTO = '#F5F5F5';
const TEXTO_2 = '#9a9893';
const HALO = { stroke: '#1C1C1C', strokeWidth: 4, paintOrder: 'stroke', strokeLinejoin: 'round' };
const CORES_CANAL = { email: '#3987e5', instagram: '#d55181', outro: '#c98500' };
const ENCERRADOS = new Set(['convertido', 'sem_interesse', 'descartado', 'descadastrado', 'sem_resposta']);

const sx = (v) => X0 + (Math.max(0, Math.min(50, v)) / 50) * (X1 - X0);
const sy = (v) => Y0 - (Math.max(0, Math.min(50, v)) / 50) * (Y0 - Y1);

function canalDe(p) {
  if (p.email) return 'email';
  if (p.instagram) return 'instagram';
  return 'outro';
}

function primeiroNome(nome) {
  const partes = String(nome || '').trim().split(/\s+/);
  return partes.length > 1 ? `${partes[0]} ${partes[1][0]}.` : partes[0] || '';
}

export default function RadarView({ prospects, idsComRascunho, onAbrirProspect }) {
  const [mostrarEncerrados, setMostrarEncerrados] = useState(false);
  const [tooltip, setTooltip] = useState(null);
  const caixaRef = useRef(null);

  const pontos = useMemo(() => {
    const lista = prospects
      .filter((p) => mostrarEncerrados || !ENCERRADOS.has(p.status))
      .map((p) => ({ p, info: calcularChance(p), canal: canalDe(p) }))
      .sort((a, b) => b.info.chance - a.info.chance);
    // Espalha pontos que caem no mesmo lugar
    const ocupados = new Map();
    const posicionados = lista.map((item) => {
      const chave = `${Math.round(item.info.momento / 2)}-${Math.round(item.info.perfil / 2)}`;
      const n = ocupados.get(chave) || 0;
      ocupados.set(chave, n + 1);
      const angulo = n * 2.4;
      const desloc = n ? 13 + n * 2 : 0;
      const x = sx(item.info.momento) + Math.cos(angulo) * desloc;
      const y = sy(item.info.perfil) + Math.sin(angulo) * desloc;
      return { ...item, x, y };
    });
    // Rotulos sem sobreposicao: tenta direita, esquerda, acima e abaixo; se nao couber, fica so no tooltip.
    const caixas = posicionados.map((pt) => ({ x1: pt.x - 11, x2: pt.x + 11, y1: pt.y - 11, y2: pt.y + 11 }));
    const bate = (c) => caixas.some((o) => c.x1 < o.x2 && c.x2 > o.x1 && c.y1 < o.y2 && c.y2 > o.y1);
    return posicionados.map((pt) => {
      const texto = `${primeiroNome(pt.p.nome)} · ${pt.info.chance}`;
      const larg = texto.length * 6.3;
      const cx = Math.max(X0 + larg / 2 + 2, Math.min(X1 - larg / 2 - 2, pt.x)); // rotulo centralizado sem sair do grafico
      const opcoes = [
        { tx: pt.x + 14, ty: pt.y + 4, anchor: 'start', c: { x1: pt.x + 13, x2: pt.x + 15 + larg, y1: pt.y - 8, y2: pt.y + 8 } },
        { tx: pt.x - 14, ty: pt.y + 4, anchor: 'end', c: { x1: pt.x - 15 - larg, x2: pt.x - 13, y1: pt.y - 8, y2: pt.y + 8 } },
        { tx: cx, ty: pt.y - 16, anchor: 'middle', c: { x1: cx - larg / 2, x2: cx + larg / 2, y1: pt.y - 28, y2: pt.y - 12 } },
        { tx: cx, ty: pt.y + 26, anchor: 'middle', c: { x1: cx - larg / 2, x2: cx + larg / 2, y1: pt.y + 13, y2: pt.y + 29 } },
      ].filter((o) => o.c.x1 >= X0 && o.c.x2 <= X1);
      const escolhida = opcoes.find((o) => !bate(o.c));
      if (escolhida) caixas.push(escolhida.c);
      return { ...pt, texto, rotulo: escolhida || null };
    });
  }, [prospects, mostrarEncerrados]);

  const funil = useMemo(() => montarFunil(prospects, idsComRascunho), [prospects, idsComRascunho]);

  function mostrar(evento, item) {
    const caixa = caixaRef.current?.getBoundingClientRect();
    if (!caixa) return;
    setTooltip({ item, x: evento.clientX - caixa.left, y: evento.clientY - caixa.top, largura: caixa.width });
  }

  const quadrantes = [
    { key: 'nutrir', x: X0 + 12, y: Y1 + 20, anchor: 'start' },
    { key: 'atacar', x: X1 - 12, y: Y1 + 20, anchor: 'end' },
    { key: 'deixar', x: X0 + 12, y: Y0 - 12, anchor: 'start' },
    { key: 'rapido', x: X1 - 12, y: Y0 - 12, anchor: 'end' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-hagav-light">
          Quanto mais para cima e para a direita, maior a chance. Clique numa bolinha para abrir o prospect.
        </p>
        <label className="flex items-center gap-2 text-xs text-hagav-light">
          <input type="checkbox" checked={mostrarEncerrados} onChange={(e) => setMostrarEncerrados(e.target.checked)} />
          Mostrar encerrados
        </label>
      </div>

      <div ref={caixaRef} className="hcard p-2 relative overflow-x-auto" onMouseLeave={() => setTooltip(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[720px] h-auto" role="img" aria-label="Radar de chances: momento de compra no eixo horizontal, perfil de cliente no vertical">
          {/* Quadrantes */}
          <rect x={sx(25)} y={Y1} width={X1 - sx(25)} height={sy(25) - Y1} fill="#F5A623" fillOpacity="0.06" />
          <rect x={X0} y={Y1} width={X1 - X0} height={Y0 - Y1} fill="none" stroke="#2A2A2A" />
          <line x1={sx(25)} y1={Y1} x2={sx(25)} y2={Y0} stroke="#2A2A2A" strokeDasharray="4 5" />
          <line x1={X0} y1={sy(25)} x2={X1} y2={sy(25)} stroke="#2A2A2A" strokeDasharray="4 5" />
          {quadrantes.map((q) => (
            <text key={q.key} x={q.x} y={q.y} textAnchor={q.anchor} fontSize="13" fontWeight="600" fill={q.key === 'atacar' ? '#F5A623' : TEXTO_2}>
              {QUADRANTES[q.key].label}
            </text>
          ))}

          {/* Eixos */}
          {[0, 25, 50].map((v) => (
            <g key={`t-${v}`}>
              <text x={sx(v)} y={Y0 + 18} textAnchor="middle" fontSize="11" fill={TEXTO_2}>{v}</text>
              <text x={X0 - 10} y={sy(v) + 4} textAnchor="end" fontSize="11" fill={TEXTO_2}>{v}</text>
            </g>
          ))}
          <text x={(X0 + X1) / 2} y={Y0 + 40} textAnchor="middle" fontSize="12" fill={TEXTO}>Momento de compra: precisa de vídeo agora →</text>
          <text x={20} y={(Y0 + Y1) / 2} textAnchor="middle" fontSize="12" fill={TEXTO} transform={`rotate(-90 20 ${(Y0 + Y1) / 2})`}>Perfil de cliente →</text>

          {/* Pontos */}
          {pontos.map((item) => (
            <g
              key={item.p.id}
              className="cursor-pointer"
              onMouseMove={(e) => mostrar(e, item)}
              onClick={() => onAbrirProspect(item.p)}
              opacity={ENCERRADOS.has(item.p.status) ? 0.4 : 1}
            >
              <circle cx={item.x} cy={item.y} r="16" fill="transparent" />
              <circle cx={item.x} cy={item.y} r="9" fill={CORES_CANAL[item.canal]} stroke="#1C1C1C" strokeWidth="2" />
              {item.rotulo && (
                <text x={item.rotulo.tx} y={item.rotulo.ty} textAnchor={item.rotulo.anchor} fontSize="12" fill={TEXTO} {...HALO}>
                  {item.texto}
                </text>
              )}
            </g>
          ))}
          {!pontos.length && (
            <text x={(X0 + X1) / 2} y={(Y0 + Y1) / 2} textAnchor="middle" fontSize="13" fill={TEXTO_2}>Nenhum prospect em aberto</text>
          )}
        </svg>

        {tooltip && (
          <div
            className="pointer-events-none absolute z-10 w-64 rounded-xl border border-hagav-border bg-hagav-black/95 px-3 py-2 text-xs shadow-card"
            style={{ left: Math.min(tooltip.x + 14, tooltip.largura - 270), top: tooltip.y + 14 }}
          >
            <p className="text-hagav-white font-medium">{tooltip.item.p.nome}</p>
            <p className="text-hagav-light mt-0.5">
              Chance {tooltip.item.info.chance} ({CHANCE_FAIXAS[tooltip.item.info.faixa].label}) · {PROSPECT_STATUS_LABELS[tooltip.item.p.status] || tooltip.item.p.status}
            </p>
            <p className="text-hagav-gray mt-0.5">Momento {tooltip.item.info.momento}/50 · Perfil {tooltip.item.info.perfil}/50</p>
            <ul className="mt-1.5 space-y-0.5 text-hagav-light">
              {tooltip.item.info.fatores.slice(0, 5).map((f) => (
                <li key={f.label}>{f.pontos > 0 ? '+' : ''}{f.pontos} {f.label}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-hagav-light">
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-full" style={{ background: CORES_CANAL.email }} /><Mail size={12} aria-hidden="true" />Email (envio automático)</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-full" style={{ background: CORES_CANAL.instagram }} /><Instagram size={12} aria-hidden="true" />Só Instagram (DM manual)</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-full" style={{ background: CORES_CANAL.outro }} /><MessageSquare size={12} aria-hidden="true" />Outro canal</span>
      </div>

      <div className="hcard">
        <p className="text-sm font-semibold text-hagav-white">A nota está acertando?</p>
        <p className="text-xs text-hagav-gray mt-0.5">Conforme as mensagens saem, esta tabela mostra quem responde mais. Se a faixa alta não responder mais que a baixa, a nota precisa de ajuste.</p>
        <div className="mt-3 overflow-x-auto">
          <table className="htable min-w-[520px]">
            <thead>
              <tr><th>Chance</th><th>Encontrados</th><th>Abordados</th><th>Responderam</th><th>Querem conversar</th><th>Taxa de resposta</th></tr>
            </thead>
            <tbody>
              {['alta', 'media', 'baixa'].map((faixa) => {
                const f = funil.porFaixa[faixa];
                return (
                  <tr key={faixa}>
                    <td className="text-hagav-white">{CHANCE_FAIXAS[faixa].label} ({faixa === 'alta' ? '65+' : faixa === 'media' ? '45 a 64' : 'até 44'})</td>
                    <td>{f.total}</td>
                    <td>{f.abordados}</td>
                    <td>{f.responderam}</td>
                    <td>{f.conversa}</td>
                    <td>{f.abordados ? `${Math.round((f.responderam / f.abordados) * 100)}%` : 'ainda sem envios'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
