'use client';

import { useMemo, useRef, useState } from 'react';
import { COR_ENTRADA, COR_SOBRA, formatarBRL, formatarCompacto } from '@/lib/contabilidade';

const W = 1000;
const X_CLIENTES = 170;
const X_CAIXA = 440;
const X_DESTINOS = 690;
const X_CRESCIMENTO = 925;
const TEXTO = '#F5F5F5';
const TEXTO_2 = '#9a9893';
// Contorno da cor do fundo atras dos textos: linhas que passam por tras nao atrapalham a leitura
const HALO = { stroke: '#1C1C1C', strokeWidth: 4, paintOrder: 'stroke', strokeLinejoin: 'round' };

function raio(valor, maximo, min = 9, max = 34) {
  if (!maximo || valor <= 0) return min;
  return Math.max(min, Math.min(max, Math.sqrt(valor / maximo) * max));
}

function distribuir(qtd, altura, margem = 56) {
  if (qtd <= 1) return [altura / 2];
  const passo = (altura - margem * 2) / (qtd - 1);
  return Array.from({ length: qtd }, (_, i) => margem + passo * i);
}

function curva(x1, y1, x2, y2) {
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
}

function encurtar(texto, max = 22) {
  const t = String(texto || '');
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export default function FlowView({ dados, reservasCrescimento }) {
  const [foco, setFoco] = useState(null);
  const [tooltip, setTooltip] = useState(null);
  const [selecionado, setSelecionado] = useState(null);
  const [tabela, setTabela] = useState(false);
  const caixaRef = useRef(null);

  const layout = useMemo(() => {
    const clientes = dados.porCliente;
    const destinos = [...dados.porGrupo].sort((a, b) => b.valor - a.valor);
    if (dados.sobra > 0) destinos.push({ key: 'sobra', label: 'Sobra', color: COR_SOBRA, valor: dados.sobra, itens: [] });
    const crescimento = reservasCrescimento;
    const linhas = Math.max(clientes.length, destinos.length, crescimento.length, 3);
    const H = Math.max(380, linhas * 74 + 80);
    const maximo = Math.max(dados.totalEntradas, dados.totalSaidas, 1);

    const yc = distribuir(clientes.length, H);
    const yd = distribuir(destinos.length, H);
    // Bolinhas de crescimento na metade de baixo, perto da Sobra (linhas curtas, sem cruzar os nomes)
    const yg = crescimento.length <= 1
      ? [H - 90]
      : Array.from({ length: crescimento.length }, (_, i) => H * 0.42 + ((H - 70 - H * 0.42) / (crescimento.length - 1)) * i);
    const caixa = { x: X_CAIXA, y: H / 2, r: 46 };

    const nosClientes = clientes.map((c, i) => ({ ...c, id: `c:${c.nome}`, x: X_CLIENTES, y: yc[i], r: raio(c.valor, maximo) }));
    const nosDestinos = destinos.map((d, i) => ({ ...d, id: `d:${d.key}`, x: X_DESTINOS, y: yd[i], r: raio(d.valor, maximo) }));
    const nosCrescimento = crescimento.map((g, i) => ({ ...g, id: `g:${g.id}`, x: X_CRESCIMENTO, y: yg[i], r: 20 }));
    const larguraLink = (valor) => Math.max(2, Math.min(44, (valor / maximo) * 70));

    const links = [
      ...nosClientes.map((n) => ({
        id: `l:${n.id}`, de: n.id, para: 'caixa', cor: COR_ENTRADA, valor: n.valor,
        d: curva(n.x + n.r, n.y, caixa.x - caixa.r, caixa.y), largura: larguraLink(n.valor),
      })),
      ...nosDestinos.map((n) => ({
        id: `l:${n.id}`, de: 'caixa', para: n.id, cor: n.color, valor: n.valor,
        d: curva(caixa.x + caixa.r, caixa.y, n.x - n.r, n.y), largura: larguraLink(n.valor),
      })),
    ];
    const sobraNo = nosDestinos.find((n) => n.key === 'sobra');
    const linksCrescimento = nosCrescimento.map((g) => ({
      id: `lg:${g.id}`, de: sobraNo ? sobraNo.id : 'caixa', para: g.id,
      d: sobraNo ? curva(sobraNo.x + sobraNo.r, sobraNo.y, g.x - g.r, g.y) : curva(caixa.x + caixa.r, caixa.y, g.x - g.r, g.y),
      ativo: Boolean(sobraNo),
    }));
    return { H, caixa, nosClientes, nosDestinos, nosCrescimento, links, linksCrescimento };
  }, [dados, reservasCrescimento]);

  const vazio = dados.totalEntradas <= 0 && dados.totalSaidas <= 0;

  function mostrar(evento, conteudo, id) {
    const box = caixaRef.current?.getBoundingClientRect();
    if (!box) return;
    setFoco(id);
    setTooltip({ x: evento.clientX - box.left, y: evento.clientY - box.top, ...conteudo });
  }

  function esconder() {
    setFoco(null);
    setTooltip(null);
  }

  const relacionado = (link) => !foco || link.de === foco || link.para === foco || (foco === 'caixa');
  const pct = (valor) => (dados.totalEntradas > 0 ? `${Math.round((valor / dados.totalEntradas) * 100)}% do que entrou` : '');

  if (vazio) {
    return (
      <div className="hcard text-center py-16">
        <p className="text-hagav-white font-medium">Nada entrou ou saiu neste período.</p>
        <p className="text-xs text-hagav-gray mt-1">Escolha um período maior acima, ou importe as movimentações do banco.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-hagav-gray">
          Passe o mouse sobre as bolinhas para ver os valores. Clique num grupo de saída para ver o que tem dentro.
        </p>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setTabela((v) => !v)}>
          {tabela ? 'Ver encanamento' : 'Ver como tabela'}
        </button>
      </div>

      {tabela ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <TabelaSimples titulo="De onde veio (entradas)" linhas={dados.porCliente.map((c) => [c.nome, c.valor])} total={dados.totalEntradas} />
          <TabelaSimples titulo="Para onde foi (saídas)" linhas={[...dados.porGrupo.map((g) => [g.label, g.valor]), ...(dados.sobra > 0 ? [['Sobra', dados.sobra]] : [])]} total={dados.totalEntradas} />
        </div>
      ) : (
        <div ref={caixaRef} className="hcard p-2 relative overflow-x-auto" onMouseLeave={esconder}>
          <svg viewBox={`0 0 ${W} ${layout.H}`} className="w-full min-w-[720px] h-auto" role="img" aria-label="Fluxo do dinheiro: entradas por cliente, caixa da HAGAV, saídas por grupo e metas de crescimento">
            {/* Titulos das colunas */}
            {[['DE ONDE VEM', X_CLIENTES], ['CAIXA', X_CAIXA], ['PARA ONDE VAI', X_DESTINOS], ['CRESCIMENTO', X_CRESCIMENTO]].map(([t, x]) => (
              <text key={t} x={x} y={22} textAnchor="middle" fill={TEXTO_2} fontSize="11" letterSpacing="1.5">{t}</text>
            ))}

            {/* Canos */}
            {layout.links.map((l) => (
              <g key={l.id} opacity={relacionado(l) ? 1 : 0.15} style={{ transition: 'opacity 150ms' }}>
                <path d={l.d} fill="none" stroke={l.cor} strokeOpacity="0.32" strokeWidth={l.largura} strokeLinecap="round" />
                <path d={l.d} fill="none" stroke={l.cor} strokeWidth={Math.min(3, l.largura)} strokeDasharray="3 13" className="flow-dash" strokeLinecap="round" />
              </g>
            ))}
            {layout.linksCrescimento.map((l) => (
              <path key={l.id} d={l.d} fill="none" stroke={l.ativo ? COR_SOBRA : '#4a4945'} strokeOpacity={l.ativo ? 0.5 : 0.6} strokeWidth="1.5" strokeDasharray="4 6" />
            ))}

            {/* Clientes */}
            {layout.nosClientes.map((n) => (
              <g key={n.id} onMouseMove={(e) => mostrar(e, { titulo: n.nome, valor: n.valor, sub: pct(n.valor) }, n.id)} style={{ cursor: 'default' }}>
                <circle cx={n.x} cy={n.y} r={n.r + 8} fill="transparent" />
                <circle cx={n.x} cy={n.y} r={n.r} fill={COR_ENTRADA} stroke="#1C1C1C" strokeWidth="2" />
                <text x={n.x - n.r - 10} y={n.y - 3} textAnchor="end" fill={TEXTO} fontSize="13" {...HALO}>{encurtar(n.nome)}</text>
                <text x={n.x - n.r - 10} y={n.y + 13} textAnchor="end" fill={TEXTO_2} fontSize="12" {...HALO}>{formatarCompacto(n.valor)}</text>
              </g>
            ))}

            {/* Caixa */}
            <g onMouseMove={(e) => mostrar(e, { titulo: 'Caixa HAGAV', valor: dados.sobra, sub: `Entrou ${formatarBRL(dados.totalEntradas)} · Saiu ${formatarBRL(dados.totalSaidas)}`, rotuloValor: 'Sobra' }, 'caixa')}>
              <circle cx={layout.caixa.x} cy={layout.caixa.y} r={layout.caixa.r + 6} fill="none" stroke="#F5A623" strokeOpacity="0.35" strokeWidth="2" />
              <circle cx={layout.caixa.x} cy={layout.caixa.y} r={layout.caixa.r} fill="#161616" stroke="#F5A623" strokeWidth="2.5" />
              <text x={layout.caixa.x} y={layout.caixa.y - 4} textAnchor="middle" fill={TEXTO} fontSize="13" fontWeight="600">Caixa</text>
              <text x={layout.caixa.x} y={layout.caixa.y + 13} textAnchor="middle" fill={TEXTO_2} fontSize="11">HAGAV</text>
              <text x={layout.caixa.x} y={layout.caixa.y + layout.caixa.r + 22} textAnchor="middle" fill={TEXTO} fontSize="13">
                {dados.sobra >= 0 ? `Sobrou ${formatarCompacto(dados.sobra)}` : `Faltou ${formatarCompacto(Math.abs(dados.sobra))}`}
              </text>
            </g>

            {/* Destinos */}
            {layout.nosDestinos.map((n) => (
              <g
                key={n.id}
                onMouseMove={(e) => mostrar(e, { titulo: n.label, valor: n.valor, sub: pct(n.valor), itens: n.itens?.slice(0, 4) }, n.id)}
                onClick={() => n.key !== 'sobra' && setSelecionado(n)}
                style={{ cursor: n.key === 'sobra' ? 'default' : 'pointer' }}
              >
                <circle cx={n.x} cy={n.y} r={n.r + 8} fill="transparent" />
                <circle cx={n.x} cy={n.y} r={n.r} fill={n.color} stroke="#1C1C1C" strokeWidth="2" />
                <text x={n.x + n.r + 10} y={n.y - 3} fill={TEXTO} fontSize="13" {...HALO}>{encurtar(n.label, 26)}</text>
                <text x={n.x + n.r + 10} y={n.y + 13} fill={TEXTO_2} fontSize="12" {...HALO}>{formatarCompacto(n.valor)}</text>
              </g>
            ))}

            {/* Crescimento */}
            {layout.nosCrescimento.map((g) => {
              const circ = 2 * Math.PI * g.r;
              return (
                <g key={g.id} onMouseMove={(e) => mostrar(e, { titulo: g.titulo, valor: g.guardado, sub: g.alvo ? `de ${formatarBRL(g.alvo)} (${Math.round(g.pct * 100)}%)` : 'Sem valor definido', rotuloValor: 'Guardado' }, g.id)}>
                  <circle cx={g.x} cy={g.y} r={g.r} fill="#161616" stroke="#3A3A3A" strokeWidth="4" />
                  {g.pct > 0 && (
                    <circle
                      cx={g.x} cy={g.y} r={g.r} fill="none" stroke="#F5A623" strokeWidth="4" strokeLinecap="round"
                      strokeDasharray={`${g.pct * circ} ${circ}`} transform={`rotate(-90 ${g.x} ${g.y})`}
                    />
                  )}
                  <text x={g.x} y={g.y + 4} textAnchor="middle" fill={TEXTO} fontSize="11">{Math.round(g.pct * 100)}%</text>
                  <text x={g.x} y={g.y + g.r + 16} textAnchor="middle" fill={TEXTO} fontSize="11" {...HALO}>{encurtar(g.titulo, 20)}</text>
                  <text x={g.x} y={g.y + g.r + 30} textAnchor="middle" fill={TEXTO_2} fontSize="10" {...HALO}>{g.alvo ? formatarCompacto(g.guardado) : "sem valor"}</text>
                </g>
              );
            })}
          </svg>

          {tooltip && (
            <div
              className="pointer-events-none absolute z-10 rounded-xl border border-hagav-border bg-hagav-black/95 px-3 py-2 shadow-card text-xs max-w-[260px]"
              style={{ left: Math.min(tooltip.x + 14, (caixaRef.current?.clientWidth || 600) - 270), top: tooltip.y + 14 }}
            >
              <p className="text-hagav-white font-medium">{tooltip.titulo}</p>
              <p className="text-hagav-light mt-0.5">{tooltip.rotuloValor ? `${tooltip.rotuloValor}: ` : ''}{formatarBRL(tooltip.valor)}</p>
              {tooltip.sub && <p className="text-hagav-gray">{tooltip.sub}</p>}
              {tooltip.itens?.length > 0 && (
                <ul className="mt-1.5 space-y-0.5 text-hagav-gray">
                  {tooltip.itens.map((it) => <li key={it.nome}>{encurtar(it.nome, 30)}: {formatarBRL(it.valor)}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {selecionado && (
        <div className="hcard">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-hagav-white flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-full" style={{ background: selecionado.color }} />
              {selecionado.label}: {formatarBRL(selecionado.valor)}
            </p>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setSelecionado(null)}>Fechar</button>
          </div>
          <TabelaSimples linhas={selecionado.itens.map((it) => [it.nome, it.valor])} total={selecionado.valor} rotuloPct="do grupo" />
        </div>
      )}
    </div>
  );
}

function TabelaSimples({ titulo, linhas, total, rotuloPct = 'do total' }) {
  return (
    <div className={titulo ? 'hcard p-0 overflow-hidden' : ''}>
      {titulo && <p className="px-4 pt-4 pb-2 text-sm font-semibold text-hagav-white">{titulo}</p>}
      <table className="w-full text-sm">
        <tbody>
          {linhas.map(([nome, valor]) => (
            <tr key={nome} className="border-t border-hagav-border/60">
              <td className="px-4 py-2 text-hagav-light">{nome}</td>
              <td className="px-4 py-2 text-right text-hagav-white whitespace-nowrap">{formatarBRL(valor)}</td>
              <td className="px-4 py-2 text-right text-hagav-gray whitespace-nowrap text-xs">
                {total > 0 ? `${Math.round((valor / total) * 100)}% ${rotuloPct}` : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
