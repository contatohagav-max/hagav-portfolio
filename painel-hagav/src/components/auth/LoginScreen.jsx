'use client';

import { useState } from 'react';
import { Eye, EyeOff, Loader2, LogIn, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

function normalizeUiError(error) {
  const raw = String(error?.message || error || '').toLowerCase();
  if (raw.includes('muitas tentativas') || raw.includes('rate_limited')) {
    return 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.';
  }
  if (raw.includes('incorretos') || raw.includes('invalid login')) {
    return 'E-mail ou senha incorretos.';
  }
  if (raw.includes('desativado') || raw.includes('inactive')) {
    return 'Seu acesso ao painel esta desativado.';
  }
  if (raw.includes('liberado para o painel')) {
    return 'Seu usuario ainda nao foi liberado para o painel.';
  }
  return error?.message || 'Erro ao entrar.';
}

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!email || !password) {
      setError('Preencha e-mail e senha.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (err) {
      setError(normalizeUiError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-hagav-black flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[520px] bg-hagav-gold/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm animate-slide-up">
        <div className="flex flex-col items-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/admin/hagav-logo.png"
            alt="HAGAV Studio"
            className="h-20 w-auto object-contain drop-shadow-lg"
          />
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-hagav-gold/25 bg-hagav-gold/10 px-3 py-1">
            <ShieldCheck size={13} className="text-hagav-gold" />
            <span className="text-[10px] uppercase tracking-[0.22em] text-hagav-gold">Painel protegido</span>
          </div>
        </div>

        <div className="relative bg-hagav-dark border border-hagav-border rounded-2xl p-7 shadow-modal overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gold-gradient" />

          <h2 className="text-sm font-semibold text-hagav-white mb-1">Acesso restrito</h2>
          <p className="text-xs text-hagav-gray mb-5">Login real com sessao protegida para ambiente de producao.</p>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="seu-email@empresa.com"
                autoComplete="email"
                className="hinput w-full"
              />
            </div>

            <div>
              <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">Senha</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Digite sua senha"
                  autoComplete="current-password"
                  className="hinput w-full pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((value) => !value)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-hagav-gray hover:text-hagav-light"
                >
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {error ? (
              <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </p>
            ) : null}

            <button type="submit" disabled={loading} className="btn-gold w-full justify-center mt-2">
              {loading ? <Loader2 size={15} className="animate-spin" /> : <LogIn size={15} />}
              {loading ? 'Entrando...' : 'Entrar no painel'}
            </button>
          </form>
        </div>

        <p className="text-center text-[10px] text-hagav-gray/40 mt-6 tracking-wider uppercase">
          HAGAV Studio Â· Acesso interno
        </p>
      </div>
    </div>
  );
}
