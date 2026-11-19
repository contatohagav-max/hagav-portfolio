'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clapperboard,
  FileSignature,
  Handshake,
  Info,
  Landmark,
  Receipt,
  ThumbsUp,
  XOctagon,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { fetchClientesContratos, fetchFinancialEntries, fetchProductionJobs } from '@/lib/supabase';
import { fetchCompanyGoalsBundle } from '@/lib/goals-repository';
import { fetchDrafts, fetchQuerConversarCount } from '@/lib/prospeccao-repository';
import { montarContabilidade } from '@/lib/contabilidade';

const NIVEIS = {
  critico: { icone: XOctagon, cor: '#d03b3b', rotulo: 'Urgente' },
  atencao: { icone: AlertTriangle, cor: '#fab219', rotulo: 'Atenção' },
  info: { icone: Info, cor: '#9a9893', rotulo: 'Aviso' },
};
const PESO = { critico: 0, atencao: 1, info: 2 };

function arquivado(row) {
  let detalhes = row?.detalhes;
  if (typeof detalhes === 'string') {
    try { detalhes = JSON.parse(detalhes); } catch { detalhes = null; }
  }
  return Boolean(detalhes?.ui_arquivado);
}

// Junta o que cada area precisa que a equipe faca hoje. Cada fonte e independente: se uma falhar, as outras aparecem.
async function carregarItens(can) {
  const itens = [];
  const fontes = [];

  if (can('readProspeccao')) {
    fontes.push(fetchQuerConversarCount().then((n) => {
      if (n > 0) itens.push({ nivel: 'critico', icone: Handshake, titulo: `${n} ${n === 1 ? 'pessoa quer' : 'pessoas querem'} conversar`, detalhe: 'Responderam a prospecção com interesse. Assuma a conversa.', href: '/prospeccao' });
    }));
    fontes.push(fetchDrafts().then((rascunhos) => {
      if (rascunhos.length) itens.push({ nivel: 'atencao', icone: ThumbsUp, titulo: `${rascunhos.length} ${rascunhos.length === 1 ? 'mensagem' : 'mensagens'} de prospecção para aprovar`, detalhe: 'Nada é enviado sem a sua aprovação.', href: '/prospeccao' });
    }));
  }

  if (can('readFinanceiro')) {
    fontes.push(Promise.all([fetchFinancialEntries({ limit: 5000 }), fetchCompanyGoalsBundle().catch(() => null)]).then(([entries, bundle]) => {
      const config = bundle?.settings?.contabilidade || {};
      const dados = montarContabilidade({ entries: entries || [], config, periodo: 'mes' });
      dados.alarmes.forEach((a) => {
        const ehMei = /Limite do MEI/.test(a.titulo);
        itens.push({
          nivel: a.nivel,
          icone: ehMei ? Landmark : (/receb/i.test(a.titulo) ? Receipt : CalendarClock),
          titulo: a.titulo,
          detalhe: a.detalhe,
          href: ehMei ? '/contabilidade' : '/financeiro',
        });
      });
    }));
  }

  if (can('readClientes')) {
    fontes.push(fetchClientesContratos({ limit: 1000 }).then((rows) => {
      const ativos = (rows || []).filter((r) => !arquivado(r));
      const vencidos = ativos.filter((r) => r.status_contrato === 'vencido');
      const vencendo = ativos.filter((r) => r.status_contrato === 'ativo' && Number.isFinite(r.dias_para_vencimento) && r.dias_para_vencimento >= 0 && r.dias_para_vencimento <= 15);
      if (vencidos.length) itens.push({ nivel: 'atencao', icone: FileSignature, titulo: `${vencidos.length} ${vencidos.length === 1 ? 'contrato vencido' : 'contratos vencidos'}`, detalhe: `${vencidos.slice(0, 3).map((r) => r.nome).join(', ')}: renove ou encerre.`, href: '/clientes' });
      if (vencendo.length) itens.push({ nivel: 'info', icone: FileSignature, titulo: `${vencendo.length} ${vencendo.length === 1 ? 'contrato vence' : 'contratos vencem'} em até 15 dias`, detalhe: vencendo.slice(0, 3).map((r) => `${r.nome} (${r.dias_para_vencimento} dias)`).join(', '), href: '/clientes' });
    }));
  }

  if (can('readProducao')) {
    fontes.push(fetchProductionJobs({ limit: 1000 }).then((jobs) => {
      const atrasadas = (jobs || []).filter((j) => {
        if (!j.prazo_em || ['entregue', 'arquivado'].includes(j.status)) return false;
        const prazo = new Date(j.prazo_em).getTime();
        return Number.isFinite(prazo) && prazo < Date.now();
      });
      if (atrasadas.length) itens.push({ nivel: 'critico', icone: Clapperboard, titulo: `${atrasadas.length} ${atrasadas.length === 1 ? 'entrega atrasada' : 'entregas atrasadas'} na produção`, detalhe: atrasadas.slice(0, 3).map((j) => j.cliente_nome || j.titulo || 'Demanda').join(', '), href: '/producao' });
    }));
  }

  await Promise.allSettled(fontes);
  return itens.sort((a, b) => PESO[a.nivel] - PESO[b.nivel]);
}

export default function HojePanel({ atualizarEm }) {
  const { can } = useAuth();
  const [itens, setItens] = useState(null);

  useEffect(() => {
    let ativo = true;
    carregarItens(can).then((lista) => { if (ativo) setItens(lista); }).catch(() => { if (ativo) setItens([]); });
    return () => { ativo = false; };
  }, [can, atualizarEm]);

  return (
    <section className="dashboard-panel">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="dashboard-panel-title text-base">Para fazer hoje</h2>
          <p className="dashboard-panel-description">O que cada área precisa de vocês agora, do mais urgente para o menos.</p>
        </div>
        {itens && itens.length > 0 && (
          <span className="text-xs text-hagav-gray">{itens.length} {itens.length === 1 ? 'item' : 'itens'}</span>
        )}
      </div>

      {itens === null ? (
        <p className="mt-4 text-sm text-hagav-gray">Conferindo todas as áreas...</p>
      ) : itens.length === 0 ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-hagav-light">
          <CheckCircle2 size={16} className="text-emerald-400" aria-hidden="true" />
          Tudo em dia: nenhuma pendência nas áreas que você acompanha.
        </div>
      ) : (
        <ul className="mt-4 grid grid-cols-1 gap-2 lg:grid-cols-2">
          {itens.slice(0, 10).map((item) => {
            const nivel = NIVEIS[item.nivel] || NIVEIS.info;
            const Icone = item.icone || nivel.icone;
            const NivelIcone = nivel.icone;
            return (
              <li key={`${item.href}-${item.titulo}`}>
                <Link
                  href={item.href}
                  className="flex h-full items-start gap-3 rounded-xl border border-hagav-border bg-hagav-surface px-3.5 py-3 transition-colors hover:border-hagav-muted"
                >
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-hagav-border bg-hagav-card">
                    <Icone size={15} className="text-hagav-light" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: nivel.cor }}>
                      <NivelIcone size={11} aria-hidden="true" /> {nivel.rotulo}
                    </span>
                    <span className="block text-sm font-medium text-hagav-white">{item.titulo}</span>
                    {item.detalhe && <span className="mt-0.5 block text-xs text-hagav-gray line-clamp-2">{item.detalhe}</span>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

