'use client';

import { useEffect, useState } from 'react';
import { Save, RefreshCw, SlidersHorizontal, BarChart3, ShieldCheck } from 'lucide-react';
import { fetchCommercialSettings, saveCommercialSettings } from '@/lib/supabase';
import { COMMERCIAL_DEFAULTS } from '@/lib/commercial';

function Section({ icon: Icon, title, description, children }) {
  return (
    <div className="hcard space-y-4">
      <div className="flex items-start gap-2.5 pb-3 border-b border-hagav-border">
        <div className="w-8 h-8 rounded-lg bg-hagav-muted/40 border border-hagav-border flex items-center justify-center">
          <Icon size={15} className="text-hagav-gold" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-hagav-white">{title}</h2>
          {description && <p className="text-xs text-hagav-gray mt-0.5">{description}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

function NumberField({ label, value, onChange, step = 1, min = 0 }) {
  return (
    <label className="space-y-1">
      <span className="text-xs text-hagav-gray uppercase tracking-wider">{label}</span>
      <input
        type="number"
        className="hinput w-full"
        value={value}
        min={min}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

export default function ConfiguracoesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const [scoreWeights, setScoreWeights] = useState(COMMERCIAL_DEFAULTS.scoreWeights);
  const [pricing, setPricing] = useState(COMMERCIAL_DEFAULTS.pricing);
  const [pipelineStatusText, setPipelineStatusText] = useState(COMMERCIAL_DEFAULTS.pipelineStatus.join(', '));

  async function load() {
    setLoading(true);
    setError('');
    try {
      const settings = await fetchCommercialSettings();
      setScoreWeights(settings.scoreWeights || COMMERCIAL_DEFAULTS.scoreWeights);
      setPricing(settings.pricing || COMMERCIAL_DEFAULTS.pricing);
      setPipelineStatusText((settings.pipelineStatus || COMMERCIAL_DEFAULTS.pipelineStatus).join(', '));
    } catch (err) {
      console.error('[Configuracoes]', err);
      setError('Nao foi possivel carregar configuracoes.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError('');

    const pipelineStatus = pipelineStatusText
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);

    try {
      await saveCommercialSettings({
        scoreWeights,
        pricing,
        pipelineStatus,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2200);
    } catch (err) {
      console.error('[Configuracoes] save', err);
      setError(err.message || 'Falha ao salvar configuracoes.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5 animate-fade-in max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-hagav-white">Configuracoes comerciais</h1>
          <p className="text-xs text-hagav-gray mt-0.5">Ajuste regras de score, precificacao e pipeline sem alterar codigo.</p>
        </div>
        <button onClick={load} disabled={loading} className="btn-ghost btn-sm">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Recarregar
        </button>
      </div>

      <Section
        icon={BarChart3}
        title="Pesos de score"
        description="Ajusta como o painel classifica leads em quente, morno e frio."
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <NumberField
            label="Urgencia alta"
            value={scoreWeights.urgenciaAlta}
            onChange={(value) => setScoreWeights((prev) => ({ ...prev, urgenciaAlta: value }))}
          />
          <NumberField
            label="Fluxo recorrente"
            value={scoreWeights.fluxoRecorrente}
            onChange={(value) => setScoreWeights((prev) => ({ ...prev, fluxoRecorrente: value }))}
          />
          <NumberField
            label="Referencia visual"
            value={scoreWeights.referenciaVisual}
            onChange={(value) => setScoreWeights((prev) => ({ ...prev, referenciaVisual: value }))}
          />
          <NumberField
            label="Material gravado"
            value={scoreWeights.materialGravado}
            onChange={(value) => setScoreWeights((prev) => ({ ...prev, materialGravado: value }))}
          />
          <NumberField
            label="Servico alto valor"
            value={scoreWeights.servicoAltoValor}
            onChange={(value) => setScoreWeights((prev) => ({ ...prev, servicoAltoValor: value }))}
          />
        </div>
      </Section>

      <Section
        icon={SlidersHorizontal}
        title="Regras de precificacao"
        description="Multiplicadores base usados no preco sugerido e valor estimado."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <NumberField
            label="Urgencia 24h"
            value={pricing.urgencia24h}
            step={0.01}
            min={0.5}
            onChange={(value) => setPricing((prev) => ({ ...prev, urgencia24h: value }))}
          />
          <NumberField
            label="Urgencia semana"
            value={pricing.urgenciaSemana}
            step={0.01}
            min={0.5}
            onChange={(value) => setPricing((prev) => ({ ...prev, urgenciaSemana: value }))}
          />
          <NumberField
            label="Material nao gravado"
            value={pricing.materialNaoGravado}
            step={0.01}
            min={0.5}
            onChange={(value) => setPricing((prev) => ({ ...prev, materialNaoGravado: value }))}
          />
          <NumberField
            label="Recorrencia 40+"
            value={pricing.recorrencia40Plus}
            step={0.01}
            min={0.5}
            onChange={(value) => setPricing((prev) => ({ ...prev, recorrencia40Plus: value }))}
          />
        </div>
      </Section>

      <Section
        icon={ShieldCheck}
        title="Pipeline e operacao"
        description="Lista de status validos usados no funil."
      >
        <label className="space-y-1 block">
          <span className="text-xs text-hagav-gray uppercase tracking-wider">Status (separados por virgula)</span>
          <input
            type="text"
            value={pipelineStatusText}
            onChange={(event) => setPipelineStatusText(event.target.value)}
            className="hinput w-full"
          />
        </label>
        <p className="text-xs text-hagav-gray">
          Sugestao: novo, chamado, proposta enviada, fechado, perdido.
        </p>
      </Section>

      {error && (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
      )}

      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving || loading} className="btn-gold">
          {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
          {saved ? 'Salvo!' : 'Salvar configuracoes'}
        </button>
      </div>
    </div>
  );
}
