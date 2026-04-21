'use client';

import { useState } from 'react';
import { X, Save, Loader2, UserPlus } from 'lucide-react';
import { createLead } from '@/lib/supabase';

const ORIGEM_OPTIONS = [
  { value: 'prospeccao_ativa', label: 'Prospecção ativa' },
  { value: 'indicacao', label: 'Indicação' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'site', label: 'Site' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'evento', label: 'Evento' },
  { value: 'outro', label: 'Outro' },
];

const STATUS_OPTIONS = [
  { value: 'novo', label: 'Novo' },
  { value: 'contatado', label: 'Contatado' },
  { value: 'qualificado', label: 'Qualificado' },
];

function Field({ label, required, children }) {
  return (
    <div>
      <label className="text-xs text-hagav-gray uppercase tracking-wider block mb-1.5">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function InfoCard({ label, value }) {
  return (
    <div className="bg-hagav-surface border border-hagav-border rounded-lg p-3">
      <p className="text-[10px] text-hagav-gray uppercase tracking-wider mb-1">{label}</p>
      <p className="text-sm text-hagav-light font-medium">{value || '—'}</p>
    </div>
  );
}

function normalizeWhatsapp(raw) {
  return String(raw || '').replace(/\D/g, '');
}

export default function NewLeadDrawer({ onClose, onCreated }) {
  const [nome, setNome] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [origem, setOrigem] = useState('prospeccao_ativa');
  const [servico, setServico] = useState('');
  const [valorEstimado, setValorEstimado] = useState('');
  const [status, setStatus] = useState('novo');
  const [prioridade, setPrioridade] = useState('media');
  const [urgencia, setUrgencia] = useState('media');
  const [proximaAcao, setProximaAcao] = useState('');
  const [proximoFollowup, setProximoFollowup] = useState('');
  const [responsavel, setResponsavel] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function fromDateTimeLocal(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
  }

  async function handleCreate() {
    setError('');
    const nomeTrimmed = nome.trim();
    const waTrimmed = normalizeWhatsapp(whatsapp);

    if (!nomeTrimmed || !waTrimmed) {
      setError('Preencha nome e WhatsApp');
      return;
    }
    if (waTrimmed.length < 8) {
      setError('Preencha nome e WhatsApp');
      return;
    }

    setSaving(true);
    try {
      const created = await createLead({
        nome: nomeTrimmed,
        whatsapp: waTrimmed,
        empresa,
        origem,
        servico,
        valor_estimado: valorEstimado ? Number(String(valorEstimado).replace(',', '.')) : 0,
        status,
        prioridade,
        urgencia,
        proxima_acao: proximaAcao,
        proximo_followup_em: fromDateTimeLocal(proximoFollowup),
        responsavel,
        observacoes,
      });
      onCreated?.(created);
      onClose();
    } catch (err) {
      setError(err?.message ? `Erro ao criar lead: ${err.message}` : 'Erro ao criar lead');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />

      <aside className="drawer-panel flex flex-col">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-hagav-border shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <UserPlus size={15} className="text-hagav-gold" />
              <p className="text-xs text-hagav-gold uppercase tracking-wider font-medium">Novo lead</p>
            </div>
            <h2 className="text-lg font-bold text-hagav-white">Novo lead</h2>
            <p className="text-xs text-hagav-gray mt-0.5">Cadastro manual no CRM com os dados principais.</p>
          </div>
          <button
            onClick={onClose}
            className="text-hagav-gray hover:text-hagav-white p-2 rounded-lg hover:bg-hagav-muted/30 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Corpo */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div className="grid grid-cols-2 gap-2">
            <InfoCard label="Status inicial" value={status} />
            <InfoCard label="Origem" value={origem} />
            <InfoCard label="Prioridade" value={prioridade} />
            <InfoCard label="Urgencia" value={urgencia} />
          </div>

          {/* Bloco: Dados principais */}
          <div className="space-y-3">
            <p className="text-[10px] text-hagav-gray uppercase tracking-wider">Dados do contato</p>

            <Field label="Nome" required>
              <input
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome completo ou apelido"
                className="hinput w-full"
                autoFocus
              />
            </Field>

            <Field label="WhatsApp" required>
              <input
                type="tel"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="(11) 99999-9999"
                className="hinput w-full"
              />
            </Field>

            <Field label="Empresa">
              <input
                type="text"
                value={empresa}
                onChange={(e) => setEmpresa(e.target.value)}
                placeholder="Nome da empresa (opcional)"
                className="hinput w-full"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Origem">
                <select value={origem} onChange={(e) => setOrigem(e.target.value)} className="hselect w-full">
                  {ORIGEM_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </Field>

              <Field label="Servico de interesse">
                <input
                  type="text"
                  value={servico}
                  onChange={(e) => setServico(e.target.value)}
                  placeholder="Ex.: Reels, VSL..."
                  className="hinput w-full"
                />
              </Field>
            </div>

            <Field label="Valor estimado inicial (R$)">
              <input
                type="text"
                inputMode="decimal"
                value={valorEstimado}
                onChange={(e) => setValorEstimado(e.target.value)}
                placeholder="Ex.: 1500"
                className="hinput w-full"
              />
            </Field>
          </div>

          <div className="gold-line" />

          {/* Bloco: Operacional */}
          <div className="space-y-3">
            <p className="text-[10px] text-hagav-gray uppercase tracking-wider">Classificacao operacional</p>

            <div className="grid grid-cols-3 gap-2">
              <Field label="Status">
                <select value={status} onChange={(e) => setStatus(e.target.value)} className="hselect w-full">
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </Field>

              <Field label="Prioridade">
                <select value={prioridade} onChange={(e) => setPrioridade(e.target.value)} className="hselect w-full">
                  <option value="alta">Alta</option>
                  <option value="media">Media</option>
                  <option value="baixa">Baixa</option>
                </select>
              </Field>

              <Field label="Urgencia">
                <select value={urgencia} onChange={(e) => setUrgencia(e.target.value)} className="hselect w-full">
                  <option value="alta">Alta</option>
                  <option value="media">Media</option>
                  <option value="baixa">Baixa</option>
                </select>
              </Field>
            </div>

            <Field label="Proxima acao">
              <input
                type="text"
                value={proximaAcao}
                onChange={(e) => setProximaAcao(e.target.value)}
                placeholder="Ex.: Ligar amanha de manha"
                className="hinput w-full"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Proximo follow-up">
                <input
                  type="datetime-local"
                  value={proximoFollowup}
                  onChange={(e) => setProximoFollowup(e.target.value)}
                  className="hinput w-full"
                />
              </Field>

              <Field label="Responsavel">
                <input
                  type="text"
                  value={responsavel}
                  onChange={(e) => setResponsavel(e.target.value)}
                  placeholder="Nome do responsavel"
                  className="hinput w-full"
                />
              </Field>
            </div>
          </div>

          <div className="gold-line" />

          {/* Bloco: Observacoes */}
          <div className="space-y-3">
            <p className="text-[10px] text-hagav-gray uppercase tracking-wider">Anotacoes</p>

            <Field label="Observacoes internas">
              <textarea
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                rows={4}
                placeholder="Contexto, historico ou observacoes sobre este lead..."
                className="hinput w-full resize-none"
              />
            </Field>
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        {/* Rodapé */}
        <div className="px-6 py-4 border-t border-hagav-border shrink-0 flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="btn-ghost"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={saving}
            className="btn-gold flex-1 justify-center"
          >
            {saving
              ? <Loader2 size={15} className="animate-spin" />
              : <Save size={15} />}
            Criar lead
          </button>
        </div>
      </aside>
    </>
  );
}
