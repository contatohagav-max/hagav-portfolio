import Link from 'next/link';
import { ArrowLeft, ShieldAlert } from 'lucide-react';

export default function AcessoNegadoPage() {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="hcard space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <ShieldAlert size={18} className="text-red-300" />
          </div>
          <div>
            <h1 className="page-title">Acesso negado</h1>
            <p className="page-subtitle">Seu perfil nao tem permissao para abrir esta area do painel.</p>
          </div>
        </div>

        <div className="rounded-2xl border border-hagav-border bg-hagav-surface/40 px-4 py-4 text-sm text-hagav-light leading-6">
          Se voce precisa acessar configuracoes ou outra area restrita, ajuste a role do usuario antes de subir o painel em producao.
        </div>

        <div className="flex flex-wrap gap-3">
          <Link href="/" className="btn-ghost">
            <ArrowLeft size={14} />
            Voltar ao dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
