import { OrcStatusBadge, PrioridadeBadge, UrgenciaBadge } from '@/components/ui/StatusBadge';
import { fmtRelative, fmtBRL, truncate } from '@/lib/utils';

function isUiArchived(row) {
  let detalhes = {};
  if (row?.detalhes && typeof row.detalhes === 'object' && !Array.isArray(row.detalhes)) {
    detalhes = row.detalhes;
  } else if (typeof row?.detalhes === 'string') {
    try {
      const parsed = JSON.parse(row.detalhes);
      detalhes = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      detalhes = {};
    }
  }
  return Boolean(detalhes?.ui_arquivado);
}

function canArchiveOrcamento(row) {
  const status = String(row?.status_orcamento || row?.status_deal || row?.status || '').toLowerCase();
  const haystack = `${row?.nome || ''} ${row?.origem || ''} ${row?.servico || ''}`.toLowerCase();
  return ['perdido', 'cancelado'].includes(status) || haystack.includes('teste');
}

export default function OrcamentosTable({ orcamentos, onSelect, onToggleArchive }) {
  if (orcamentos.length === 0) {
    return (
      <div className="text-center py-20 text-hagav-gray text-sm">
        Nenhum orçamento encontrado.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-hagav-border bg-hagav-surface/30 shadow-card">
      <table className="htable min-w-[1380px]">
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Fluxo</th>
            <th>Serviço / Operação</th>
            <th>Potencial</th>
            <th>Preço final</th>
            <th>Margem (Auto/Com.)</th>
            <th>Revisão</th>
            <th>Status</th>
            <th>Urgência</th>
            <th>Próxima ação</th>
            <th>Entrada</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {orcamentos.map((orc) => {
            const archived = isUiArchived(orc);
            const canArchive = canArchiveOrcamento(orc);
            const itens = Array.isArray(orc.itens_servico) ? orc.itens_servico : [];
            const servicoResumo = itens.length > 0
              ? itens.map((item) => item?.servico).filter(Boolean).join(' | ')
              : (orc.servico || '');

            return (
              <tr
                key={orc.id}
                onClick={() => onSelect(orc)}
                className={`transition-colors ${orc.incompleto ? 'bg-yellow-500/5' : ''} ${archived ? 'opacity-75' : ''}`}
              >
                <td>
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="font-medium text-hagav-white">{orc.nome || '—'}</p>
                      {archived && (
                        <span className="badge bg-zinc-500/20 text-zinc-300 border-zinc-500/30">Arquivado</span>
                      )}
                    </div>
                    <p className="text-[11px] text-hagav-gray font-mono">{orc.whatsapp || ''}</p>
                    <p className="text-[11px] text-hagav-gray truncate max-w-[220px]">{truncate(orc.origem, 28)}</p>
                  </div>
                </td>
                <td className="text-xs">
                  <span className="badge bg-hagav-muted/40 border-hagav-border text-hagav-light">{orc.fluxo || '—'}</span>
                </td>
                <td className="text-hagav-light text-xs max-w-[220px]" title={servicoResumo}>
                  {truncate(servicoResumo, 68)}
                </td>
                <td className="text-sm font-medium text-hagav-gold">{fmtBRL(orc.valor_estimado || orc.potencial_total || orc.preco_final || 0)}</td>
                <td className={`font-semibold ${Number(orc.preco_final) > 0 ? 'text-hagav-gold' : 'text-hagav-gray'}`}>
                  {Number(orc.preco_final) > 0 ? fmtBRL(orc.preco_final) : '—'}
                </td>
                <td className="text-xs text-hagav-light">
                  {`${Number(orc.margem_automatica ?? orc.margem_estimada ?? 0).toFixed(1)}% / ${Number(orc.margem_comercial ?? orc.margem_percentual ?? 0).toFixed(1)}%`}
                </td>
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
                  {truncate(orc.proxima_acao || 'Sem ação definida', 52)}
                </td>
                <td className="text-hagav-gray text-xs">{fmtRelative(orc.created_at)}</td>
                <td>
                  {archived ? (
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      onClick={(event) => {
                        event.stopPropagation();
                        onToggleArchive?.(orc, false);
                      }}
                    >
                      Restaurar
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={`btn-ghost btn-sm ${canArchive ? '' : 'opacity-50 cursor-not-allowed'}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onToggleArchive?.(orc, true);
                      }}
                      disabled={!canArchive}
                    >
                      Arquivar
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
