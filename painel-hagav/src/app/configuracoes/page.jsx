'use client';

import { useState } from 'react';
import { Save, Eye, EyeOff, Database, Palette, Bell, Shield } from 'lucide-react';

function Section({ icon: Icon, title, children }) {
  return (
    <div className="hcard space-y-4">
      <div className="flex items-center gap-2.5 pb-3 border-b border-hagav-border">
        <div className="w-8 h-8 rounded-lg bg-hagav-muted/40 border border-hagav-border flex items-center justify-center">
          <Icon size={15} className="text-hagav-gold" />
        </div>
        <h2 className="text-sm font-semibold text-hagav-white">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Field({ label, description, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-2">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-hagav-light">{label}</p>
        {description && <p className="text-xs text-hagav-gray mt-0.5">{description}</p>}
      </div>
      <div className="sm:w-64">{children}</div>
    </div>
  );
}

export default function ConfiguracoesPage() {
  const [supabaseUrl, setSupabaseUrl]   = useState(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
  const [supabaseKey, setSupabaseKey]   = useState('');
  const [showKey, setShowKey]           = useState(false);
  const [adminKey, setAdminKey]         = useState('');
  const [showAdminKey, setShowAdminKey] = useState(false);
  const [saved, setSaved]               = useState(false);

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="space-y-5 animate-fade-in max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-hagav-white">Configurações</h1>
        <p className="text-xs text-hagav-gray mt-0.5">Preferências do painel interno HAGAV.</p>
      </div>

      {/* Supabase */}
      <Section icon={Database} title="Conexão Supabase">
        <Field
          label="URL do projeto"
          description="NEXT_PUBLIC_SUPABASE_URL no .env.local"
        >
          <input
            type="text"
            value={supabaseUrl}
            onChange={e => setSupabaseUrl(e.target.value)}
            placeholder="https://xxx.supabase.co"
            className="hinput w-full text-sm"
          />
        </Field>
        <Field
          label="Chave anon"
          description="NEXT_PUBLIC_SUPABASE_ANON_KEY no .env.local"
        >
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={supabaseKey}
              onChange={e => setSupabaseKey(e.target.value)}
              placeholder="eyJhbGciOiJIUzI1NiIs…"
              className="hinput w-full text-sm pr-9"
            />
            <button
              type="button"
              onClick={() => setShowKey(v => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-hagav-gray hover:text-hagav-light"
            >
              {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          </div>
        </Field>
        <div className="bg-hagav-surface border border-hagav-border rounded-lg p-3 text-xs text-hagav-gray">
          <strong className="text-hagav-light">Importante:</strong> as credenciais são lidas do arquivo{' '}
          <code className="bg-hagav-muted/50 px-1 py-0.5 rounded text-hagav-gold">.env.local</code>.
          Configure o arquivo e reinicie o servidor.
        </div>
      </Section>

      {/* Acesso */}
      <Section icon={Shield} title="Acesso interno">
        <Field
          label="Chave de acesso admin"
          description="Proteção simples do painel. Use variável de ambiente ADMIN_KEY."
        >
          <div className="relative">
            <input
              type={showAdminKey ? 'text' : 'password'}
              value={adminKey}
              onChange={e => setAdminKey(e.target.value)}
              placeholder="••••••••"
              className="hinput w-full text-sm pr-9"
            />
            <button
              type="button"
              onClick={() => setShowAdminKey(v => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-hagav-gray hover:text-hagav-light"
            >
              {showAdminKey ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          </div>
        </Field>
      </Section>

      {/* Notificações */}
      <Section icon={Bell} title="Notificações">
        {[
          { label: 'Novo lead recebido',         description: 'Alerta ao receber um lead novo' },
          { label: 'Orçamento pendente revisão', description: 'Lembrete de orçamentos em espera' },
          { label: 'Lead sem contato em 48h',    description: 'Aviso de leads esquecidos' },
        ].map(({ label, description }) => (
          <Field key={label} label={label} description={description}>
            <label className="flex items-center gap-2 cursor-pointer">
              <div className="relative">
                <input type="checkbox" className="sr-only peer" defaultChecked />
                <div className="w-9 h-5 bg-hagav-muted peer-checked:bg-hagav-gold rounded-full transition-colors" />
                <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4 shadow" />
              </div>
              <span className="text-xs text-hagav-gray peer-checked:text-hagav-light">Ativo</span>
            </label>
          </Field>
        ))}
        <div className="bg-hagav-surface border border-hagav-border rounded-lg p-3 text-xs text-hagav-gray">
          Notificações em tempo real via Supabase Realtime estão prontas para ativar. Configure webhooks conforme necessário.
        </div>
      </Section>

      {/* Aparência */}
      <Section icon={Palette} title="Aparência">
        <Field label="Tema" description="O painel é fixo em modo escuro premium HAGAV.">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-hagav-black border border-hagav-gold" />
            <span className="text-sm text-hagav-light">Escuro · HAGAV Gold</span>
          </div>
        </Field>
        <Field label="Versão" description="Versão atual do painel.">
          <span className="text-sm text-hagav-gray font-mono">v1.0.0</span>
        </Field>
      </Section>

      {/* Save */}
      <div className="flex justify-end">
        <button onClick={handleSave} className="btn-gold">
          <Save size={14} />
          {saved ? 'Salvo!' : 'Salvar configurações'}
        </button>
      </div>
    </div>
  );
}
