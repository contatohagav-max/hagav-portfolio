'use client';

import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus, Sparkles } from 'lucide-react';
import { classNames, fmtBRL } from '@/lib/utils';

const COR_BARRA = '#d95926'; // mesma cor de "Saiu" na Contabilidade
const MAX_LINHAS = 12;

function semAcento(texto) {
  return String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Nome do item sem "Pix enviado para", "(MEI)" etc., para juntar o mesmo fornecedor em uma linha.
export function rotuloItem(entry) {
  const base = String(entry?.cliente_fornecedor || entry?.descricao || 'Sem nome')
    .replace(/^pix (enviado para|recebido de)\s+/i, '')
    .replace(/\s*\((mei|ltda|me|eireli)\)\s*$/i, '')
    .trim();
  if (!base) return 'Sem nome';
  return base.charAt(0).toUpperCase() + base.slice(1);
}

export function chaveItem(entry) {
  return semAcento(rotuloItem(entry)).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim() || 'sem nome';
}

function chaveCategoria(entry) {
  return semAcento(entry?.categoria || 'sem categoria').trim() || 'sem categoria';
}

function rotuloCategoria(entry) {
  const t = String(entry?.categoria || 'Sem categoria').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : 'Sem categoria';
}

function mesesAnteriores(mesRef, quantidade) {
  return Array.from({ length: quantidade }, (_, i) => new Date(mesRef.getFullYear(), mesRef.getMonth() - (i + 1), 1));
}

function mesmoMes(a, b) {
  return Boolean(a && b) && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

/**
 * Para onde vai o dinheiro: saidas agrupadas por item (fornecedor) ou categoria.
 * @param saidas    saidas visiveis na lista (ja filtradas)
 * @param historico todas as saidas carregadas (para comparar com os meses anteriores)
 * @param mesRef    mes selecionado (null quando "Todos os meses")
 * @param valorDe   (entry) => valor gasto
 * @param dataDe    (entry) => Date do mes em que conta
 * @param onEscolher (rotulo) => filtra a lista por esse item
 */
export default function GastosPanel({ saidas, historico, mesRef, valorDe, dataDe, onEscolher }) {
  const [agrupar, setAgrupar] = useState('item');

  const linhas = useMemo(() => {
    const chave = agrupar === 'item' ? chaveItem : chaveCategoria;
    const rotulo = agrupar === 'item' ? rotuloItem : rotuloCategoria;
    const mapa = new Map();
    saidas.forEach((e) => {
      const k = chave(e);
      const atual = mapa.get(k) || { chave: k, rotulo: rotulo(e), valor: 0, qtd: 0 };
      atual.valor += valorDe(e);
      atual.qtd += 1;
      mapa.set(k, atual);
    });

    // Media dos 3 meses anteriores ao mes escolhido, por item
    const anteriores = mesRef ? mesesAnteriores(mesRef, 3) : [];
    const lista = [...mapa.values()].map((l) => {
      if (!anteriores.length) return { ...l, media: null };
      const total = historico
        .filter((e) => chave(e) === l.chave && anteriores.some((m) => mesmoMes(dataDe(e), m)))
        .reduce((acc, e) => acc + valorDe(e), 0);
      return { ...l, media: total / anteriores.length };
    });
    return lista.filter((l) => l.valor > 0).sort((a, b) => b.valor - a.valor);
  }, [agrupar, saidas, historico, mesRef, valorDe, dataDe]);

  const total = linhas.reduce((acc, l) => acc + l.valor, 0);
  const maior = linhas[0]?.valor || 1;
  const visiveis = linhas.slice(0, MAX_LINHAS);
  const resto = linhas.slice(MAX_LINHAS);

  return (
    <div className="hcard">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-hagav-white">Para onde está indo o dinheiro</p>
          <p className="text-xs text-hagav-gray mt-0.5">
            Saídas da lista abaixo, somadas por {agrupar === 'item' ? 'item' : 'categoria'}.
            {mesRef ? ' A seta compara com a média dos 3 meses anteriores.' : ''} Clique numa linha para ver só ela.
          </p>
        </div>
        <div className="inline-flex rounded-xl border border-hagav-border bg-hagav-surface p-0.5" role="tablist" aria-label="Agrupar gastos">
          {[['item', 'Por item'], ['categoria', 'Por categoria']].map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={agrupar === k}
              onClick={() => setAgrupar(k)}
              className={classNames('px-3 py-1.5 rounded-[10px] text-xs', agrupar === k ? 'bg-hagav-gold/15 text-hagav-gold' : 'text-hagav-light hover:text-hagav-white')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {!linhas.length ? (
        <p className="mt-4 text-sm text-hagav-gray">Nenhuma saída na lista com os filtros atuais.</p>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {visiveis.map((l) => {
            const pct = total > 0 ? (l.valor / total) * 100 : 0;
            const variacao = l.media && l.media > 0 ? (l.valor - l.media) / l.media : null;
            return (
              <li key={l.chave}>
                <button type="button" onClick={() => onEscolher?.(l.rotulo)} className="w-full text-left group">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="min-w-0 truncate text-hagav-light group-hover:text-hagav-white">
                      {l.rotulo} <span className="text-hagav-gray">· {l.qtd} {l.qtd === 1 ? 'lançamento' : 'lançamentos'}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <Comparacao variacao={variacao} temHistorico={mesRef !== null} media={l.media} />
                      <span className="text-hagav-white font-semibold">{fmtBRL(l.valor)}</span>
                      <span className="w-10 text-right text-hagav-gray">{Math.round(pct)}%</span>
                    </span>
                  </div>
                  <div className="mt-1 h-2 w-full rounded-full bg-hagav-surface overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(1.5, (l.valor / maior) * 100)}%`, background: COR_BARRA }} />
                  </div>
                </button>
              </li>
            );
          })}
          {resto.length > 0 && (
            <li className="text-xs text-hagav-gray">
              + {resto.length} outros itens somando {fmtBRL(resto.reduce((a, l) => a + l.valor, 0))}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function Comparacao({ variacao, temHistorico, media }) {
  if (!temHistorico) return null;
  if (variacao === null) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] text-hagav-gray" title="Sem gasto com esse item nos 3 meses anteriores">
        <Sparkles size={11} aria-hidden="true" /> novo
      </span>
    );
  }
  const pct = Math.round(Math.abs(variacao) * 100);
  if (pct < 10) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] text-hagav-gray" title={`Média dos 3 meses anteriores: ${fmtBRL(media)}`}>
        <Minus size={11} aria-hidden="true" /> na média
      </span>
    );
  }
  const subiu = variacao > 0;
  return (
    <span
      className={classNames('inline-flex items-center gap-0.5 text-[11px] font-medium', subiu ? 'text-amber-300' : 'text-emerald-300')}
      title={`Média dos 3 meses anteriores: ${fmtBRL(media)}`}
    >
      {subiu ? <ArrowUpRight size={12} aria-hidden="true" /> : <ArrowDownRight size={12} aria-hidden="true" />}
      {subiu ? '+' : '−'}{pct}%
    </span>
  );
}
