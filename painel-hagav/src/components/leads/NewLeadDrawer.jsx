'use client';

import { useEffect, useState } from 'react';
import { X, Save, Loader2, UserPlus } from 'lucide-react';
import useAdaptivePanelWidth from '@/components/ui/useAdaptivePanelWidth';
import { PRAZO_OPTIONS, normalizePrazoLabel } from '@/lib/commercial';
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

const FLUXO_OPTIONS = [
  { value: 'DU', label: 'Projeto pontual (DU)' },
  { value: 'DR', label: 'Producao mensal (DR)' },
];

const MATERIAL_OPTIONS = [
  { value: 'Sim', label: 'Sim' },
  { value: 'Nao', label: 'Nao' },
  { value: 'Parcial', label: 'Parcial' },
];

const TEMPERATURA_OPTIONS = [
  { value: '', label: 'Automatico' },
  { value: 'Quente', label: 'Quente' },
  { value: 'Morno', label: 'Morno' },
  { value: 'Frio', label: 'Frio' },
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
  const adaptivePanel = useAdaptivePanelWidth({
    storageKey: 'hagav-drawer-lead-new',
    widths: { base: 780, large: 920, ultrawide: 1060 },
    minWidth: 720,
    maxWidth: 1120,
  });
  const [nome, setNome] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [origem, setOrigem] = useState('prospeccao_ativa');
  const [fluxo, setFluxo] = useState('DU');
  const [servico, setServico] = useState('');
  const [quantidade, setQuantidade] = useState('1');
  const [materialGravado, setMaterialGravado] = useState('Sim');
  const [tempoBruto, setTempoBruto] = useState('');
  const [prazo, setPrazo] = useState('Em até 7 dias');
  const [referencia, setReferencia] = useState('');
  const [contextoResumo, setContextoResumo] = useState('');
  const [valorEstimado, setValorEstimado] = useState('');
  const [status, setStatus] = useState('novo');
  const [prioridade, setPrioridade] = useState('media');
  const [urgencia, setUrgencia] = useState('media');
  const [temperatura, setTemperatura] = useState('');
  const [proximaAcao, setProximaAcao] = useState('');
  const [proximoFollowup, setProximoFollowup] = useState('');
  const [responsavel, setResponsavel] = useState('');
  const [observacoesInternas, setObservacoesInternas] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const prazoOptions = PRAZO_OPTIONS;

  useEffect(() => {
    const fallbackPrazo = fluxo === 'DR' ? 'Este mês' : 'Em até 7 dias';
    const normalizedPrazo = normalizePrazoLabel(prazo, fallbackPrazo);
    if (!prazoOptions.includes(normalizedPrazo)) {
      setPrazo(fallbackPrazo);
      return;
    }
    if (normalizedPrazo !== prazo) {
      setPrazo(normalizedPrazo);
    }
  }, [fluxo, prazo, prazoOptions]);

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
        fluxo,
        servico,
        quantidade,
        material_gravado_text: materialGravado,
        tempo_bruto: tempoBruto,
        prazo,
        referencia_text: referencia,
        contexto_resumo: contextoResumo,
        valor_estimado: valorEstimado ? Number(String(valorEstimado).replace(',', '.')) : 0,
        status,
        prioridade,
        urgencia,
        temperatura,
        proxima_acao: proximaAcao,
        proximo_followup_em: fromDateTimeLocal(proximoFollowup),
        responsavel,
        observacoes_internas: observacoesInternas,
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

      <aside className="drawer-panel flex flex-col" style={adaptivePanel.panelStyle}>
        {adaptivePanel.showResizeHandle ? (
          <div className="panel-resize-handle" aria-hidden="true" {...adaptivePanel.resizeHandleProps} />
        ) : null}
        {/* Cabeçalho */}
        <div className="drawer-head">
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
        <div className="drawer-body">
          <div className="grid grid-cols-2 gap-2">
            <InfoCard label="Status inicial" value={status} />
            <InfoCard label="Origem" value={origem} />
            <InfoCard label="Fluxo" value={fluxo} />
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
                  placeholder="Ex.: Reels / Shorts / TikTok"
                  className="hinput w-full"
                />
              </Field>
            </div>
            <p className="text-[11px] text-hagav-gray/80 -mt-1">
              Use `|` para separar mais de um servico (ex.: `YouTube | VSL ate 15 min`).
            </p>

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

          {/* Bloco: Detalhes comerciais */}
          <div className="space-y-3">
            <p className="text-[10px] text-hagav-gray uppercase tracking-wider">Detalhes comerciais</p>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Fluxo">
                <select value={fluxo} onChange={(e) => setFluxo(e.target.value)} className="hselect w-full">
                  {FLUXO_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </Field>

              <Field label="Quantidade">
                <input
                  type="text"
                  inputMode="numeric"
                  value={quantidade}
                  onChange={(e) => setQuantidade(e.target.value)}
                  placeholder="Ex.: 2"
                  className="hinput w-full"
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Material gravado">
                <select value={materialGravado} onChange={(e) => setMaterialGravado(e.target.value)} className="hselect w-full">
                  {MATERIAL_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </Field>

              <Field label="Tempo bruto">
                <input
                  type="text"
                  value={tempoBruto}
                  onChange={(e) => setTempoBruto(e.target.value)}
                  placeholder="Ex.: 1h, 30min"
                  className="hinput w-full"
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Prazo">
                <select value={prazo} onChange={(e) => setPrazo(e.target.value)} className="hselect w-full">
                  {prazoOptions.map((value) => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>
              </Field>

              <Field label="Temperatura">
                <select value={temperatura} onChange={(e) => setTemperatura(e.target.value)} className="hselect w-full">
                  {TEMPERATURA_OPTIONS.map((opt) => (
                    <option key={opt.label} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Referencia">
              <textarea
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
                rows={2}
                placeholder="Link de referencia visual ou descricao"
                className="hinput w-full resize-none"
              />
            </Field>

            <Field label="Contexto / resumo">
              <textarea
                value={contextoResumo}
                onChange={(e) => setContextoResumo(e.target.value)}
                rows={3}
                placeholder="Resumo comercial do contexto do cliente"
                className="hinput w-full resize-none"
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
                value={observacoesInternas}
                onChange={(e) => setObservacoesInternas(e.target.value)}
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
        <div className="drawer-foot">
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
