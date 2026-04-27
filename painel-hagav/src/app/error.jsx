'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function GlobalError({ error, reset }) {
  return (
    <div className="min-h-screen bg-hagav-black flex items-center justify-center p-4">
      <div className="w-full max-w-lg hcard space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <AlertTriangle size={18} className="text-red-300" />
          </div>
          <div>
            <h1 className="page-title">Erro interno do painel</h1>
            <p className="page-subtitle">O incidente foi registrado para monitoramento.</p>
          </div>
        </div>
        <div className="rounded-2xl border border-hagav-border bg-hagav-surface/40 px-4 py-4 text-sm text-hagav-light leading-6">
          {error?.message || 'Erro inesperado.'}
        </div>
        <button type="button" onClick={reset} className="btn-gold">
          <RefreshCw size={14} />
          Tentar novamente
        </button>
      </div>
    </div>
  );
}
