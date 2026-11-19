'use client';

import { Gauge } from 'lucide-react';
import { CHANCE_FAIXAS, QUADRANTES } from '@/lib/prospeccao-chance';
import { classNames } from '@/lib/utils';

const TONS = {
  alta: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
  media: 'text-amber-300 border-amber-500/30 bg-amber-500/10',
  baixa: 'text-zinc-300 border-zinc-500/30 bg-zinc-500/10',
};

export function ChanceBadge({ info, compacto = false }) {
  if (!info) return null;
  return (
    <span
      className={classNames('inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-semibold whitespace-nowrap', TONS[info.faixa])}
      title={`Chance ${CHANCE_FAIXAS[info.faixa].label.toLowerCase()}: momento ${info.momento}/50 + perfil ${info.perfil}/50`}
    >
      <Gauge size={12} aria-hidden="true" />
      {info.chance}
      {!compacto && <span className="font-normal">· {CHANCE_FAIXAS[info.faixa].label}</span>}
    </span>
  );
}

export function QuadranteTag({ info }) {
  if (!info) return null;
  const q = QUADRANTES[info.quadrante];
  return (
    <span className="text-[11px] px-2 py-0.5 rounded-full border border-hagav-border text-hagav-light" title={q.dica}>
      {q.label}
    </span>
  );
}

export function FatoresChance({ info }) {
  if (!info?.fatores?.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {info.fatores.map((f) => (
        <span
          key={`${f.lado}-${f.label}`}
          className={classNames(
            'text-[11px] px-2 py-0.5 rounded-md border',
            f.pontos < 0 ? 'border-red-500/30 text-red-300 bg-red-500/10' : 'border-hagav-border text-hagav-light bg-hagav-surface',
          )}
        >
          {f.label} <span className="text-hagav-gray">{f.pontos > 0 ? `+${f.pontos}` : f.pontos}</span>
        </span>
      ))}
    </div>
  );
}
