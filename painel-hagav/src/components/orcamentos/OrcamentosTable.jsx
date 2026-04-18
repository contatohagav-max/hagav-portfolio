import { OrcStatusBadge, LeadStatusBadge } from '@/components/ui/StatusBadge';
import { fmtRelative, fmtBRL, truncate } from '@/lib/utils';

export default function OrcamentosTable({ orcamentos, onSelect }) {
  if (orcamentos.length === 0) {
    return (
      <div className="text-center py-20 text-hagav-gray text-sm">
        Nenhum orçamento encontrado.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-hagav-border">
      <table className="htable">
        <thead>
          <tr>
            <th>#</th>
            <th>Nome</th>
            <th>Serviço</th>
            <th>Qtd</th>
            <th>Origem</th>
            <th>Preço base</th>
            <th>Preço final</th>
            <th>Status</th>
            <th>Entrada</th>
          </tr>
        </thead>
        <tbody>
          {orcamentos.map(orc => (
            <tr key={orc.id} onClick={() => onSelect(orc)}>
              <td className="text-hagav-gray font-mono text-xs">{orc.id}</td>
              <td>
                <div>
                  <p className="font-medium text-hagav-white">{orc.nome || '—'}</p>
                  <p className="text-[11px] text-hagav-gray font-mono">{orc.whatsapp || ''}</p>
                </div>
              </td>
              <td className="text-hagav-light text-xs max-w-[140px]">
                <span title={orc.servico}>{truncate(orc.servico, 40)}</span>
              </td>
              <td className="text-hagav-gray text-xs">{orc.quantidade || '—'}</td>
              <td className="text-hagav-gray text-xs">{orc.origem || '—'}</td>
              <td className="font-medium text-hagav-light">{fmtBRL(orc.preco_base)}</td>
              <td className={`font-semibold ${orc.preco_final > 0 ? 'text-hagav-gold' : 'text-hagav-gray'}`}>
                {orc.preco_final > 0 ? fmtBRL(orc.preco_final) : '—'}
              </td>
              <td><OrcStatusBadge status={orc.status_orcamento} /></td>
              <td className="text-hagav-gray text-xs">{fmtRelative(orc.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
