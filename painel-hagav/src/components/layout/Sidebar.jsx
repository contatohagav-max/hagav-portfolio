'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Clapperboard, FileText, Kanban, Landmark, LayoutDashboard, Settings, Users, X } from 'lucide-react';
import EduTooltip from '@/components/ui/EduTooltip';
import { useAuth } from '@/context/AuthContext';
import { classNames } from '@/lib/utils';
import { roleLabel } from '@/lib/auth';

const NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, permission: 'readDashboard' },
  { href: '/leads', label: 'Leads', icon: Users, permission: 'readLeads' },
  { href: '/orcamentos', label: 'Orçamentos', icon: FileText, permission: 'readOrcamentos' },
  { href: '/clientes', label: 'Clientes', icon: Users, permission: 'readClientes' },
  { href: '/pipeline', label: 'Pipeline', icon: Kanban, permission: 'readPipeline' },
  { href: '/producao', label: 'Produção', icon: Clapperboard, permission: 'readProducao' },
  { href: '/financeiro', label: 'Financeiro', icon: Landmark, permission: 'readFinanceiro' },
  { href: '/configuracoes', label: 'Configurações', icon: Settings, permission: 'manageSettings' },
];

const NAV_TOOLTIPS = {
  '/': {
    title: 'Dashboard',
    whatIs: 'Visão executiva dos indicadores comerciais.',
    purpose: 'Acompanhar performance diária e prioridades do funil.',
    observe: 'Foque em conversão, urgências e follow-up atrasado.',
  },
  '/leads': {
    title: 'Leads',
    whatIs: 'Etapa de triagem e qualificação dos novos contatos.',
    purpose: 'Validar lead real antes de gerar orçamento.',
    observe: 'Somente leads qualificados devem seguir para Orçamentos.',
  },
  '/orcamentos': {
    title: 'Orçamentos',
    whatIs: 'Etapa comercial de proposta, ajuste e fechamento.',
    purpose: 'Precificar, negociar e aprovar proposta comercial.',
    observe: 'Mantenha foco em proposta_enviada, ajustando e aprovado.',
  },
  '/clientes': {
    title: 'Clientes',
    whatIs: 'Carteira de contratos fechados e pós-venda.',
    purpose: 'Acompanhar vigência, renovação e reenvio de documentos.',
    observe: 'Priorize contratos com renovação próxima.',
  },
  '/pipeline': {
    title: 'Pipeline',
    whatIs: 'Quadro visual das etapas do processo comercial.',
    purpose: 'Mover oportunidades com clareza de status.',
    observe: 'Evite acúmulo em Novo, Contatado e Qualificado.',
  },
  '/producao': {
    title: 'Produção',
    whatIs: 'Kanban das demandas aprovadas e em execução.',
    purpose: 'Controlar materiais, edição, revisão, render e entrega.',
    observe: 'Toda demanda deve ter responsável, prazo e próxima ação.',
  },
  '/financeiro': {
    title: 'Financeiro',
    whatIs: 'Caixa operacional ligado aos projetos aprovados.',
    purpose: 'Acompanhar recebimentos, custos, vencimentos e margem.',
    observe: 'Priorize contas atrasadas e atualize pagamentos realizados.',
  },
};

export default function Sidebar({ open, onClose }) {
  const pathname = usePathname();
  const { actor, can } = useAuth();

  return (
    <aside className={classNames(
      'fixed lg:static inset-y-0 left-0 z-30 flex flex-col',
      'w-64 bg-hagav-dark/95 border-r border-hagav-border backdrop-blur-md',
      'transition-transform duration-200 ease-in-out',
      open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
    )}>
      <div className="flex items-center justify-between px-4 py-4 border-b border-hagav-border">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/admin/hagav-logo.png" alt="HAGAV Studio" className="h-10 w-auto object-contain" />
        </div>
        <button onClick={onClose} className="lg:hidden text-hagav-gray hover:text-hagav-white p-1 rounded">
          <X size={16} />
        </button>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV.filter((item) => item.permission ? can(item.permission) : true).map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/' && pathname.startsWith(href));
          const tooltip = NAV_TOOLTIPS[href];
          return (
            <EduTooltip
              key={href}
              enabled={Boolean(tooltip)}
              side="right"
              className="w-full"
              panelClassName="w-[230px]"
              {...tooltip}
            >
              <Link href={href} onClick={onClose}>
                <span className={classNames('nav-item', active && 'active')}>
                  <Icon size={16} strokeWidth={active ? 2.5 : 1.8} />
                  {label}
                </span>
              </Link>
            </EduTooltip>
          );
        })}
      </nav>

      <div className="px-5 py-4 border-t border-hagav-border">
        <p className="text-[10px] text-hagav-gray/60 uppercase tracking-widest">HAGAV Studio</p>
        <p className="text-[10px] text-hagav-gray/40">Acesso {roleLabel(actor?.role || 'viewer')}</p>
      </div>
    </aside>
  );
}
