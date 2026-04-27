'use client';

import { useEffect, useMemo, useState } from 'react';
import { Save, RefreshCw, SlidersHorizontal, BarChart3, ShieldCheck, Settings2 } from 'lucide-react';
import { fetchCommercialSettings, saveCommercialSettings } from '@/lib/supabase';
import { COMMERCIAL_DEFAULTS, normalizePricingRules } from '@/lib/commercial';

function Section({ icon: Icon, title, description, children }) {
  return (
    <div className="hcard space-y-4">
      <div className="flex items-start gap-2.5 pb-3 border-b border-hagav-border">
        <div className="w-8 h-8 rounded-lg bg-hagav-muted/40 border border-hagav-border flex items-center justify-center">
          <Icon size={15} className="text-hagav-gold" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-hagav-white">{title}</h2>
          {description ? <p className="text-xs text-hagav-gray mt-0.5">{description}</p> : null}
        </div>
      </div>
      {children}
    </div>
  );
}

function NumberField({ label, value, onChange, step = 1, min = 0, max }) {
  return (
    <label className="space-y-1">
      <span className="text-xs text-hagav-gray uppercase tracking-wider">{label}</span>
      <input
        type="number"
        className="hinput w-full"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          const parsed = Number(event.target.value);
          onChange(Number.isFinite(parsed) ? parsed : 0);
        }}
      />
    </label>
  );
}

function SelectField({ label, value, onChange, options = [] }) {
  return (
    <label className="space-y-1">
      <span className="text-xs text-hagav-gray uppercase tracking-wider">{label}</span>
      <select className="hselect w-full" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function deepMerge(base, override) {
  if (!override || typeof override !== 'object') return base;
  if (!base || typeof base !== 'object') return override;
  const merged = { ...base };
  Object.entries(override).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      merged[key] = value.slice();
      return;
    }
    if (value && typeof value === 'object') {
      merged[key] = deepMerge(base[key], value);
      return;
    }
    merged[key] = value;
  });
  return merged;
}

const SERVICE_KEYS = [
  ['reels_shorts_tiktok', 'Reels / Shorts / TikTok'],
  ['criativo_trafego_pago', 'Criativo trafego pago'],
  ['corte_podcast', 'Corte podcast'],
  ['video_medio', 'Video medio'],
  ['depoimento', 'Depoimento'],
  ['videoaula_modulo', 'Videoaula / modulo'],
  ['youtube', 'YouTube'],
  ['vsl_15', 'VSL ate 15min'],
  ['vsl_longa', 'VSL longa'],
  ['motion_min', 'Motion minimo'],
  ['motion_max', 'Motion maximo'],
  ['default_du', 'Fallback DU'],
  ['default_dr', 'Fallback DR'],
];

const SERVICE_HOUR_KEYS = [
  ['reels_shorts_tiktok', 'Reels / Shorts / TikTok'],
  ['criativo_trafego_pago', 'Criativo trafego pago'],
  ['corte_podcast', 'Corte podcast'],
  ['video_medio', 'Video medio'],
  ['depoimento', 'Depoimento'],
  ['videoaula_modulo', 'Videoaula / modulo'],
  ['youtube', 'YouTube'],
  ['vsl_15', 'VSL ate 15min'],
  ['vsl_longa', 'VSL longa'],
  ['motion', 'Motion'],
  ['default', 'Fallback geral'],
];

export default function ConfiguracoesPage() {
  const defaults = useMemo(() => ({
    scoreWeights: COMMERCIAL_DEFAULTS.scoreWeights,
    pricing: COMMERCIAL_DEFAULTS.pricing,
    pipelineStatus: COMMERCIAL_DEFAULTS.pipelineStatus,
  }), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const [scoreWeights, setScoreWeights] = useState(defaults.scoreWeights);
  const [pricing, setPricing] = useState(defaults.pricing);
  const [pipelineStatusText, setPipelineStatusText] = useState(defaults.pipelineStatus.join(', '));

  async function load() {
    setLoading(true);
    setError('');
    try {
      const settings = await fetchCommercialSettings();
      setScoreWeights(deepMerge(defaults.scoreWeights, settings?.scoreWeights || {}));
      setPricing(normalizePricingRules(deepMerge(defaults.pricing, settings?.pricing || {})));
      setPipelineStatusText((settings?.pipelineStatus || defaults.pipelineStatus).join(', '));
    } catch (err) {
      console.error('[Configuracoes]', err);
      setError('Nao foi possivel carregar configuracoes. Verifique se a migration do CRM foi aplicada.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function setPricingPath(path, value) {
    setPricing((prev) => {
      const next = { ...prev };
      if (path.length === 1) {
        next[path[0]] = value;
        return next;
      }
      const [first, second, third] = path;
      if (path.length === 2) {
        next[first] = { ...(next[first] || {}), [second]: value };
        return next;
      }
      next[first] = {
        ...(next[first] || {}),
        [second]: { ...((next[first] || {})[second] || {}), [third]: value },
      };
      return next;
    });
  }

  function updateVolumeTier(index, field, value) {
    setPricing((prev) => {
      const tiers = Array.isArray(prev.volumeDiscounts) ? prev.volumeDiscounts.slice() : [];
      const row = { ...(tiers[index] || {}) };
      row[field] = value;
      tiers[index] = row;
      return { ...prev, volumeDiscounts: tiers };
    });
  }

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
        pricing: normalizePricingRules(pricing),
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

  const volumeDiscounts = Array.isArray(pricing.volumeDiscounts) ? pricing.volumeDiscounts : [];

  return (
    <div className="space-y-5 animate-fade-in max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Configuracoes comerciais</h1>
          <p className="page-subtitle">Centro unico para score, pricing e status do pipeline.</p>
        </div>
        <button onClick={load} disabled={loading} className="btn-ghost btn-sm">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Recarregar
        </button>
      </div>

      <Section
        icon={BarChart3}
        title="Pesos de score"
        description="Regras usadas para classificar lead quente/morno/frio e prioridade comercial."
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <NumberField label="Urgencia alta" value={scoreWeights.urgenciaAlta} onChange={(v) => setScoreWeights((p) => ({ ...p, urgenciaAlta: v }))} />
          <NumberField label="Fluxo recorrente" value={scoreWeights.fluxoRecorrente} onChange={(v) => setScoreWeights((p) => ({ ...p, fluxoRecorrente: v }))} />
          <NumberField label="Referencia visual" value={scoreWeights.referenciaVisual} onChange={(v) => setScoreWeights((p) => ({ ...p, referenciaVisual: v }))} />
          <NumberField label="Material gravado" value={scoreWeights.materialGravado} onChange={(v) => setScoreWeights((p) => ({ ...p, materialGravado: v }))} />
          <NumberField label="Servico alto valor" value={scoreWeights.servicoAltoValor} onChange={(v) => setScoreWeights((p) => ({ ...p, servicoAltoValor: v }))} />
          <NumberField label="Sem prazo definido" value={scoreWeights.semPressa} onChange={(v) => setScoreWeights((p) => ({ ...p, semPressa: v }))} step={1} min={-100} max={100} />
        </div>
      </Section>

      <Section
        icon={SlidersHorizontal}
        title="Pricing base"
        description="Base de mercado por servico, modo de piso e presets operacionais por hora."
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <SelectField
              label="Preco base"
              value={String(pricing?.basePriceMode || 'reference')}
              onChange={(value) => setPricingPath(['basePriceMode'], value)}
              options={[
                { value: 'reference', label: 'Referencia de mercado' },
                { value: 'floor', label: 'Piso minimo' },
              ]}
            />
          </div>

          <div>
            <p className="text-xs text-hagav-gray uppercase tracking-wider mb-2">Preco base por servico</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {SERVICE_KEYS.map(([key, label]) => (
                <NumberField
                  key={key}
                  label={label}
                  value={Number(pricing?.serviceBase?.[key] || 0)}
                  onChange={(v) => setPricingPath(['serviceBase', key], v)}
                  step={1}
                  min={0}
                />
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs text-hagav-gray uppercase tracking-wider mb-2">Horas base por servico</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {SERVICE_HOUR_KEYS.map(([key, label]) => (
                <NumberField
                  key={key}
                  label={label}
                  value={Number(pricing?.serviceHours?.[key] || 0)}
                  onChange={(v) => setPricingPath(['serviceHours', key], v)}
                  step={0.25}
                  min={0}
                />
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Section
        icon={Settings2}
        title="Descontos, complexidade e urgencia"
        description="Multiplicadores e faixas usadas pelo motor de calculo interno."
      >
        <div className="space-y-4">
          <div>
            <p className="text-xs text-hagav-gray uppercase tracking-wider mb-2">Desconto por volume</p>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
              {volumeDiscounts.map((tier, index) => (
                <div key={`${tier.min}-${tier.max}-${index}`} className="bg-hagav-surface border border-hagav-border rounded-lg p-2 space-y-2">
                  <NumberField label="Min" value={Number(tier.min || 0)} onChange={(v) => updateVolumeTier(index, 'min', v)} min={0} />
                  <NumberField label="Max" value={Number(tier.max || 0)} onChange={(v) => updateVolumeTier(index, 'max', v)} min={0} />
                  <NumberField label="Desconto %" value={Number(tier.percent || 0)} onChange={(v) => updateVolumeTier(index, 'percent', v)} min={0} max={100} />
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <NumberField label="N1" value={Number(pricing?.complexidade?.N1 || 0)} onChange={(v) => setPricingPath(['complexidade', 'N1'], v)} step={0.01} min={0.1} />
            <NumberField label="N2" value={Number(pricing?.complexidade?.N2 || 0)} onChange={(v) => setPricingPath(['complexidade', 'N2'], v)} step={0.01} min={0.1} />
            <NumberField label="N3" value={Number(pricing?.complexidade?.N3 || 0)} onChange={(v) => setPricingPath(['complexidade', 'N3'], v)} step={0.01} min={0.1} />
            <NumberField label="N1 ate (min)" value={Number(pricing?.complexidade?.n1MaxMin || 0)} onChange={(v) => setPricingPath(['complexidade', 'n1MaxMin'], v)} min={0} />
            <NumberField label="N2 ate (min)" value={Number(pricing?.complexidade?.n2MaxMin || 0)} onChange={(v) => setPricingPath(['complexidade', 'n2MaxMin'], v)} min={0} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <NumberField label="DU Urgente" value={Number(pricing?.urgencia?.DU?.Urgente || 1)} onChange={(v) => setPricingPath(['urgencia', 'DU', 'Urgente'], v)} step={0.01} min={0.5} />
            <NumberField label="DU Em até 7 dias" value={Number(pricing?.urgencia?.DU?.['Em até 7 dias'] || 1)} onChange={(v) => setPricingPath(['urgencia', 'DU', 'Em até 7 dias'], v)} step={0.01} min={0.5} />
            <NumberField label="DR Urgente" value={Number(pricing?.urgencia?.DR?.Urgente || 1)} onChange={(v) => setPricingPath(['urgencia', 'DR', 'Urgente'], v)} step={0.01} min={0.5} />
            <NumberField label="VSL Em até 7 dias" value={Number(pricing?.urgencia?.VSL?.['Em até 7 dias'] || 1)} onChange={(v) => setPricingPath(['urgencia', 'VSL', 'Em até 7 dias'], v)} step={0.01} min={0.5} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <NumberField label="Sem referencia %" value={Number(pricing?.ajustes?.semReferencia || 0)} onChange={(v) => setPricingPath(['ajustes', 'semReferencia'], v)} min={0} max={100} />
            <NumberField label="Multicamera %" value={Number(pricing?.ajustes?.multicamera || 0)} onChange={(v) => setPricingPath(['ajustes', 'multicamera'], v)} min={0} max={100} />
            <NumberField label="Sugere pacote acima de" value={Number(pricing?.pacotes?.sugerirAcimaQtd || 0)} onChange={(v) => setPricingPath(['pacotes', 'sugerirAcimaQtd'], v)} min={0} />
            <NumberField label="Revisao capacidade acima de" value={Number(pricing?.pacotes?.revisaoCapacidadeAcimaQtd || 0)} onChange={(v) => setPricingPath(['pacotes', 'revisaoCapacidadeAcimaQtd'], v)} min={0} />
          </div>
        </div>
      </Section>

      <Section
        icon={ShieldCheck}
        title="Margem e pipeline"
        description="Controles de risco comercial e status validos no funil."
      >
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
          <NumberField label="C/HORA" value={Number(pricing?.margem?.choHora || 0)} onChange={(v) => setPricingPath(['margem', 'choHora'], v)} step={0.01} min={0} />
          <NumberField label="Margem minima segura" value={Number(pricing?.margem?.minimaSegura || 0)} onChange={(v) => setPricingPath(['margem', 'minimaSegura'], v)} min={0} max={100} />
          <NumberField label="Margem saudavel min" value={Number(pricing?.margem?.saudavelMin || 0)} onChange={(v) => setPricingPath(['margem', 'saudavelMin'], v)} min={0} max={100} />
          <NumberField label="Margem saudavel max" value={Number(pricing?.margem?.saudavelMax || 0)} onChange={(v) => setPricingPath(['margem', 'saudavelMax'], v)} min={0} max={100} />
          <NumberField label="Margem excelente" value={Number(pricing?.margem?.excelente || 0)} onChange={(v) => setPricingPath(['margem', 'excelente'], v)} min={0} max={100} />
          <NumberField label="Recusar abaixo de" value={Number(pricing?.margem?.recusaAbaixo || 0)} onChange={(v) => setPricingPath(['margem', 'recusaAbaixo'], v)} min={0} max={100} />
          <NumberField label="Repasse editor min" value={Number(pricing?.margem?.repasseEditorMin || 0)} onChange={(v) => setPricingPath(['margem', 'repasseEditorMin'], v)} min={0} max={100} />
          <NumberField label="Repasse editor max" value={Number(pricing?.margem?.repasseEditorMax || 0)} onChange={(v) => setPricingPath(['margem', 'repasseEditorMax'], v)} min={0} max={100} />
        </div>

        <label className="space-y-1 block">
          <span className="text-xs text-hagav-gray uppercase tracking-wider">Status do pipeline (separados por virgula)</span>
          <input
            type="text"
            value={pipelineStatusText}
            onChange={(event) => setPipelineStatusText(event.target.value)}
            className="hinput w-full"
          />
        </label>
      </Section>

      {error ? (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
      ) : null}

      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving || loading} className="btn-gold">
          {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
          {saved ? 'Salvo!' : 'Salvar configuracoes'}
        </button>
      </div>
    </div>
  );
}
