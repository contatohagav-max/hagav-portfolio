'use client';

import { useMemo, useState } from 'react';
import { ETAPAS_FUNIL, ESPERAS_FUNIL, RALOS_FUNIL, montarFunil } from '@/lib/prospeccao-funil';

const W = 1000;
const H = 420;
const Y = 175;
const X_FONTES = 168;
const X_ETAPAS = [330, 455, 580, 705, 830, 948];
const Y_RALO = 345;
const COR_CANO = '#3987e5';
const COR_ESPERA = '#fab219';
const COR_RALO = '#77756f';
const COR_VAZIO = '#3a3a3a';
const TEXTO = '#F5F5F5';
const TEXTO_2 = '#9a9893';
const HALO = { stroke: '#1C1C1C', strokeWidth: 4, paintOrder: 'stroke', strokeLinejoin: 'round' };
const LARGURA_MAX = 34;

function curva(x1, y1, x2, y2) {
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
}

function pct(v) {
  return v === null || v === undefined ? '–' : `${Math.round(v * 100)}%`;
}

export default function EncanamentoView({ prospects, idsComRascunho, onAbrirAba }) {
  const [tabela, setTabela] = useState(false);
  const [foco, setFoco] = useState(null);
  const funil = useMemo(() => montarFunil(prospects, idsComRascunho), [prospects, idsComRascunho]);
  const total = Math.max(1, funil.total);
  const largura = (v) => (v > 0 ? Math.max(3, (v / total) * LARGURA_MAX) : 0);
  const raio = (v) => (v > 0 ? Math.min(34, 15 + Math.sqrt(v) * 4) : 15);

  const passosFonte = (H - 90) / (funil.fontes.length - 1);
  const fontes = funil.fontes.map((f, i) => ({ ...f, y: 45 + passosFonte * i }));

  const frase = (() => {
    if (!funil.total) return 'Ainda não há prospects. Quando a busca rodar, eles entram pela esquerda.';
    if (!funil.alcance[2]) {
      return `${funil.total} encontrados e nenhum abordado ainda. A primeira válvula é a sua aprovação: ${funil.espera[0]} aguardando.`;
    }
    const conversa = funil.alcance[4];
    return `De ${funil.alcance[2]} abordados, ${funil.alcance[3]} responderam (${pct(funil.alcance[3] / funil.alcance[2])}) e ${conversa} quiseram conversar.`;
  })();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-hagav-light">{frase}</p>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setTabela((v) => !v)}>
          {tabela ? 'Ver encanamento' : 'Ver como tabela'}
        </button>
      </div>

      {tabela ? (
        <div className="hcard p-0 overflow-x-auto">
          <table className="htable min-w-[620px]">
            <thead>
              <tr><th>Etapa</th><th>Chegaram</th><th>Passaram para a próxima</th><th>Esperando</th><th>Saíram</th></tr>
            </thead>
            <tbody>
              {ETAPAS_FUNIL.map((e, i) => (
                <tr key={e.key}>
                  <td className="text-hagav-white">{e.label}</td>
                  <td>{funil.alcance[i]}</td>
                  <td>{i < ETAPAS_FUNIL.length - 1 ? `${funil.alcance[i + 1]} (${pct(funil.conversao[i])})` : '–'}</td>
                  <td>{i < ESPERAS_FUNIL.length ? `${funil.espera[i]} · ${ESPERAS_FUNIL[i].label}` : '–'}</td>
                  <td>{RALOS_FUNIL[i] ? `${funil.ralo[i]} · ${RALOS_FUNIL[i]}` : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="hcard p-2 overflow-x-auto">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[760px] h-auto" role="img" aria-label="Encanamento da prospecção: fontes, etapas, quem está esperando e quem saiu">
            {/* Fontes -> Encontrados */}
            {fontes.map((f) => (
              f.valor > 0 ? (
                <g key={`cano-${f.key}`} opacity={foco && foco !== f.key ? 0.25 : 1}>
                  <path d={curva(X_FONTES + 18, f.y, X_ETAPAS[0] - raio(funil.alcance[0]), Y)} fill="none" stroke={f.color} strokeOpacity="0.55" strokeWidth={largura(f.valor)} strokeLinecap="round" />
                  <path d={curva(X_FONTES + 18, f.y, X_ETAPAS[0] - raio(funil.alcance[0]), Y)} fill="none" stroke={f.color} strokeWidth="2" strokeDasharray="3 13" className="flow-dash" strokeLinecap="round" />
                </g>
              ) : (
                <path key={`cano-${f.key}`} d={curva(X_FONTES + 15, f.y, X_ETAPAS[0] - raio(funil.alcance[0]), Y)} fill="none" stroke={COR_VAZIO} strokeWidth="1.5" strokeDasharray="4 6" />
              )
            ))}
            {fontes.map((f) => (
              <g key={`fonte-${f.key}`} onMouseEnter={() => setFoco(f.key)} onMouseLeave={() => setFoco(null)}>
                <title>{`${f.label}: ${f.valor} prospect(s)${f.valor ? '' : ' · fonte ainda não explorada'}`}</title>
                <circle cx={X_FONTES} cy={f.y} r={f.valor ? 17 : 14} fill={f.valor ? f.color : '#161616'} stroke={f.valor ? '#1C1C1C' : f.color} strokeWidth="2" strokeDasharray={f.valor ? undefined : '3 3'} />
                <text x={X_FONTES} y={f.y + 4} textAnchor="middle" fontSize="12" fontWeight="600" fill={f.valor ? '#0E0E0E' : TEXTO_2}>{f.valor}</text>
                <text x={X_FONTES - 24} y={f.y + 4} textAnchor="end" fontSize="12" fill={f.valor ? TEXTO : TEXTO_2} {...HALO}>{f.label}</text>
              </g>
            ))}

            {/* Canos entre etapas */}
            {ETAPAS_FUNIL.slice(0, -1).map((e, i) => {
              const x1 = X_ETAPAS[i] + raio(funil.alcance[i]);
              const x2 = X_ETAPAS[i + 1] - raio(funil.alcance[i + 1]);
              const v = funil.alcance[i + 1];
              const mx = (X_ETAPAS[i] + X_ETAPAS[i + 1]) / 2;
              const esperando = funil.espera[i];
              const aba = ESPERAS_FUNIL[i]?.aba;
              return (
                <g key={`cano-${e.key}`}>
                  {v > 0 ? (
                    <>
                      <line x1={x1} y1={Y} x2={x2} y2={Y} stroke={COR_CANO} strokeOpacity="0.55" strokeWidth={largura(v)} strokeLinecap="round" />
                      <line x1={x1} y1={Y} x2={x2} y2={Y} stroke={COR_CANO} strokeWidth="2" strokeDasharray="3 13" className="flow-dash" strokeLinecap="round" />
                    </>
                  ) : (
                    <line x1={x1} y1={Y} x2={x2} y2={Y} stroke={COR_VAZIO} strokeWidth="2" strokeDasharray="4 6" />
                  )}
                  {/* Valvula: quem esta parado entre as duas etapas */}
                  <g
                    className={esperando > 0 && aba ? 'cursor-pointer' : undefined}
                    onClick={() => esperando > 0 && aba && onAbrirAba?.(aba)}
                  >
                    <title>{`${ESPERAS_FUNIL[i].label}: ${esperando}${esperando > 0 ? ' · clique para ver' : ''}`}</title>
                    <line x1={mx} y1={Y - 14} x2={mx} y2={Y + 14} stroke={esperando > 0 ? COR_ESPERA : COR_VAZIO} strokeWidth="3" strokeLinecap="round" />
                    <circle cx={mx} cy={Y - 20} r="6" fill="#161616" stroke={esperando > 0 ? COR_ESPERA : COR_VAZIO} strokeWidth="2" />
                    {esperando > 0 && (
                      <>
                        <rect x={mx - 56} y={Y - 74} width="112" height="40" rx="10" fill="#161616" stroke={COR_ESPERA} strokeWidth="1.5" />
                        <text x={mx} y={Y - 56} textAnchor="middle" fontSize="15" fontWeight="700" fill={TEXTO}>{esperando}</text>
                        <text x={mx} y={Y - 41} textAnchor="middle" fontSize="10" fill={TEXTO_2}>{ESPERAS_FUNIL[i].label}</text>
                      </>
                    )}
                  </g>
                  {funil.conversao[i] !== null && funil.alcance[i] > 0 && (
                    <text x={mx} y={Y + 27} textAnchor="middle" fontSize="11" fill={TEXTO_2} {...HALO}>{pct(funil.conversao[i])} seguem</text>
                  )}
                </g>
              );
            })}

            {/* Ralos */}
            {ETAPAS_FUNIL.map((e, i) => (funil.ralo[i] > 0 ? (
              <g key={`ralo-${e.key}`}>
                <title>{`${RALOS_FUNIL[i]}: ${funil.ralo[i]}`}</title>
                <path d={curva(X_ETAPAS[i], Y + raio(funil.alcance[i]), X_ETAPAS[i] + 30, Y_RALO - 14)} fill="none" stroke={COR_RALO} strokeOpacity="0.6" strokeWidth={largura(funil.ralo[i])} strokeLinecap="round" />
                <circle cx={X_ETAPAS[i] + 30} cy={Y_RALO} r="14" fill="#161616" stroke={COR_RALO} strokeWidth="2" />
                <text x={X_ETAPAS[i] + 30} y={Y_RALO + 4} textAnchor="middle" fontSize="12" fontWeight="600" fill={TEXTO}>{funil.ralo[i]}</text>
                <text x={X_ETAPAS[i] + 30} y={Y_RALO + 30} textAnchor="middle" fontSize="11" fill={TEXTO_2} {...HALO}>{RALOS_FUNIL[i]}</text>
              </g>
            ) : null))}

            {/* Etapas */}
            {ETAPAS_FUNIL.map((e, i) => {
              const v = funil.alcance[i];
              const r = raio(v);
              const ultima = i === ETAPAS_FUNIL.length - 1;
              return (
                <g key={`etapa-${e.key}`}>
                  <title>{`${e.label}: ${v}`}</title>
                  <circle cx={X_ETAPAS[i]} cy={Y} r={r} fill={v > 0 ? (ultima ? '#F5A623' : COR_CANO) : '#161616'} stroke={v > 0 ? '#1C1C1C' : COR_VAZIO} strokeWidth="2" strokeDasharray={v > 0 ? undefined : '4 4'} />
                  <text x={X_ETAPAS[i]} y={Y + 5} textAnchor="middle" fontSize="15" fontWeight="700" fill={v > 0 ? '#0E0E0E' : TEXTO_2}>{v}</text>
                  <text x={X_ETAPAS[i]} y={Math.max(Y + r + 18, Y + 52)} textAnchor="middle" fontSize="12" fontWeight="600" fill={v > 0 ? TEXTO : TEXTO_2} {...HALO}>{e.label}</text>
                </g>
              );
            })}
          </svg>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-hagav-light">
        <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-2 rounded-full" style={{ background: COR_CANO }} />Prospects avançando (largura = quantidade)</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-full border-2" style={{ borderColor: COR_ESPERA }} />Válvula: esperando (clique para ver)</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-full border-2" style={{ borderColor: COR_RALO }} />Ralo: saíram do processo</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-full border-2 border-dashed" style={{ borderColor: TEXTO_2 }} />Vazio: ainda sem ninguém</span>
      </div>
    </div>
  );
}
