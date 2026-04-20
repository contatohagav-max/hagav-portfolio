'use client';

import { useState, useRef, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, Search, Bell, LogOut, User, ChevronDown } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export default function Topbar({ onMenuClick }) {
  const router = useRouter();
  const pathname = usePathname();
  const { session, logout } = useAuth();
  const [searchVal, setSearchVal]   = useState('');
  const [menuOpen, setMenuOpen]     = useState(false);
  const menuRef = useRef(null);

  const email = session?.user?.email ?? 'Admin';

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function handleGlobalSearch(event) {
    event.preventDefault();
    const query = searchVal.trim();
    if (!query) return;

    const targetBase = pathname?.startsWith('/orcamentos')
      ? '/orcamentos'
      : pathname?.startsWith('/clientes')
        ? '/clientes'
        : '/leads';
    router.push(`${targetBase}?search=${encodeURIComponent(query)}`);
  }

  return (
    <header className="h-14 flex items-center gap-3 px-4 lg:px-6 bg-hagav-dark border-b border-hagav-border shrink-0">
      {/* Mobile menu */}
      <button
        onClick={onMenuClick}
        className="lg:hidden text-hagav-gray hover:text-hagav-white p-1.5 rounded-lg hover:bg-hagav-muted/30"
      >
        <Menu size={18} />
      </button>

      {/* Search */}
      <form onSubmit={handleGlobalSearch} className="flex-1 max-w-md relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-hagav-gray pointer-events-none" />
        <input
          type="text"
          placeholder="Buscar lead, orcamento ou cliente e pressionar Enter"
          value={searchVal}
          onChange={e => setSearchVal(e.target.value)}
          className="hinput w-full pl-8 py-1.5 text-sm"
        />
      </form>

      <div className="flex-1" />

      {/* Notifications */}
      <button
        type="button"
        disabled
        title="Notificacoes em breve"
        className="relative text-hagav-gray/60 p-2 rounded-lg cursor-not-allowed"
      >
        <Bell size={17} />
      </button>

      {/* Profile dropdown */}
      <div className="relative pl-2 border-l border-hagav-border" ref={menuRef}>
        <button
          onClick={() => setMenuOpen(v => !v)}
          className="flex items-center gap-2 cursor-pointer group"
        >
          <div className="w-7 h-7 rounded-full bg-hagav-gold/20 border border-hagav-gold/30 flex items-center justify-center">
            <User size={13} className="text-hagav-gold" />
          </div>
          <span className="hidden sm:block text-sm font-medium text-hagav-light group-hover:text-hagav-white transition-colors max-w-[120px] truncate">
            {email}
          </span>
          <ChevronDown size={13} className="text-hagav-gray hidden sm:block" />
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-10 w-52 bg-hagav-dark border border-hagav-border rounded-xl shadow-modal z-50 animate-fade-in overflow-hidden">
            <div className="px-4 py-3 border-b border-hagav-border">
              <p className="text-xs text-hagav-gray">Conectado como</p>
              <p className="text-sm font-medium text-hagav-white truncate">{email}</p>
            </div>
            <button
              onClick={() => { setMenuOpen(false); logout(); }}
              className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <LogOut size={14} />
              Sair do painel
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
