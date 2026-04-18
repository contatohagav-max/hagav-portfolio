'use client';

import { useState } from 'react';
// Using img instead of next/image to avoid basePath prefix on static asset
import { LogIn, Loader2, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

const TEST_LOGIN_EMAIL = 'admin.hagav@gmail.com';
const TEST_LOGIN_PASSWORD = '123';

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail]       = useState(TEST_LOGIN_EMAIL);
  const [password, setPassword] = useState(TEST_LOGIN_PASSWORD);
  const [showPw, setShowPw]     = useState(false);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email || !password) { setError('Preencha e-mail e senha.'); return; }
    setLoading(true);
    setError('');
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err.message?.includes('Invalid login')
        ? 'E-mail ou senha incorretos.'
        : err.message ?? 'Erro ao entrar.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-hagav-black flex items-center justify-center p-4">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-hagav-gold/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm animate-slide-up">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/admin/hagav-logo.png"
            alt="HAGAV Studio"
            className="h-20 w-auto object-contain drop-shadow-lg"
            onError={(e) => { e.currentTarget.src = '/hagav-logo.png'; }}
          />
          <p className="text-xs text-hagav-gray mt-3 tracking-wider uppercase">Painel Interno</p>
        </div>

        {/* Card */}
        <div className="relative bg-hagav-dark border border-hagav-border rounded-2xl p-7 shadow-modal overflow-hidden">
          {/* top accent */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gold-gradient" />

          <h2 className="text-sm font-semibold text-hagav-white mb-5">Acesso restrito</h2>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder={TEST_LOGIN_EMAIL}
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
                  onChange={e => setPassword(e.target.value)}
                  placeholder={TEST_LOGIN_PASSWORD}
                  autoComplete="current-password"
                  className="hinput w-full pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-hagav-gray hover:text-hagav-light"
                >
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-gold w-full justify-center mt-2"
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : <LogIn size={15} />}
              {loading ? 'Entrando…' : 'Entrar no painel'}
            </button>
          </form>
        </div>

        <p className="text-center text-[10px] text-hagav-gray/40 mt-6 tracking-wider uppercase">
          HAGAV Studio · Acesso interno
        </p>
      </div>
    </div>
  );
}
