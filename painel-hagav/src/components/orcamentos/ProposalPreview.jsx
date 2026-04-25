'use client';

function PreviewField({ label, value, soft = false }) {
  if (!value) return null;
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${soft ? 'border-[#e4dcc7] bg-[#f3ede0]' : 'border-[#e7dfcf] bg-white'}`}>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#8a826f]">{label}</p>
      <p className="text-sm font-semibold leading-5 text-[#181818] break-words">{value}</p>
    </div>
  );
}

function PreviewSection({ title, children, hidden = false }) {
  if (hidden) return null;
  return (
    <section className="rounded-2xl border border-[#ddd4c0] bg-white p-4 shadow-[0_12px_28px_rgba(13,13,15,0.08)]">
      <div className="mb-3 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-[#c8a23a]" />
        <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#7a6a3c]">{title}</p>
      </div>
      {children}
    </section>
  );
}

export default function ProposalPreview({ preview }) {
  if (!preview) return null;

  return (
    <div className="overflow-hidden rounded-[28px] border border-[#3e3520] bg-[#f7f3ea] shadow-[0_24px_60px_rgba(0,0,0,0.28)]">
      <div
        className="border-b border-[#c8a23a] px-5 py-5 text-white"
        style={{
          background: 'linear-gradient(140deg, #09090a 0%, #111113 56%, #2b2416 100%)',
        }}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.32em] text-[#f4dd9c]">
              HAGAV Studio de Edicao
            </p>
            <h3 className="text-[26px] font-black tracking-[-0.02em]">{preview.title}</h3>
            <p className="mt-2 max-w-md text-sm leading-6 text-[#dbd7cb]">{preview.subtitle}</p>
          </div>
          <div className="rounded-full border border-[#f4dd9c]/50 bg-[#f4dd9c]/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#f4dd9c]">
            Preview ao vivo
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-[#f4dd9c]/55 bg-[#f4dd9c]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#f4dd9c]">
            Proposta {preview.proposalNumber || '-'}
          </span>
          <span className="rounded-full border border-[#f4dd9c]/55 bg-[#f4dd9c]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#f4dd9c]">
            Emitida em {preview.emissionDate || '-'}
          </span>
          <span className="rounded-full border border-[#f4dd9c]/55 bg-[#f4dd9c]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#f4dd9c]">
            Modelo {preview.mode}
          </span>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <PreviewSection title="Cliente">
          <div className="grid grid-cols-1 gap-2">
            <PreviewField label="Nome" value={preview.client?.name} />
            <PreviewField label="WhatsApp" value={preview.client?.whatsapp} />
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <PreviewField label="Empresa" value={preview.client?.company} />
              <PreviewField label="Instagram" value={preview.client?.instagram} />
              <PreviewField label="E-mail" value={preview.client?.email} />
            </div>
          </div>
        </PreviewSection>

        <PreviewSection title="Resumo da Demanda">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <PreviewField label="Servico" value={preview.summary?.service} soft />
            <PreviewField label="Quantidade" value={preview.summary?.quantity} soft />
            <PreviewField label="Prazo" value={preview.summary?.deadline} soft />
          </div>
        </PreviewSection>

        <PreviewSection title="Escopo">
          <div className="rounded-2xl border border-[#e1d6ba] bg-[#fff9ea] px-4 py-3">
            <p className="text-sm leading-6 text-[#242424]">{preview.scope || 'Escopo nao informado.'}</p>
          </div>
        </PreviewSection>

        <PreviewSection title="Opcoes de Investimento" hidden={!preview.options?.visible}>
          <div className="space-y-2.5">
            {(preview.options?.items || []).map((option) => (
              <article
                key={`${option.title}-${option.quantity}-${option.total}`}
                className="relative rounded-2xl border border-[#dbcda8] bg-[#fffbef] px-4 py-3"
              >
                {option.discount ? (
                  <span className="absolute right-3 top-3 inline-flex h-9 min-w-9 items-center justify-center rounded-full border border-[#d0b06a] bg-[#f5dfaa] px-2 text-[11px] font-black text-[#5d4815]">
                    {option.discount}
                  </span>
                ) : null}
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#75663d]">{option.title || 'Opcao'}</p>
                <p className="mt-2 text-[26px] font-black leading-none tracking-[-0.02em] text-[#161616]">{option.total || '-'}</p>
                <div className="mt-3 space-y-1">
                  <p className="text-sm font-medium text-[#464646]">{option.quantity || '-'}</p>
                  <p className="text-sm font-medium text-[#464646]">{option.unitPrice || '-'}</p>
                  {option.description ? (
                    <p className="text-[13px] leading-5 text-[#5e5646]">{option.description}</p>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
          {preview.options?.footnote ? (
            <p className="mt-3 text-sm leading-6 text-[#595959]">{preview.options.footnote}</p>
          ) : null}
        </PreviewSection>

        <PreviewSection title={preview.investment?.label || 'Valor'} hidden={!preview.investment?.visible}>
          <div
            className="overflow-hidden rounded-[22px] border border-[#312814] text-white"
            style={{
              background: 'linear-gradient(135deg, #0f0f11 0%, #1a1a1d 58%, #2b2416 100%)',
            }}
          >
            <div className="px-4 py-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#f4dd9c]">
                {preview.investment?.label || 'Valor total'}
              </p>
              <p className="mt-2 text-[34px] font-black leading-none tracking-[-0.04em] text-white">
                {preview.investment?.value || '-'}
              </p>
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#dbc88f]">
                Investimento comercial da proposta
              </p>
            </div>
          </div>
        </PreviewSection>

        <PreviewSection title="Estrutura Mensal" hidden={!preview.monthly?.visible}>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <PreviewField label="Quantidade mensal" value={preview.monthly?.quantity} soft />
            <PreviewField
              label="Duracao do contrato"
              value={preview.monthly?.duration ? `${preview.monthly.duration} meses` : ''}
              soft
            />
            <PreviewField label="Valor mensal" value={preview.monthly?.value} soft />
          </div>
          {preview.monthly?.scope ? (
            <div className="mt-3 rounded-2xl border border-[#e1d6ba] bg-[#fff9ea] px-4 py-3">
              <p className="text-sm leading-6 text-[#242424]">{preview.monthly.scope}</p>
            </div>
          ) : null}
        </PreviewSection>

        <PreviewSection title="Condições Comerciais" hidden={!Array.isArray(preview.conditions) || preview.conditions.length === 0}>
          <div className="space-y-2">
            {(preview.conditions || []).map((condition) => (
              <p key={condition} className="text-sm leading-6 text-[#272727]">
                {condition}
              </p>
            ))}
          </div>
        </PreviewSection>

        <PreviewSection title="Referencia" hidden={!preview.reference}>
          <p className="text-sm leading-6 text-[#272727] break-words">{preview.reference}</p>
        </PreviewSection>

        <PreviewSection title="Observacao Adicional" hidden={!preview.observation}>
          <p className="text-sm leading-6 text-[#272727]">{preview.observation}</p>
        </PreviewSection>

        <PreviewSection title="Proximos Passos">
          <div className="space-y-1.5">
            {(preview.nextSteps || []).map((step) => (
              <p key={step} className="text-sm leading-6 text-[#272727]">
                {step}
              </p>
            ))}
          </div>
          <div
            className="mt-4 rounded-xl border border-[#c4a55e] px-4 py-3 text-center text-sm font-black uppercase tracking-[0.08em] text-[#1b1508]"
            style={{
              background: 'linear-gradient(90deg, #f0d684 0%, #c8a23a 100%)',
            }}
          >
            {preview.cta}
          </div>
        </PreviewSection>
      </div>
    </div>
  );
}
