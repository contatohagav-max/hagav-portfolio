'use client';

import { useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

async function postMonitor(payload) {
  try {
    await fetch('/api/admin-monitor', {
      method: 'POST',
      credentials: 'include',
      keepalive: true,
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload),
    });
  } catch {
    // no-op
  }
}

export default function AppShell({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    function handleWindowError(event) {
      postMonitor({
        origin: 'window.error',
        path: window.location.pathname,
        message: event?.message || 'Erro inesperado no painel',
        stack: event?.error?.stack || '',
      });
    }

    function handleUnhandledRejection(event) {
      postMonitor({
        origin: 'window.unhandledrejection',
        path: window.location.pathname,
        message: event?.reason?.message || String(event?.reason || 'Promise rejection'),
        stack: event?.reason?.stack || '',
      });
    }

    window.addEventListener('error', handleWindowError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    return () => {
      window.removeEventListener('error', handleWindowError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  return (
    <div className="flex h-screen bg-hagav-black overflow-hidden">
      {sidebarOpen ? (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-[1px] z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Topbar onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto bg-hagav-black px-4 py-5 md:px-5 md:py-6 xl:px-7 xl:py-7">
          {children}
        </main>
      </div>
    </div>
  );
}
