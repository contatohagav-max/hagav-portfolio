'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Users, FileText, Kanban, Settings, X, Zap,
} from 'lucide-react';
import { classNames } from '@/lib/utils';

const NAV = [
  { href: '/',               label: 'Dashboard',    icon: LayoutDashboard },
  { href: '/leads',          label: 'Leads',        icon: Users },
  { href: '/orcamentos',     label: 'Orçamentos',   icon: FileText },
  { href: '/pipeline',       label: 'Pipeline',     icon: Kanban },
  { href: '/configuracoes',  label: 'Configurações', icon: Settings },
];

export default function Sidebar({ open, onClose }) {
  const pathname = usePathname();

  return (
    <aside
      className={classNames(
        'fixed lg:static inset-y-0 left-0 z-30 flex flex-col',
        'w-60 bg-hagav-dark border-r border-hagav-border',
        'transition-transform duration-200 ease-in-out',
        open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
      )}
    >
      {/* Logo */}
      <div className="flex items-center justify-between px-5 py-5 border-b border-hagav-border">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-gold-gradient flex items-center justify-center">
            <Zap size={14} className="text-hagav-black" fill="currentColor" />
          </div>
          <div>
            <p className="text-sm font-bold tracking-widest text-hagav-gold uppercase">HAGAV</p>
            <p className="text-[10px] text-hagav-gray leading-none">Painel Interno</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="lg:hidden text-hagav-gray hover:text-hagav-white p-1 rounded"
        >
          <X size={16} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/' && pathname.startsWith(href));
          return (
            <Link key={href} href={href} onClick={onClose}>
              <span className={classNames('nav-item', active && 'active')}>
                <Icon size={16} strokeWidth={active ? 2.5 : 1.8} />
                {label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-hagav-border">
        <p className="text-[10px] text-hagav-gray/60 uppercase tracking-widest">HAGAV Studio</p>
        <p className="text-[10px] text-hagav-gray/40">v1.0.0 · Interno</p>
      </div>
    </aside>
  );
}
