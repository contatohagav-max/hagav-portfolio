'use client';

import { AlertTriangle, CheckCircle2, MinusCircle } from 'lucide-react';
import { COR_ENTRADA, formatarBRL } from '@/lib/contabilidade';

export default function ClientsView({ dados }) {
  const semHoras = dados.clientes.every((c) => !c.horas);
  if (!dados.clientes.length) {
    return (
      <div className="hcard text-center py-14">
        <p className="text-hagav-white font-medium">Nenhum cliente pagou neste período.</p>
        <p className="text-xs text-hagav-gray mt-1">Escolha um período maior acima.</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {semHoras && (
        <div className="rounded-xl border border-hagav-border bg-hagav-surface px-4 py-3 text-xs text-hagav-light leading-relaxed">
          Ainda não há horas registradas. Em <span className="text-hagav-white">Produção</span>, preencha as horas estimadas e realizadas de cada demanda:
          aqui vai aparecer quanto cada cliente rende por hora e quem está consumindo tempo demais pelo que paga.
        </div>
      )}
      <div className="hcard p-0 overflow-x-auto">
        <table className="htable min-w-[720px]">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Pagou no período</th>
              <th>Parte do faturamento</th>
              <th>Horas</th>
              <th>Rende por hora</th>
            </tr>
          </thead>
          <tbody>
            {dados.clientes.map((c) => (
              <tr key={c.nome} className="cursor-default">
                <td className="text-hagav-white font-medium">{c.nome}</td>
                <td>{formatarBRL(c.valor)}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-28 rounded-full bg-hagav-surface overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.round(c.pct * 100)}%`, background: COR_ENTRADA }} />
                    </div>
                    <span className="text-xs text-hagav-light">{Math.round(c.pct * 100)}%</span>
                  </div>
                </td>
                <td className="text-xs">
                  {c.horas ? `${c.horas.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h ${c.horasFonte === 'estimadas' ? '(estimadas)' : ''}` : '—'}
                </td>
                <td>
                  {c.porHora === null ? (
                    <span className="inline-flex items-center gap-1 text-xs text-hagav-gray"><MinusCircle size={12} /> sem horas</span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs text-hagav-light">
                      {c.rendeBem
                        ? <CheckCircle2 size={13} style={{ color: '#0ca30c' }} aria-hidden="true" />
                        : <AlertTriangle size={13} style={{ color: '#fab219' }} aria-hidden="true" />}
                      {formatarBRL(c.porHora)}/h {c.rendeBem ? '' : '(abaixo do mínimo)'}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-hagav-gray">
        Mínimo por hora usado: {formatarBRL(dados.metas.valorHoraMinimo)} (ajuste em Metas). Clientes com mais de 35% do faturamento deixam a empresa vulnerável.
      </p>
    </div>
  );
}
