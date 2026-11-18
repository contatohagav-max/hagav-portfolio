'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, ChevronDown, LogOut, Menu, Search, Shield, User } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { roleLabel } from '@/lib/auth';
import { fetchNotifications, markNotificationsRead } from '@/lib/prospeccao-repository';
import { fmtRelative } from '@/lib/utils';

function parseScopedSearch(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;

  const match = value.match(/^(lead|leads|orcamento|orcamentos|orc|cliente|clientes)\s*:\s*(.+)$/i);
  if (!match) return null;

  const scope = String(match[1] || '').toLowerCase();
  const query = String(match[2] || '').trim();
  if (!query) return null;

  if (scope === 'lead' || scope === 'leads') return { targetBase: '/leads', query };
  if (scope === 'orcamento' || scope === 'orcamentos' || scope === 'orc') return { targetBase: '/orcamentos', query };
  if (scope === 'cliente' || scope === 'clientes') return { targetBase: '/clientes', query };
  return null;
}

function NotificationBell({ enabled }) {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;
    const refresh = () => fetchNotifications({ limit: 12 })
      .then((rows) => { if (active) setItems(rows || []); })
      .catch(() => { if (active) setItems([]); });
    refresh();
    const timer = setInterval(refresh, 120000);
    return () => { active = false; clearInterval(timer); };
  }, [enabled]);

  useEffect(() => {
    if (!open) return undefined;
    const handler = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!enabled) return null;
  const unread = items.filter((item) => !item.lida_em).length;

  async function markAllRead() {
    try {
      await markNotificationsRead({ all: true });
      setItems((prev) => prev.map((item) => ({ ...item, lida_em: item.lida_em || new Date().toISOString() })));
    } catch {
      // sem permissao ou tabela ausente: mantem como esta
    }
  }

  function openItem(item) {
    setOpen(false);
    if (item.prospect_id) {
      router.push(`/prospeccao?id=${item.prospect_id}`);
      return;
    }
    const link = String(item.link || '').replace(/^\/admin/, '');
    if (link.startsWith('/')) router.push(link);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        title={unread > 0 ? `${unread} aviso(s) novo(s)` : 'Avisos'}
        className="relative text-hagav-gray hover:text-hagav-white p-2 rounded-lg border border-hagav-border/70 bg-hagav-surface/45 transition-colors"
      >
        <Bell size={17} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-hagav-gold text-hagav-black text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-[min(360px,90vw)] rounded-2xl border border-hagav-border bg-hagav-card shadow-card z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-hagav-border">
            <p className="text-sm font-semibold text-hagav-white">Avisos</p>
            {unread > 0 && (
              <button type="button" onClick={markAllRead} className="text-[11px] text-hagav-gold hover:text-hagav-gold-light">
                Marcar como lidos
              </button>
            )}
          </div>
          <div className="max-h-[360px] overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-6 text-xs text-hagav-gray text-center">Nenhum aviso por enquanto.</p>
            ) : items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => openItem(item)}
                className={`w-full text-left px-4 py-3 border-b border-hagav-border/50 hover:bg-hagav-muted/25 transition-colors ${item.lida_em ? '' : 'bg-hagav-gold/5'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className={`text-sm ${item.lida_em ? 'text-hagav-light' : 'text-hagav-white font-medium'}`}>{item.titulo}</p>
                  <span className="text-[10px] text-hagav-gray whitespace-nowrap">{fmtRelative(item.created_at)}</span>
                </div>
                {item.corpo && <p className="text-xs text-hagav-gray mt-1 line-clamp-2">{item.corpo}</p>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Topbar({ onMenuClick }) {
  const router = useRouter();
  const pathname = usePathname();
  const { session, actor, logout, can } = useAuth();
  const canSeeNotifications = typeof can === 'function' && can('readProspeccao');
  const [searchVal, setSearchVal] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const email = actor?.email || session?.user?.email || 'Admin';
  const role = actor?.role || 'viewer';

  useEffect(() => {
    function handler(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function handleGlobalSearch(event) {
    event.preventDefault();
    const query = String(searchVal || '').trim();
    if (!query) return;

    const scoped = parseScopedSearch(query);
    if (scoped) {
      router.push(`${scoped.targetBase}?search=${encodeURIComponent(scoped.query)}`);
      return;
    }

    const targetBase = pathname?.startsWith('/orcamentos')
      ? '/orcamentos'
      : pathname?.startsWith('/clientes')
        ? '/clientes'
        : '/leads';
    router.push(`${targetBase}?search=${encodeURIComponent(query)}`);
  }

  return (
    <header className="h-16 flex items-center gap-3 px-4 lg:px-6 bg-hagav-dark/95 border-b border-hagav-border shrink-0 backdrop-blur-md">
      <button
        onClick={onMenuClick}
        className="lg:hidden text-hagav-gray hover:text-hagav-white p-2 rounded-lg hover:bg-hagav-muted/30 transition-colors"
      >
        <Menu size={18} />
      </button>

      <form onSubmit={handleGlobalSearch} className="flex-1 max-w-xl relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-hagav-gray pointer-events-none" />
        <input
          type="text"
          placeholder="Buscar e filtrar (use lead, orc, cliente)"
          value={searchVal}
          onChange={(event) => setSearchVal(event.target.value)}
          className="hinput w-full pl-8 text-sm"
        />
      </form>

      <div className="hidden md:flex items-center gap-2 rounded-full border border-hagav-border bg-hagav-surface/60 px-3 py-1.5">
        <Shield size={13} className="text-hagav-gold" />
        <span className="text-[10px] uppercase tracking-[0.22em] text-hagav-gold">{roleLabel(role)}</span>
      </div>

      <NotificationBell enabled={canSeeNotifications} />

      <div className="relative pl-2 border-l border-hagav-border" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((value) => !value)}
          className="flex items-center gap-2 cursor-pointer group rounded-xl px-2.5 py-1.5 hover:bg-hagav-muted/25 transition-colors"
        >
          <div className="w-7 h-7 rounded-full bg-hagav-gold/20 border border-hagav-gold/30 flex items-center justify-center">
            <User size={13} className="text-hagav-gold" />
          </div>
          <span className="hidden sm:block text-sm font-medium text-hagav-light group-hover:text-hagav-white transition-colors max-w-[140px] truncate">
            {email}
          </span>
          <ChevronDown size={13} className="text-hagav-gray hidden sm:block" />
        </button>

        {menuOpen ? (
          <div className="absolute right-0 top-12 w-60 bg-hagav-dark border border-hagav-border rounded-xl shadow-modal z-50 animate-fade-in overflow-hidden">
            <div className="px-4 py-3 border-b border-hagav-border">
              <p className="text-xs text-hagav-gray">Conectado como</p>
              <p className="text-sm font-medium text-hagav-white truncate">{email}</p>
              <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-hagav-gold/25 bg-hagav-gold/10 px-2.5 py-1">
                <Shield size={12} className="text-hagav-gold" />
                <span className="text-[10px] uppercase tracking-[0.2em] text-hagav-gold">{roleLabel(role)}</span>
              </div>
            </div>
            <button
              onClick={() => {
                setMenuOpen(false);
                logout();
              }}
              className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <LogOut size={14} />
              Sair do painel
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
