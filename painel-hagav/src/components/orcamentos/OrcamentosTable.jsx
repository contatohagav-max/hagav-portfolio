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
      <table className="htable min-w-[1360px]">
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Fluxo</th>
            <th>Servico / Operacao</th>
            <th>Potencial</th>
            <th>Preco final</th>
            <th>Margem</th>
            <th>Revisao</th>
            <th>Status</th>
            <th>Urgencia</th>
            <th>Proxima acao</th>
            <th>Entrada</th>
          </tr>
        </thead>
        <tbody>
          {orcamentos.map((orc) => (
            <tr key={orc.id} onClick={() => onSelect(orc)} className={orc.incompleto ? 'bg-yellow-500/5' : ''}>
              {(() => {
                const itens = Array.isArray(orc.itens_servico) ? orc.itens_servico : [];
                const servicoResumo = itens.length > 0
                  ? itens.map((item) => item?.servico).filter(Boolean).join(' | ')
                  : (orc.servico || '');
                return (
                  <>
                    <td>
                      <div>
                        <p className="font-medium text-hagav-white">{orc.nome || '—'}</p>
                        <p className="text-[11px] text-hagav-gray font-mono">{orc.whatsapp || ''}</p>
                        <p className="text-[11px] text-hagav-gray truncate max-w-[220px]">{truncate(orc.origem, 28)}</p>
                      </div>
                    </td>
                    <td className="text-xs">
                      <span className="badge bg-hagav-muted/40 border-hagav-border text-hagav-light">{orc.fluxo || '—'}</span>
                    </td>
                    <td className="text-hagav-light text-xs max-w-[180px]" title={servicoResumo}>
                      {truncate(servicoResumo, 68)}
                    </td>
                  </>
                );
              })()}
              <td className="text-sm font-medium text-hagav-gold">{fmtBRL(orc.valor_estimado)}</td>
              <td className={`font-semibold ${Number(orc.preco_final) > 0 ? 'text-hagav-gold' : 'text-hagav-gray'}`}>
                {Number(orc.preco_final) > 0 ? fmtBRL(orc.preco_final) : '—'}
              </td>
              <td className="text-xs text-hagav-light">{Number(orc.margem_estimada || 0).toFixed(1)}%</td>
              <td className="text-xs">
                <span className={`badge ${orc.revisao_manual ? 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30' : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'}`}>
                  {orc.revisao_manual ? 'Manual' : 'Auto'}
                </span>
              </td>
              <td><OrcStatusBadge status={orc.status_orcamento} /></td>
              <td>
                <div className="flex flex-col gap-1">
                  <UrgenciaBadge urgencia={orc.urgencia} />
                  <PrioridadeBadge prioridade={orc.prioridade} />
                </div>
              </td>
              <td className="text-xs text-hagav-light max-w-[200px]" title={orc.proxima_acao || ''}>
                {truncate(orc.proxima_acao || 'Sem acao definida', 52)}
              </td>
              <td className="text-hagav-gray text-xs">{fmtRelative(orc.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
