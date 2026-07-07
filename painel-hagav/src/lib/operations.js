export const PRODUCTION_STAGES = [
  { id: 'aguardando_materiais', label: 'Aguardando materiais', color: 'border-slate-500' },
  { id: 'pronto_preparar', label: 'Pronto para preparar', color: 'border-sky-500' },
  { id: 'em_edicao', label: 'Em edição', color: 'border-blue-500' },
  { id: 'revisao_interna', label: 'Revisão interna', color: 'border-violet-500' },
  { id: 'revisao_cliente', label: 'Revisão do cliente', color: 'border-fuchsia-500' },
  { id: 'ajustes', label: 'Ajustes', color: 'border-orange-500' },
  { id: 'aprovado', label: 'Aprovado', color: 'border-emerald-500' },
  { id: 'renderizando', label: 'Renderizando', color: 'border-cyan-500' },
  { id: 'pronto_entrega', label: 'Pronto para entrega', color: 'border-teal-500' },
  { id: 'entregue', label: 'Entregue', color: 'border-green-500' },
  { id: 'arquivado', label: 'Arquivado', color: 'border-zinc-500' },
  { id: 'bloqueado', label: 'Bloqueado', color: 'border-red-500' },
];

export const PRODUCTION_STAGE_LABELS = Object.fromEntries(
  PRODUCTION_STAGES.map((stage) => [stage.id, stage.label])
);

export const MATERIAL_STATUS_LABELS = {
  pendente: 'Pendente',
  parcial: 'Parcial',
  completo: 'Completo',
};

export const FINANCIAL_STATUS_LABELS = {
  pendente: 'Pendente',
  parcial: 'Parcial',
  pago: 'Pago',
  atrasado: 'Atrasado',
  cancelado: 'Cancelado',
};

export function isPastDue(value) {
  if (!value) return false;
  const due = new Date(`${String(value).slice(0, 10)}T23:59:59`);
  return !Number.isNaN(due.getTime()) && due.getTime() < Date.now();
}

export function effectiveFinancialStatus(entry) {
  const status = String(entry?.status || 'pendente');
  if (status === 'pendente' && isPastDue(entry?.vencimento)) return 'atrasado';
  return status;
}
