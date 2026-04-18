import { OrcStatusBadge, PrioridadeBadge, UrgenciaBadge } from '@/components/ui/StatusBadge';
import { fmtRelative, fmtBRL, truncate } from '@/lib/utils';

export default function OrcamentosTable({ orcamentos, onSelect }) {
  if (orcamentos.length === 0) {
    return (
      <div className="text-center py-20 text-hagav-gray text-sm">
        Nenhum orcamento encontrado.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-hagav-border">
      <table className="htable min-w-[1480px]">
        <thead>
          <tr>
            <th>#</th>
            <th>Cliente</th>
            <th>Servico / Operacao</th>
            <th>Quantidade</th>
            <th>Material</th>
            <th>Tempo bruto</th>
            <th>Prazo</th>
            <th>Preco base</th>
            <th>Preco final</th>
            <th>Margem</th>
            <th>Potencial</th>
            <th>Urgencia</th>
            <th>Status</th>
            <th>Origem</th>
            <th>Entrada</th>
          </tr>
        </thead>
        <tbody>
          {orcamentos.map((orc) => (
            <tr key={orc.id} onClick={() => onSelect(orc)} className={orc.incompleto ? 'bg-yellow-500/5' : ''}>
              <td className="text-hagav-gray font-mono text-xs">{orc.id}</td>
              <td>
                <div>
                  <p className="font-medium text-hagav-white">{orc.nome || '—'}</p>
                  <p className="text-[11px] text-hagav-gray font-mono">{orc.whatsapp || ''}</p>
                </div>
              </td>
              <td className="text-hagav-light text-xs max-w-[180px]" title={orc.servico || ''}>
                {truncate(orc.servico, 68)}
              </td>
              <td className="text-hagav-gray text-xs">{orc.quantidade || '—'}</td>
              <td className="text-hagav-gray text-xs">{truncate(orc.material_gravado, 40)}</td>
              <td className="text-hagav-gray text-xs">{truncate(orc.tempo_bruto, 40)}</td>
              <td className="text-hagav-gray text-xs">{orc.prazo || '—'}</td>
              <td className="font-medium text-hagav-light">{fmtBRL(orc.preco_base)}</td>
              <td className={`font-semibold ${Number(orc.preco_final) > 0 ? 'text-hagav-gold' : 'text-hagav-gray'}`}>
                {Number(orc.preco_final) > 0 ? fmtBRL(orc.preco_final) : '—'}
              </td>
              <td className="text-xs text-hagav-light">{Number(orc.margem_estimada || 0).toFixed(1)}%</td>
              <td className="text-sm font-medium text-hagav-gold">{fmtBRL(orc.valor_estimado)}</td>
              <td>
                <div className="flex flex-col gap-1">
                  <UrgenciaBadge urgencia={orc.urgencia} />
                  <PrioridadeBadge prioridade={orc.prioridade} />
                </div>
              </td>
              <td><OrcStatusBadge status={orc.status_orcamento} /></td>
              <td className="text-hagav-gray text-xs">{truncate(orc.origem, 24)}</td>
              <td className="text-hagav-gray text-xs">{fmtRelative(orc.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
