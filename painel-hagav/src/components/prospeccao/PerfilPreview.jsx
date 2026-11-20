'use client';

import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Globe, Instagram, Linkedin, MapPin, RefreshCw } from 'lucide-react';
import { classNames } from '@/lib/utils';

function urlCompleta(valor) {
  const t = String(valor || '').trim();
  if (!t) return '';
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

function linkedinDo(prospect) {
  const sinais = prospect?.sinais && typeof prospect.sinais === 'object' ? prospect.sinais : {};
  const candidatos = [sinais.linkedin, prospect?.site, prospect?.fonte_url];
  return candidatos.map(urlCompleta).find((u) => /linkedin\.com\//i.test(u)) || '';
}

// Busca titulo/descricao/imagem pelo servidor (o navegador nao pode ler outros sites direto).
function usePrevia(url, ativo) {
  const [estado, setEstado] = useState({ carregando: false, dados: null, erro: '' });
  useEffect(() => {
    if (!ativo || !url) return undefined;
    let vivo = true;
    setEstado({ carregando: true, dados: null, erro: '' });
    fetch(`/api/prospeccao-preview?url=${encodeURIComponent(url)}`, { credentials: 'include' })
      .then((r) => r.json().catch(() => ({})))
      .then((dados) => {
        if (!vivo) return;
        if (dados?.ok) setEstado({ carregando: false, dados, erro: '' });
        else setEstado({ carregando: false, dados: null, erro: 'Não consegui carregar a prévia deste site.' });
      })
      .catch(() => vivo && setEstado({ carregando: false, dados: null, erro: 'Não consegui carregar a prévia deste site.' }));
    return () => { vivo = false; };
  }, [url, ativo]);
  return estado;
}

function CartaoSite({ url, rotuloBotao = 'Abrir site', permitirEmbutir = true }) {
  const { carregando, dados, erro } = usePrevia(url, true);
  const [embutido, setEmbutido] = useState(false);
  if (carregando) {
    return <p className="flex items-center gap-2 text-xs text-hagav-gray"><RefreshCw size={13} className="animate-spin" /> Carregando prévia...</p>;
  }
  return (
    <div className="space-y-3">
      {dados ? (
        <div className="flex flex-col sm:flex-row gap-3 rounded-xl border border-hagav-border bg-hagav-card p-3">
          {dados.imagem && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={dados.imagem} alt="" className="w-full sm:w-40 h-28 object-cover rounded-lg border border-hagav-border" referrerPolicy="no-referrer" />
          )}
          <div className="min-w-0">
            <p className="text-[11px] text-hagav-gray">{dados.site || dados.dominio}</p>
            <p className="text-sm font-medium text-hagav-white">{dados.titulo || dados.dominio}</p>
            {dados.descricao && <p className="mt-1 text-xs text-hagav-light leading-relaxed line-clamp-4">{dados.descricao}</p>}
          </div>
        </div>
      ) : (
        <p className="text-xs text-hagav-gray">{erro || 'Sem prévia.'}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <a href={url} target="_blank" rel="noreferrer" className="btn-ghost btn-sm"><ExternalLink size={13} /> {rotuloBotao}</a>
        {permitirEmbutir && dados?.embutivel && (
          <button type="button" className="btn-ghost btn-sm" onClick={() => setEmbutido((v) => !v)}>
            <Globe size={13} /> {embutido ? 'Fechar o site' : 'Ver o site aqui'}
          </button>
        )}
        {dados && !dados.embutivel && <span className="self-center text-[11px] text-hagav-gray">Este site não deixa ser aberto dentro do painel.</span>}
      </div>
      {embutido && (
        <iframe
          src={url}
          title="Site do prospect"
          className="w-full h-[560px] rounded-xl border border-hagav-border bg-white"
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer"
          loading="lazy"
        />
      )}
    </div>
  );
}

export default function PerfilPreview({ prospect }) {
  const fontes = useMemo(() => {
    const lista = [];
    if (prospect?.instagram) lista.push({ key: 'instagram', label: 'Instagram', icone: Instagram });
    const site = urlCompleta(prospect?.site);
    if (site && !/linkedin\.com\//i.test(site)) lista.push({ key: 'site', label: 'Site', icone: Globe, url: site });
    const linkedin = linkedinDo(prospect);
    if (linkedin) lista.push({ key: 'linkedin', label: 'LinkedIn', icone: Linkedin, url: linkedin });
    const fonte = urlCompleta(prospect?.fonte_url);
    if (fonte && fonte !== site && fonte !== linkedin) lista.push({ key: 'fonte', label: 'Onde achei', icone: MapPin, url: fonte });
    return lista;
  }, [prospect]);
  const [aba, setAba] = useState(fontes[0]?.key || null);

  if (!fontes.length) return <p className="text-xs text-hagav-gray">Sem Instagram, site ou LinkedIn cadastrado.</p>;
  const atual = fontes.find((f) => f.key === aba) || fontes[0];
  const usuario = String(prospect?.instagram || '').replace(/^@/, '');

  return (
    <div className="space-y-3">
      <div className="inline-flex flex-wrap rounded-xl border border-hagav-border bg-hagav-surface p-0.5" role="tablist" aria-label="Perfil do prospect">
        {fontes.map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={atual.key === f.key}
            onClick={() => setAba(f.key)}
            className={classNames('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-xs', atual.key === f.key ? 'bg-hagav-gold/15 text-hagav-gold' : 'text-hagav-light hover:text-hagav-white')}
          >
            <f.icone size={13} /> {f.label}
          </button>
        ))}
      </div>

      {atual.key === 'instagram' && (
        <div className="space-y-2">
          <iframe
            key={usuario}
            src={`https://www.instagram.com/${encodeURIComponent(usuario)}/embed/`}
            title={`Instagram de @${usuario}`}
            className="w-full max-w-[540px] h-[560px] rounded-xl border border-hagav-border bg-white"
            sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
            loading="lazy"
          />
          <p className="text-[11px] text-hagav-gray">
            Se o perfil não aparecer acima, o Instagram bloqueou a prévia:{' '}
            <a href={`https://instagram.com/${usuario}`} target="_blank" rel="noreferrer" className="text-hagav-gold">abrir @{usuario} no Instagram</a>.
          </p>
        </div>
      )}
      {atual.key === 'site' && <CartaoSite key={atual.url} url={atual.url} />}
      {atual.key === 'linkedin' && (
        <div className="rounded-xl border border-hagav-border bg-hagav-card p-3 space-y-2">
          <p className="text-xs text-hagav-light">O LinkedIn não deixa mostrar perfis dentro de outros sites. Abra em uma nova aba:</p>
          <a href={atual.url} target="_blank" rel="noreferrer" className="btn-ghost btn-sm w-fit"><Linkedin size={13} /> Abrir LinkedIn</a>
        </div>
      )}
      {atual.key === 'fonte' && <CartaoSite key={atual.url} url={atual.url} rotuloBotao="Abrir onde achei" />}
    </div>
  );
}
