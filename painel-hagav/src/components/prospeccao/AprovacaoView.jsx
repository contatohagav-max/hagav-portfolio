'use client';

import { useMemo, useState } from 'react';
import { Check, Copy, ExternalLink, Eye, Instagram, Mail, Send, ThumbsDown, ThumbsUp } from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';
import { ChanceBadge, FatoresChance, QuadranteTag } from '@/components/prospeccao/ChanceBadge';
import PerfilPreview from '@/components/prospeccao/PerfilPreview';
import { calcularChance } from '@/lib/prospeccao-chance';
import {
  MOMENTO_LABELS,
  MOTIVOS_REPROVACAO,
  approveDrafts,
  markDraftSentManually,
  reagendarRascunhos,
  rejectProspect,
} from '@/lib/prospeccao-repository';
import { classNames } from '@/lib/utils';

// Altura da caixa de texto acompanha o tamanho da mensagem (sem barra de rolagem interna).
function linhas(texto, min = 5) {
  const t = String(texto || '');
  return Math.min(18, Math.max(min, t.split('\n').reduce((acc, l) => acc + Math.max(1, Math.ceil(l.length / 95)), 0) + 1));
}

function rotuloEtapa(mensagem, agenda) {
  const etapa = Number(mensagem.etapa || 1);
  if (etapa === 1) return '1ª mensagem';
  const primeira = agenda[0] ? new Date(agenda[0].agendado_para).getTime() : null;
  const desta = agenda.find((a) => a.id === mensagem.id);
  const dias = primeira && desta ? Math.round((new Date(desta.agendado_para).getTime() - primeira) / 86400000) : null;
  return dias ? `Follow-up ${etapa - 1} · ${dias} dias depois, se não responder` : `Follow-up ${etapa - 1}`;
}

function CartaoAprovacao({ item, canManage, onDone }) {
  const { prospect, mensagens } = item;
  const info = useMemo(() => calcularChance(prospect), [prospect]);
  const [edicoes, setEdicoes] = useState({});
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');
  const [reprovando, setReprovando] = useState(false);
  const [copiado, setCopiado] = useState('');
  const [verPerfil, setVerPerfil] = useState(false);

  const emails = mensagens.filter((m) => m.canal === 'email');
  const manuais = mensagens.filter((m) => m.canal !== 'email');
  const agenda = reagendarRascunhos(emails);

  const texto = (m, campo) => (edicoes[m.id]?.[campo] ?? m[campo] ?? '');
  const editar = (m, campo, valor) => setEdicoes((e) => ({ ...e, [m.id]: { ...e[m.id], [campo]: valor } }));

  async function executar(acao, mensagemOk) {
    setBusy(true);
    setErro('');
    try {
      await acao();
      onDone(prospect.id, mensagemOk);
    } catch (err) {
      setErro(err?.message || 'Não foi possível salvar.');
      setBusy(false);
    }
  }

  const aprovar = () => executar(
    () => approveDrafts(prospect, emails, edicoes),
    `Sequência de ${prospect.nome} aprovada: a 1ª mensagem sai na próxima rodada de envio (dias úteis, 8h às 18h).`,
  );
  const marcarEnviada = (m) => executar(
    () => markDraftSentManually(prospect, m, edicoes[m.id]),
    `DM para ${prospect.nome} marcada como enviada. Se a pessoa responder, registre no painel.`,
  );
  const reprovar = (motivo) => executar(
    () => rejectProspect(prospect, motivo),
    `${prospect.nome} reprovado (${motivo}). A busca dos próximos dias evita perfis parecidos.`,
  );

  async function copiar(m) {
    try {
      await navigator.clipboard.writeText(texto(m, 'corpo'));
      setCopiado(m.id);
      setTimeout(() => setCopiado(''), 2000);
    } catch {
      setErro('Não consegui copiar. Selecione o texto e copie manualmente.');
    }
  }

  return (
    <div className="hcard space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold text-hagav-white">{prospect.nome}</p>
          <p className="text-xs text-hagav-gray">
            {[prospect.perfil, prospect.nicho, prospect.empresa].filter(Boolean).join(' · ')}
            {prospect.seguidores ? ` · ${Number(prospect.seguidores).toLocaleString('pt-BR')} seguidores` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ChanceBadge info={info} />
          <QuadranteTag info={info} />
          {prospect.momento && (
            <span className="text-[11px] px-2 py-0.5 rounded-full border border-hagav-border text-hagav-light">
              {MOMENTO_LABELS[prospect.momento] || prospect.momento}
            </span>
          )}
        </div>
      </div>

      {prospect.resumo && <p className="text-sm text-hagav-light leading-relaxed">{prospect.resumo}</p>}
      <FatoresChance info={info} />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {prospect.email && <span className="inline-flex items-center gap-1.5 text-hagav-light"><Mail size={12} /> {prospect.email}</span>}
        {prospect.instagram && (
          <a className="inline-flex items-center gap-1.5 text-hagav-light hover:text-hagav-gold" href={`https://instagram.com/${prospect.instagram}`} target="_blank" rel="noreferrer">
            <Instagram size={12} /> @{prospect.instagram}
          </a>
        )}
        {prospect.fonte_url && (
          <a className="inline-flex items-center gap-1.5 text-hagav-gold" href={prospect.fonte_url} target="_blank" rel="noreferrer">
            Ver onde achei <ExternalLink size={11} />
          </a>
        )}
        <button type="button" className={verPerfil ? 'btn-ghost btn-sm border-hagav-gold/40 text-hagav-gold' : 'btn-ghost btn-sm'} onClick={() => setVerPerfil((v) => !v)}>
          <Eye size={13} /> {verPerfil ? 'Esconder perfil' : 'Ver perfil aqui'}
        </button>
      </div>

      {verPerfil && <PerfilPreview prospect={prospect} />}

      {emails.length > 0 && (
        <div className="space-y-3">
          <p className="text-[11px] uppercase tracking-wider text-hagav-gray">Sequência por email ({emails.length} {emails.length === 1 ? 'mensagem' : 'mensagens'})</p>
          {[...emails].sort((a, b) => a.etapa - b.etapa).map((m) => (
            <div key={m.id} className="rounded-xl border border-hagav-border bg-hagav-surface p-3 space-y-2">
              <p className="text-[11px] text-hagav-gray">{rotuloEtapa(m, agenda)}</p>
              <input
                className="hinput w-full text-sm"
                value={texto(m, 'assunto')}
                onChange={(e) => editar(m, 'assunto', e.target.value)}
                placeholder="Assunto"
                disabled={!canManage || busy}
                aria-label="Assunto do email"
              />
              <textarea
                className="hinput w-full text-sm leading-relaxed"
                rows={linhas(texto(m, 'corpo'))}
                value={texto(m, 'corpo')}
                onChange={(e) => editar(m, 'corpo', e.target.value)}
                disabled={!canManage || busy}
                aria-label="Texto do email"
              />
            </div>
          ))}
        </div>
      )}

      {manuais.map((m) => (
        <div key={m.id} className="rounded-xl border border-hagav-border bg-hagav-surface p-3 space-y-2">
          <p className="text-[11px] text-hagav-gray">
            {m.canal === 'instagram' ? 'DM no Instagram: a equipe envia pelo app (não automatizamos DMs)' : `Mensagem por ${m.canal}: envio manual`}
          </p>
          <textarea
            className="hinput w-full text-sm leading-relaxed"
            rows={linhas(texto(m, 'corpo'), 4)}
            value={texto(m, 'corpo')}
            onChange={(e) => editar(m, 'corpo', e.target.value)}
            disabled={!canManage || busy}
            aria-label="Texto da mensagem"
          />
          {canManage && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-ghost btn-sm" onClick={() => copiar(m)} disabled={busy}>
                {copiado === m.id ? <Check size={13} /> : <Copy size={13} />} {copiado === m.id ? 'Copiado' : 'Copiar texto'}
              </button>
              {m.canal === 'instagram' && prospect.instagram && (
                <a className="btn-ghost btn-sm" href={`https://ig.me/m/${prospect.instagram}`} target="_blank" rel="noreferrer">
                  <Instagram size={13} /> Abrir conversa
                </a>
              )}
              <button type="button" className="btn-gold btn-sm" onClick={() => marcarEnviada(m)} disabled={busy}>
                <Send size={13} /> Já enviei
              </button>
            </div>
          )}
        </div>
      ))}

      {erro && <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{erro}</p>}

      {canManage && (
        <div className="border-t border-hagav-border pt-3">
          {reprovando ? (
            <div className="space-y-2">
              <p className="text-xs text-hagav-light">Por que reprovar? (ajuda a busca a acertar mais)</p>
              <div className="flex flex-wrap gap-2">
                {MOTIVOS_REPROVACAO.map((motivo) => (
                  <button key={motivo} type="button" className="btn-ghost btn-sm" onClick={() => reprovar(motivo)} disabled={busy}>{motivo}</button>
                ))}
                <button type="button" className="btn-ghost btn-sm text-hagav-gray" onClick={() => setReprovando(false)} disabled={busy}>Voltar</button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {emails.length > 0 && (
                <button type="button" className="btn-gold btn-sm" onClick={aprovar} disabled={busy || !prospect.email}>
                  <ThumbsUp size={13} /> {busy ? 'Salvando...' : 'Aprovar e agendar'}
                </button>
              )}
              <button type="button" className="btn-ghost btn-sm" onClick={() => setReprovando(true)} disabled={busy}>
                <ThumbsDown size={13} /> Reprovar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AprovacaoView({ drafts, canManage, onChanged }) {
  const [feitos, setFeitos] = useState([]);
  const ordenados = useMemo(
    () => drafts
      .filter((d) => !feitos.includes(d.prospect.id))
      .map((d) => ({ ...d, chance: calcularChance(d.prospect).chance }))
      .sort((a, b) => b.chance - a.chance),
    [drafts, feitos],
  );

  function concluir(id, mensagem) {
    setFeitos((f) => [...f, id]);
    onChanged(mensagem);
  }

  if (!ordenados.length) {
    return (
      <EmptyState
        icon={ThumbsUp}
        title="Nada para aprovar"
        description="Quando a busca encontrar novos prospects, as mensagens aparecem aqui para você aprovar ou reprovar antes de sair qualquer envio."
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className={classNames('text-xs text-hagav-gray')}>
        Ordenados pela chance de fechar. Nada é enviado sem aprovação: emails aprovados entram na fila (até 10 por dia, dias úteis);
        DMs do Instagram você envia pelo app e marca aqui.
      </p>
      {ordenados.map((item) => (
        <CartaoAprovacao key={item.prospect.id} item={item} canManage={canManage} onDone={concluir} />
      ))}
    </div>
  );
}
