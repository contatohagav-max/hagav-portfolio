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

export default function ContractPreview({ preview }) {
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
            <h3 className="text-[24px] font-black tracking-[-0.02em]">{preview.title}</h3>
            <p className="mt-2 max-w-md text-sm leading-6 text-[#dbd7cb]">{preview.subtitle}</p>
          </div>
          <div className="rounded-full border border-[#f4dd9c]/50 bg-[#f4dd9c]/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#f4dd9c]">
            Preview ao vivo
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-[#f4dd9c]/55 bg-[#f4dd9c]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#f4dd9c]">
            Contrato {preview.contractNumber || '-'}
          </span>
          <span className="rounded-full border border-[#f4dd9c]/55 bg-[#f4dd9c]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#f4dd9c]">
            Emitido em {preview.emissionDate || '-'}
          </span>
          <span className="rounded-full border border-[#f4dd9c]/55 bg-[#f4dd9c]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#f4dd9c]">
            Status {preview.status || '-'}
          </span>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <PreviewSection title="Dados Das Partes">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-[#e7dfcf] bg-white p-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#8a826f]">Contratante</p>
              <div className="space-y-2">
                <PreviewField label="Nome" value={preview.client?.name} />
                <PreviewField label="WhatsApp" value={preview.client?.whatsapp} />
                <PreviewField label="CPF/CNPJ" value={preview.client?.document} />
                <PreviewField label="E-mail" value={preview.client?.email} />
              </div>
            </div>
            <div className="rounded-2xl border border-[#e7dfcf] bg-white p-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#8a826f]">Contratada</p>
              <div className="space-y-2">
                <PreviewField label="Empresa" value="HAGAV - Studio de Edicao" />
                <PreviewField label="CNPJ" value="34.271.613/0001-85" />
                <PreviewField label="E-mail" value="contato.hagav@gmail.com" />
                <PreviewField label="Responsavel" value={preview.responsible} />
              </div>
            </div>
          </div>
        </PreviewSection>

        <PreviewSection title="Objeto Do Contrato">
          <div className="rounded-2xl border border-[#e1d6ba] bg-[#fff9ea] px-4 py-3">
            <p className="text-sm leading-6 text-[#242424]">
              Prestação de serviços de edição de vídeos conforme especificações previamente acordadas entre as partes.
            </p>
          </div>
          <div className="mt-3 rounded-2xl border border-[#dbcda8] bg-[#fffbef] px-4 py-3">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#7a6a3c]">Serviços contratados</p>
            <p className="text-sm leading-6 text-[#242424]">{preview.serviceSummary || 'Resumo do serviço não informado.'}</p>
          </div>
        </PreviewSection>

        <PreviewSection title="Condições Financeiras">
          <div
            className="overflow-hidden rounded-[22px] border border-[#312814] text-white"
            style={{
              background: 'linear-gradient(135deg, #0f0f11 0%, #1a1a1d 58%, #2b2416 100%)',
            }}
          >
            <div className="grid gap-0 md:grid-cols-[minmax(0,1.35fr)_minmax(240px,0.65fr)]">
              <div className="px-4 py-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#f4dd9c]">Valor do contrato</p>
                <p className="mt-2 text-[34px] font-black leading-none tracking-[-0.04em] text-white">
                  {preview.value || '-'}
                </p>
                <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#dbc88f]">
                  Investimento comercial validado
                </p>
              </div>
              <div className="border-t border-[#c8a23a]/20 bg-[#f4dd9c]/10 px-4 py-4 md:border-l md:border-t-0">
                <div className="space-y-3">
                  <PreviewField label="Forma de pagamento" value={preview.paymentMethod} soft />
                  <PreviewField label="Chave PIX" value={preview.pix} soft />
                </div>
              </div>
            </div>
          </div>
          <p className="mt-3 text-sm leading-6 text-[#595959]">
            O não pagamento resultará na suspensão dos serviços até a regularização. A continuidade dos serviços está condicionada à regularidade dos pagamentos.
          </p>
        </PreviewSection>

        <PreviewSection title="Vigência E Status">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
            <PreviewField label="Início" value={preview.startDate} soft />
            <PreviewField label="Vencimento" value={preview.endDate} soft />
            <PreviewField label="Duração" value={preview.durationLabel} soft />
            <PreviewField label="Formato" value={preview.projectType} soft />
          </div>
        </PreviewSection>

        <PreviewSection title="Cláusulas Principais">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {(preview.terms || []).map((term) => (
              <article key={term.title} className="rounded-2xl border border-[#ddd5c4] bg-[#fffdf8] px-4 py-3">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#75663d]">{term.title}</p>
                <ul className="space-y-1.5 pl-4 text-sm leading-6 text-[#272727]">
                  {(term.items || []).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </PreviewSection>

        <PreviewSection title="Observações" hidden={!preview.observation}>
          <p className="text-sm leading-6 text-[#272727]">{preview.observation}</p>
        </PreviewSection>

        <PreviewSection title="Assinatura E Validação">
          <p className="text-sm leading-6 text-[#272727]">
            Após validação, o documento segue pronto para confirmação e assinatura com o cliente.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-[#d6c18a] bg-[#fff8e6] px-4 py-3">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#8a6f2b]">Contratante</p>
              <p className="text-sm font-semibold text-[#1b1508]">{preview.client?.name || '-'}</p>
            </div>
            <div className="rounded-2xl border border-[#d6c18a] bg-[#fff8e6] px-4 py-3">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#8a6f2b]">Contratada</p>
              <p className="text-sm font-semibold text-[#1b1508]">HAGAV - Studio de Edicao</p>
            </div>
          </div>
        </PreviewSection>
      </div>
    </div>
  );
}
